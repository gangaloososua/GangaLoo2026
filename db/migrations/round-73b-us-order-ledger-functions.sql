-- round-73b-us-order-ledger-functions.sql
-- Phase 4: post/reverse US-order sale income and supplier cost to the ledger.
-- Mirrors round-54a (post_payroll_advance). Owner/admin gated via auth.uid()
-- -> call via the REGULAR server client, never service-role.
-- USD -> cents; posted against a USD money account.
-- NOTE: function bodies use $FN$ dollar-quoting for safe PowerShell here-strings.

create or replace function public.post_us_order_income(
  p_order_id uuid, p_money_account_id uuid, p_category_id uuid
) returns jsonb language plpgsql security definer set search_path to 'public'
as $FN$
declare
  v_role user_role; v_acct_scope account_scope; v_order public.us_orders%rowtype;
  v_cents bigint; v_txn jsonb; v_txn_id uuid;
begin
  select role into v_role from public.profiles where auth_user_id = auth.uid();
  if v_role is null or v_role not in ('owner','admin') then
    raise exception 'permission denied: only owner/admin can post income' using errcode = '42501';
  end if;
  select * into v_order from public.us_orders where id = p_order_id;
  if not found then raise exception 'US order % not found', p_order_id using errcode='22023'; end if;
  if v_order.income_transaction_id is not null then
    raise exception 'income already posted for this order' using errcode='22023'; end if;
  if p_money_account_id is null then raise exception 'a money account is required' using errcode='22023'; end if;
  if p_category_id is null then raise exception 'an income category is required' using errcode='22023'; end if;
  v_cents := round(coalesce(v_order.total_usd,0) * 100);
  if v_cents <= 0 then raise exception 'order total is zero' using errcode='22023'; end if;
  select scope into v_acct_scope from public.money_accounts where id = p_money_account_id;
  if not found then raise exception 'money account % not found', p_money_account_id using errcode='22023'; end if;
  v_txn := public.post_transaction(jsonb_build_object(
    'money_account_id', p_money_account_id, 'category_id', p_category_id,
    'amount_cents', v_cents, 'scope', v_acct_scope::text, 'occurred_at', now(),
    'description', 'US order ' || left(p_order_id::text,8) || ' — sale'));
  v_txn_id := (v_txn->>'transaction_id')::uuid;
  update public.transactions set source_us_order_id = p_order_id, is_manual = false where id = v_txn_id;
  update public.us_orders set income_transaction_id = v_txn_id where id = p_order_id;
  return jsonb_build_object('ok', true, 'transaction_id', v_txn_id, 'amount_cents', v_cents);
end;
$FN$;

create or replace function public.reverse_us_order_income(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public'
as $FN$
declare v_role user_role; v_txn uuid;
begin
  select role into v_role from public.profiles where auth_user_id = auth.uid();
  if v_role is null or v_role not in ('owner','admin') then raise exception 'permission denied' using errcode='42501'; end if;
  select income_transaction_id into v_txn from public.us_orders where id = p_order_id;
  if not found then raise exception 'US order % not found', p_order_id using errcode='22023'; end if;
  update public.us_orders set income_transaction_id = null where id = p_order_id;
  if v_txn is not null then perform public.reverse_transaction(v_txn); end if;
  return jsonb_build_object('ok', true);
end;
$FN$;

create or replace function public.post_us_order_supplier_cost(
  p_order_id uuid, p_amount_usd numeric, p_money_account_id uuid, p_category_id uuid, p_note text
) returns jsonb language plpgsql security definer set search_path to 'public'
as $FN$
declare
  v_role user_role; v_acct_scope account_scope; v_order public.us_orders%rowtype;
  v_cents bigint; v_txn jsonb; v_txn_id uuid;
begin
  select role into v_role from public.profiles where auth_user_id = auth.uid();
  if v_role is null or v_role not in ('owner','admin') then
    raise exception 'permission denied: only owner/admin can post supplier cost' using errcode='42501'; end if;
  select * into v_order from public.us_orders where id = p_order_id;
  if not found then raise exception 'US order % not found', p_order_id using errcode='22023'; end if;
  if v_order.supplier_transaction_id is not null then
    raise exception 'supplier cost already posted for this order' using errcode='22023'; end if;
  if p_amount_usd is null or p_amount_usd <= 0 then raise exception 'supplier cost must be > 0' using errcode='22023'; end if;
  if p_money_account_id is null then raise exception 'a money account is required' using errcode='22023'; end if;
  if p_category_id is null then raise exception 'an expense category is required' using errcode='22023'; end if;
  v_cents := round(p_amount_usd * 100);
  select scope into v_acct_scope from public.money_accounts where id = p_money_account_id;
  if not found then raise exception 'money account % not found', p_money_account_id using errcode='22023'; end if;
  v_txn := public.post_transaction(jsonb_build_object(
    'money_account_id', p_money_account_id, 'category_id', p_category_id,
    'amount_cents', -v_cents, 'scope', v_acct_scope::text, 'occurred_at', now(),
    'description', 'US order ' || left(p_order_id::text,8) || ' — supplier cost'));
  v_txn_id := (v_txn->>'transaction_id')::uuid;
  update public.transactions set source_us_order_id = p_order_id, is_manual = false where id = v_txn_id;
  update public.us_orders set supplier_transaction_id = v_txn_id, supplier_cost_usd = p_amount_usd,
    internal_notes = coalesce(nullif(btrim(p_note), ''), internal_notes) where id = p_order_id;
  return jsonb_build_object('ok', true, 'transaction_id', v_txn_id, 'amount_cents', v_cents);
end;
$FN$;

create or replace function public.reverse_us_order_supplier_cost(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public'
as $FN$
declare v_role user_role; v_txn uuid;
begin
  select role into v_role from public.profiles where auth_user_id = auth.uid();
  if v_role is null or v_role not in ('owner','admin') then raise exception 'permission denied' using errcode='42501'; end if;
  select supplier_transaction_id into v_txn from public.us_orders where id = p_order_id;
  if not found then raise exception 'US order % not found', p_order_id using errcode='22023'; end if;
  update public.us_orders set supplier_transaction_id = null, supplier_cost_usd = null where id = p_order_id;
  if v_txn is not null then perform public.reverse_transaction(v_txn); end if;
  return jsonb_build_object('ok', true);
end;
$FN$;

revoke all on function public.post_us_order_income(uuid, uuid, uuid) from public;
revoke all on function public.reverse_us_order_income(uuid) from public;
revoke all on function public.post_us_order_supplier_cost(uuid, numeric, uuid, uuid, text) from public;
revoke all on function public.reverse_us_order_supplier_cost(uuid) from public;
grant execute on function public.post_us_order_income(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.reverse_us_order_income(uuid) to authenticated, service_role;
grant execute on function public.post_us_order_supplier_cost(uuid, numeric, uuid, uuid, text) to authenticated, service_role;
grant execute on function public.reverse_us_order_supplier_cost(uuid) to authenticated, service_role;
