-- round-54a-payroll-advance-ledger.sql
-- Sync payroll advances into the accounting ledger as real, reversible money out.
--
-- Mirrors add_supplier_payment / remove_supplier_payment and reuses the generic
-- post_transaction(jsonb) / reverse_transaction(uuid) helpers. An advance posts
-- a NEGATIVE amount_cents (money out) against the chosen money account + expense
-- category. post_transaction does NOT know a payroll source key, so we set the
-- back-reference with a direct UPDATE right after posting (this also keeps the
-- ledger row tied to the advance for tracing). Owner/admin only. CENTS. Additive.

-- 1) Back-reference column on the ledger + a link column on the advance.
alter table public.transactions
  add column if not exists source_payroll_advance_id uuid;
create index if not exists idx_transactions_payroll_advance
  on public.transactions (source_payroll_advance_id);

alter table public.payroll_advances
  add column if not exists transaction_id uuid;

-- 2) Post an advance + its ledger line in one transaction.
create or replace function public.post_payroll_advance(
  p_employee_id      uuid,
  p_advance_date     date,
  p_amount_cents     bigint,
  p_note             text,
  p_money_account_id uuid,
  p_category_id      uuid
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role        user_role;
  v_profile_id  uuid;
  v_acct_scope  account_scope;
  v_emp_name    text;
  v_advance_id  uuid;
  v_txn         jsonb;
  v_txn_id      uuid;
begin
  -- owner/admin gate
  select id, role into v_profile_id, v_role
    from public.profiles where auth_user_id = auth.uid();
  if v_role is null or v_role not in ('owner','admin') then
    raise exception 'permission denied: only owner/admin can record advances'
      using errcode = '42501';
  end if;

  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'advance amount must be > 0' using errcode = '22023';
  end if;
  if p_money_account_id is null then
    raise exception 'a money account is required' using errcode = '22023';
  end if;
  if p_category_id is null then
    raise exception 'an expense category is required' using errcode = '22023';
  end if;

  -- the ledger entry's scope follows the paying account's scope
  select scope into v_acct_scope
    from public.money_accounts where id = p_money_account_id;
  if not found then
    raise exception 'money account % not found', p_money_account_id using errcode = '22023';
  end if;

  -- employee display name (via profile) for the ledger description
  select p.full_name into v_emp_name
    from public.payroll_employees e
    join public.profiles p on p.id = e.profile_id
    where e.id = p_employee_id;
  if v_emp_name is null then
    raise exception 'payroll employee % not found', p_employee_id using errcode = '22023';
  end if;

  -- record the advance row
  insert into public.payroll_advances(
    employee_id, advance_date, amount_cents, note
  ) values (
    p_employee_id, p_advance_date, p_amount_cents,
    nullif(btrim(coalesce(p_note, '')), '')
  ) returning id into v_advance_id;

  -- post money OUT (negative). We pass a recognised source link
  -- (source_purchase_order_id etc.) is NOT applicable here, so this would post
  -- as is_manual; we fix the back-reference + is_manual right after.
  v_txn := public.post_transaction(jsonb_build_object(
    'money_account_id', p_money_account_id,
    'category_id',      p_category_id,
    'amount_cents',     -p_amount_cents,
    'scope',            v_acct_scope::text,
    'occurred_at',      (p_advance_date::timestamptz),
    'description',      'Adelanto de nómina — ' || coalesce(v_emp_name, '')
  ));
  v_txn_id := (v_txn->>'transaction_id')::uuid;

  -- tie the ledger row to the advance, and mark it non-manual (it has a source)
  update public.transactions
    set source_payroll_advance_id = v_advance_id,
        is_manual = false
    where id = v_txn_id;

  update public.payroll_advances
    set transaction_id = v_txn_id
    where id = v_advance_id;

  return jsonb_build_object('ok', true, 'advance_id', v_advance_id, 'transaction_id', v_txn_id);
end;
$function$;

-- 3) Remove an advance + reverse its ledger line.
create or replace function public.remove_payroll_advance(p_advance_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role       user_role;
  v_profile_id uuid;
  v_txn        uuid;
begin
  select id, role into v_profile_id, v_role
    from public.profiles where auth_user_id = auth.uid();
  if v_role is null or v_role not in ('owner','admin') then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  select transaction_id into v_txn
    from public.payroll_advances where id = p_advance_id;
  if not found then
    raise exception 'advance % not found', p_advance_id using errcode = '22023';
  end if;

  -- Delete the advance FIRST (holds the link), then reverse the ledger line.
  delete from public.payroll_advances where id = p_advance_id;
  if v_txn is not null then
    perform public.reverse_transaction(v_txn);
  end if;

  return jsonb_build_object('ok', true);
end;
$function$;

-- The functions self-gate on owner/admin role (and post_transaction does too).
revoke all on function public.post_payroll_advance(uuid, date, bigint, text, uuid, uuid) from public;
revoke all on function public.remove_payroll_advance(uuid) from public;
grant execute on function public.post_payroll_advance(uuid, date, bigint, text, uuid, uuid) to authenticated, service_role;
grant execute on function public.remove_payroll_advance(uuid) to authenticated, service_role;
