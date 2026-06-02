-- round-54b-payroll-advance-date-noon.sql
-- Fix: payroll advances were posting to the ledger at UTC midnight, which at
-- UTC-4 (Dominican Republic) showed up on the PREVIOUS calendar day. Anchor the
-- ledger occurred_at to local NOON (-04) so a timezone offset can never push it
-- across a day boundary. Only the occurred_at line changed vs round-54a.
-- Idempotent (create or replace).

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
as $$
declare
  v_role        user_role;
  v_profile_id  uuid;
  v_acct_scope  account_scope;
  v_emp_name    text;
  v_advance_id  uuid;
  v_txn         jsonb;
  v_txn_id      uuid;
begin
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

  select scope into v_acct_scope
    from public.money_accounts where id = p_money_account_id;
  if not found then
    raise exception 'money account % not found', p_money_account_id using errcode = '22023';
  end if;

  select p.full_name into v_emp_name
    from public.payroll_employees e
    join public.profiles p on p.id = e.profile_id
    where e.id = p_employee_id;
  if v_emp_name is null then
    raise exception 'payroll employee % not found', p_employee_id using errcode = '22023';
  end if;

  insert into public.payroll_advances(
    employee_id, advance_date, amount_cents, note
  ) values (
    p_employee_id, p_advance_date, p_amount_cents,
    nullif(btrim(coalesce(p_note, '')), '')
  ) returning id into v_advance_id;

  v_txn := public.post_transaction(jsonb_build_object(
    'money_account_id', p_money_account_id,
    'category_id',      p_category_id,
    'amount_cents',     -p_amount_cents,
    'scope',            v_acct_scope::text,
    'occurred_at',      ((p_advance_date::text || ' 12:00:00-04')::timestamptz),
    'description',      'Adelanto de nómina — ' || coalesce(v_emp_name, '')
  ));
  v_txn_id := (v_txn->>'transaction_id')::uuid;

  update public.transactions
    set source_payroll_advance_id = v_advance_id,
        is_manual = false
    where id = v_txn_id;

  update public.payroll_advances
    set transaction_id = v_txn_id
    where id = v_advance_id;

  return jsonb_build_object('ok', true, 'advance_id', v_advance_id, 'transaction_id', v_txn_id);
end;
$$;
