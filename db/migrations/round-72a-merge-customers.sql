-- round-72a-merge-customers.sql
--
-- merge_customers(p_keep, p_retire, p_final_name, p_dry_run)
--
-- Merges a duplicate customer (e.g. an old in-store/till "customers" record and
-- the same person's later online/Club signup) into ONE surviving profile.
-- Customers are profiles rows with role='customer'.
--
-- What it does (when p_dry_run = false):
--   * Re-points every CUSTOMER reference from p_retire -> p_keep:
--       sales.customer_id, member_cards.customer_id,
--       payment_receipts.customer_id, discount_rules.scope_customer_id
--   * Merges the profile onto the survivor: adds bonus_points together; keeps
--     Club membership if EITHER had it; keeps the survivor's club_member_no (or
--     the retired one's if the survivor had none); takes the earliest
--     club_joined_at; fills any BLANK survivor field (phone/email/birthday/
--     document_id/address/city/rnc/customer_type) from the retired record;
--     keeps the larger credit_limit_cents.
--   * Records a traceability line in the survivor's notes (including the retired
--     record's legacy_source:legacy_id and any old notes).
--   * Retires the duplicate: DELETES it if it had no login (auth_user_id is
--     null); otherwise DEACTIVATES it (is_active=false, name prefixed [MERGED])
--     and the leftover Supabase Auth user must be removed by hand.
--
-- Safety:
--   * Defaults to p_dry_run = true -> only PREVIEWS (returns counts + the final
--     profile preview) and changes nothing. Pass false to commit.
--   * Refuses unless BOTH rows are role='customer'.
--   * Aborts if the retire record was ever used as a seller (sales.seller_id).
--   * Runs as a single atomic statement, so any error rolls the whole merge back.
--
-- IMPORTANT (the bug this version fixes): profiles has a UNIQUE constraint
-- ux_profiles_legacy on (legacy_source, legacy_id). An earlier draft copied
-- those columns onto the survivor, which collided with the retired row before
-- it was deleted ("duplicate key value violates unique constraint
-- ux_profiles_legacy"). This version does NOT copy legacy_source/legacy_id onto
-- the survivor; it folds that reference into notes instead.
--
-- Usage:
--   select public.merge_customers('KEEP-uuid','RETIRE-uuid','Final Name', true);   -- preview
--   select public.merge_customers('KEEP-uuid','RETIRE-uuid','Final Name', false);  -- commit
--
-- First applied live: 2026-06-17. First real merge: Suleyki (in-store, deleted)
-- -> Suleyki Derisma (online, GL-000002); 2 sales moved.

create or replace function public.merge_customers(
  p_keep       uuid,
  p_retire     uuid,
  p_final_name text    default null,
  p_dry_run    boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_keep   profiles%rowtype;
  v_retire profiles%rowtype;
  v_sales int; v_cards int; v_receipts int; v_rules int; v_seller_refs int;
  v_final_name text; v_retire_method text; v_merge_note text;
begin
  if p_keep is null or p_retire is null then
    raise exception 'merge_customers: both p_keep and p_retire are required';
  end if;
  if p_keep = p_retire then
    raise exception 'merge_customers: p_keep and p_retire must be different';
  end if;

  select * into v_keep   from profiles where id = p_keep   for update;
  if not found then raise exception 'merge_customers: keep profile % not found', p_keep; end if;
  select * into v_retire from profiles where id = p_retire for update;
  if not found then raise exception 'merge_customers: retire profile % not found', p_retire; end if;

  if v_keep.role::text <> 'customer' or v_retire.role::text <> 'customer' then
    raise exception 'merge_customers: both must be role=customer (keep=%, retire=%)', v_keep.role, v_retire.role;
  end if;

  select count(*) into v_seller_refs from sales where seller_id = p_retire;
  if v_seller_refs > 0 then
    raise exception 'merge_customers: retire profile % appears as seller on % sale(s); aborting', p_retire, v_seller_refs;
  end if;

  select count(*) into v_sales    from sales            where customer_id      = p_retire;
  select count(*) into v_cards     from member_cards     where customer_id      = p_retire;
  select count(*) into v_receipts  from payment_receipts where customer_id      = p_retire;
  select count(*) into v_rules     from discount_rules   where scope_customer_id = p_retire;

  v_final_name    := coalesce(nullif(btrim(p_final_name), ''), v_keep.full_name);
  v_retire_method := case when v_retire.auth_user_id is null then 'delete' else 'deactivate' end;

  if p_dry_run then
    return jsonb_build_object(
      'dry_run', true, 'keep', p_keep, 'retire', p_retire,
      'would_move', jsonb_build_object('sales', v_sales, 'member_cards', v_cards,
        'payment_receipts', v_receipts, 'discount_rules', v_rules),
      'retire_method', v_retire_method,
      'final_profile_preview', jsonb_build_object(
        'full_name', v_final_name,
        'bonus_points', v_keep.bonus_points + v_retire.bonus_points,
        'is_club_member', v_keep.is_club_member or v_retire.is_club_member,
        'club_member_no', coalesce(v_keep.club_member_no, v_retire.club_member_no),
        'phone', coalesce(v_keep.phone, v_retire.phone),
        'email', coalesce(v_keep.email, v_retire.email)));
  end if;

  -- ===== real merge =====
  update sales            set customer_id       = p_keep where customer_id       = p_retire;
  update member_cards     set customer_id       = p_keep where customer_id       = p_retire;
  update payment_receipts set customer_id       = p_keep where customer_id       = p_retire;
  update discount_rules   set scope_customer_id = p_keep where scope_customer_id = p_retire;

  -- build a traceability note (legacy ref + any old notes) WITHOUT copying the
  -- unique legacy_source/legacy_id columns onto the survivor
  v_merge_note := '[merged ' || p_retire::text || ' on ' || now()::date || ']'
    || case when coalesce(v_retire.legacy_source,'') <> '' or coalesce(v_retire.legacy_id,'') <> ''
            then ' legacy=' || coalesce(v_retire.legacy_source,'') || ':' || coalesce(v_retire.legacy_id,'')
            else '' end
    || case when coalesce(btrim(v_retire.notes),'') <> '' then ' | ' || v_retire.notes else '' end;

  update profiles set
    full_name          = v_final_name,
    bonus_points       = bonus_points + v_retire.bonus_points,
    is_club_member     = is_club_member or v_retire.is_club_member,
    club_tier          = case when club_tier::text = 'none' then v_retire.club_tier else club_tier end,
    club_member_no     = coalesce(club_member_no, v_retire.club_member_no),
    club_joined_at     = least(club_joined_at, v_retire.club_joined_at),
    phone              = coalesce(phone, v_retire.phone),
    email              = coalesce(email, v_retire.email),
    birthday           = coalesce(birthday, v_retire.birthday),
    document_id        = coalesce(document_id, v_retire.document_id),
    address            = coalesce(address, v_retire.address),
    city               = coalesce(city, v_retire.city),
    rnc                = coalesce(rnc, v_retire.rnc),
    customer_type      = coalesce(customer_type, v_retire.customer_type),
    credit_limit_cents = greatest(credit_limit_cents, v_retire.credit_limit_cents),
    notes              = case when coalesce(btrim(notes),'') = '' then v_merge_note
                              else notes || E'\n' || v_merge_note end,
    updated_at         = now()
  where id = p_keep;

  if v_retire.auth_user_id is null then
    delete from profiles where id = p_retire;
  else
    update profiles set is_active = false, full_name = '[MERGED] ' || full_name, updated_at = now()
    where id = p_retire;
  end if;

  return jsonb_build_object('ok', true, 'dry_run', false, 'kept', p_keep, 'retired', p_retire,
    'retire_method', case when v_retire.auth_user_id is null then 'deleted' else 'deactivated' end,
    'moved', jsonb_build_object('sales', v_sales, 'member_cards', v_cards,
      'payment_receipts', v_receipts, 'discount_rules', v_rules),
    'final_full_name', v_final_name, 'points_total', v_keep.bonus_points + v_retire.bonus_points);
end;
$func$;

revoke all on function public.merge_customers(uuid, uuid, text, boolean) from public;
