-- round-26e2-account-transfers-crosscurrency.sql
-- Revise the account-transfer engine to support CROSS-CURRENCY transfers.
--
-- A transfer now has TWO amounts: how much leaves the source and how much
-- arrives at the destination. For a same-currency transfer they're equal
-- (e.g. -RD$100 / +RD$100); for a cross-currency transfer they differ
-- (e.g. -$100 / +RD$5,900) — the user types the real amounts they got at the
-- exchange. Both legs still use the 'Account Transfers' asset category, so the
-- movement stays out of income/expense reports. (Cross-currency legs are not
-- meant to net to zero in one currency — that's correct: equal value, different
-- numbers.)

-- ---------------------------------------------------------------------------
-- Table: split the single amount into out + in.
-- ---------------------------------------------------------------------------

alter table public.account_transfers
  add column if not exists amount_out_cents bigint,
  add column if not exists amount_in_cents  bigint;

-- Backfill any existing rows (same-currency era: out = in = amount_cents).
update public.account_transfers
   set amount_out_cents = coalesce(amount_out_cents, amount_cents),
       amount_in_cents  = coalesce(amount_in_cents,  amount_cents)
 where amount_out_cents is null or amount_in_cents is null;

-- Enforce going forward (only if not already enforced).
do $guard$
begin
  begin
    alter table public.account_transfers alter column amount_out_cents set not null;
  exception when others then null;
  end;
  begin
    alter table public.account_transfers alter column amount_in_cents set not null;
  exception when others then null;
  end;
end
$guard$;

-- The old single amount_cents column stays (nullable now) for back-compat;
-- new rows leave it null. Drop the old positive-only check if present.
do $dropchk$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.account_transfers'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%amount_cents%'
  loop
    execute format('alter table public.account_transfers drop constraint %I', r.conname);
  end loop;
end
$dropchk$;

alter table public.account_transfers alter column amount_cents drop not null;

-- ---------------------------------------------------------------------------
-- Function: new signature with separate out/in amounts.
-- ---------------------------------------------------------------------------

drop function if exists public.transfer_between_accounts(uuid, uuid, bigint, account_scope, timestamptz, text);

create or replace function public.transfer_between_accounts(
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_amount_out_cents bigint,
  p_amount_in_cents bigint,
  p_scope account_scope,
  p_occurred_at timestamptz default now(),
  p_description text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $xfer$
declare
  v_me        uuid;
  v_role      user_role;
  v_cat       uuid := 'e9e42787-320e-40f4-98a8-008aa9379ef8';  -- Account Transfers (asset)
  v_transfer  uuid;
  v_from_name text;
  v_to_name   text;
  v_desc      text;
  v_out       jsonb;
  v_in        jsonb;
  v_when      timestamptz := coalesce(p_occurred_at, now());
begin
  select id, role into v_me, v_role
  from profiles where auth_user_id = auth.uid();
  if v_role is null or v_role not in ('owner','admin') then
    raise exception 'permission denied: only owner/admin can transfer money'
      using errcode = '42501';
  end if;

  if p_from_account_id is null or p_to_account_id is null then
    raise exception 'both accounts are required' using errcode = '22023';
  end if;
  if p_from_account_id = p_to_account_id then
    raise exception 'source and destination must be different' using errcode = '22023';
  end if;
  if p_amount_out_cents is null or p_amount_out_cents <= 0 then
    raise exception 'amount out must be greater than zero' using errcode = '22023';
  end if;
  if p_amount_in_cents is null or p_amount_in_cents <= 0 then
    raise exception 'amount in must be greater than zero' using errcode = '22023';
  end if;
  if p_scope is null then
    raise exception 'scope is required' using errcode = '22023';
  end if;

  select name into v_from_name from money_accounts where id = p_from_account_id;
  if v_from_name is null then raise exception 'source account not found' using errcode = '22023'; end if;
  select name into v_to_name from money_accounts where id = p_to_account_id;
  if v_to_name is null then raise exception 'destination account not found' using errcode = '22023'; end if;

  v_desc := coalesce(nullif(btrim(p_description), ''),
                     format('Transferencia: %s → %s', v_from_name, v_to_name));

  insert into account_transfers
    (from_account_id, to_account_id, amount_out_cents, amount_in_cents, scope, occurred_at, description, created_by)
  values
    (p_from_account_id, p_to_account_id, p_amount_out_cents, p_amount_in_cents, p_scope, v_when, v_desc, v_me)
  returning id into v_transfer;

  -- Leg 1: money OUT of the source (negative, source-currency amount).
  v_out := post_transaction(jsonb_build_object(
    'money_account_id', p_from_account_id,
    'category_id', v_cat,
    'amount_cents', -p_amount_out_cents,
    'scope', p_scope,
    'occurred_at', v_when,
    'description', v_desc
  ));

  -- Leg 2: money IN to the destination (positive, destination-currency amount).
  v_in := post_transaction(jsonb_build_object(
    'money_account_id', p_to_account_id,
    'category_id', v_cat,
    'amount_cents', p_amount_in_cents,
    'scope', p_scope,
    'occurred_at', v_when,
    'description', v_desc
  ));

  update account_transfers
     set out_transaction_id = (v_out->>'transaction_id')::uuid,
         in_transaction_id  = (v_in->>'transaction_id')::uuid
   where id = v_transfer;

  return (select to_jsonb(t) from account_transfers t where t.id = v_transfer);
end;
$xfer$;

grant execute on function public.transfer_between_accounts(uuid, uuid, bigint, bigint, account_scope, timestamptz, text) to authenticated;
