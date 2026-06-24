-- round-77d-correct-supplier-payment-definer.sql
--
-- 2026-06-24. Root cause of the persistent FK error when correcting a part-paid
-- order, finally pinned down via the raw PG error (code 23503):
--   "Key (id)=(<txn>) is still referenced from table purchase_order_payments"
--
-- correct_supplier_payment was SECURITY INVOKER. purchase_order_payments has RLS
-- enabled with ONLY a SELECT policy (pop_select_staff) and NO delete/insert/update
-- policy. So the function's `delete from purchase_order_payments` matched ZERO rows
-- (silently, under the caller's RLS), leaving the payment row in place. Then the
-- SECURITY DEFINER reverse_transaction() (which bypasses RLS) deleted the
-- transaction and tripped the FK. Its siblings add_supplier_payment /
-- remove_supplier_payment never hit this because they are SECURITY DEFINER and
-- bypass RLS; correct_supplier_payment was the lone INVOKER writer.
--
-- Fix: bring it in line with its siblings — SECURITY DEFINER + locked search_path
-- + an internal owner/admin gate (same pattern as add_supplier_payment and
-- reverse_transaction). Now its delete runs with the same authority as the
-- reversal it is paired with, so the payment row is actually removed before the
-- transaction is deleted. Body is otherwise the round-77c version unchanged
-- (delete-before-reverse, clear stray refs, EUR rate forwarded).
--
-- Signature unchanged (8-arg). Re-grant exactly (authenticated, postgres).

begin;

drop function if exists public.correct_supplier_payment(
  uuid, numeric, numeric, numeric, uuid, timestamptz, uuid, numeric
);

create function public.correct_supplier_payment(
  p_purchase_order_id uuid,
  p_dop_paid_total numeric,
  p_exchange_rate numeric,
  p_official_rate_at_payment numeric,
  p_supplier_payment_account_id uuid,
  p_paid_at_dop timestamptz default now(),
  p_category_id uuid default null,
  p_eur_rate numeric default null            -- round-77a: DOP per EUR
)
returns void
language plpgsql
security definer                              -- round-77d: bypass RLS like its siblings
set search_path to 'public'
as $function$
declare
  v_role      user_role;
  v_status    public.purchase_status;
  v_lot_count int;
  v_txn       record;
begin
  -- round-77d: owner/admin gate (mirrors add_supplier_payment / reverse_transaction)
  select role into v_role
    from public.profiles
    where auth_user_id = auth.uid();
  if v_role is null or v_role not in ('owner','admin') then
    raise exception 'permission denied: only owner/admin can correct supplier payments'
      using errcode = '42501';
  end if;

  if p_dop_paid_total is null or p_dop_paid_total <= 0 then
    raise exception 'dop_paid_total must be > 0 (got %)', p_dop_paid_total;
  end if;
  if p_exchange_rate is null or p_exchange_rate <= 0 then
    raise exception 'exchange_rate must be > 0 (got %)', p_exchange_rate;
  end if;

  select status into v_status
    from public.purchase_orders
    where id = p_purchase_order_id;
  if not found then
    raise exception 'purchase order % not found', p_purchase_order_id;
  end if;
  if v_status <> 'paid_supplier' then
    raise exception 'cannot correct payment: order % is in status %, expected paid_supplier',
                    p_purchase_order_id, v_status;
  end if;

  select count(*) into v_lot_count
    from public.inventory_lots il
    join public.purchase_order_items poi on poi.id = il.purchase_order_item_id
    where poi.purchase_order_id = p_purchase_order_id;
  if v_lot_count > 0 then
    raise exception
      'cannot correct payment: % inventory lot(s) already received for order %; corrections are only allowed before any stock is received',
      v_lot_count, p_purchase_order_id;
  end if;

  -- Clear EVERY reference to this order's transactions BEFORE reversing them.
  -- Now runs as definer, so RLS cannot silently no-op this delete.
  delete from public.purchase_order_payments
    where transaction_id in (
      select id from public.transactions
      where source_purchase_order_id = p_purchase_order_id
    )
       or purchase_order_id = p_purchase_order_id;

  update public.purchase_order_payments
    set transaction_id = null
    where transaction_id in (
      select id from public.transactions
      where source_purchase_order_id = p_purchase_order_id
    );

  -- Reverse every purchase-linked ledger line for this order.
  for v_txn in
    select id
      from public.transactions
      where source_purchase_order_id = p_purchase_order_id
  loop
    perform public.reverse_transaction(v_txn.id);
  end loop;

  -- Re-run the allocation with the corrected single payment (posts one fresh line).
  -- round-77a: forward the DOP-per-EUR rate so a EUR account deducts euros, not pesos.
  perform public._allocate_supplier_payment(
    p_purchase_order_id,
    p_dop_paid_total,
    p_exchange_rate,
    p_official_rate_at_payment,
    p_supplier_payment_account_id,
    p_paid_at_dop,
    p_category_id,
    p_eur_rate
  );
end;
$function$;

grant execute on function public.correct_supplier_payment(
  uuid, numeric, numeric, numeric, uuid, timestamptz, uuid, numeric
) to authenticated, postgres;

commit;
