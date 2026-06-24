-- round-77b-correct-supplier-payment-fk-order.sql
--
-- 2026-06-24. Correcting a part-paid order failed with:
--   "update or delete on table transactions violates foreign key constraint
--    purchase_order_payments_transaction_id_fkey on table purchase_order_payments"
--
-- Cause: reverse_transaction() hard-DELETEs the transaction row, and
-- purchase_order_payments.transaction_id references transactions(id) with
-- ON DELETE NO ACTION. correct_supplier_payment() reversed (deleted) the
-- transactions FIRST and deleted the purchase_order_payments rows AFTER, so the
-- still-referencing payment rows blocked the transaction deletes. This is a
-- pre-existing ordering bug for ANY part-paid correction (round-75a part-payments
-- made it reachable); it is not EUR-specific.
--
-- Fix: delete the purchase_order_payments rows BEFORE reversing their transactions,
-- so nothing references the transactions when reverse_transaction() deletes them.
-- This is the SAME function we rebuilt in round-77a (8-arg, with p_eur_rate); only
-- the order of the delete vs the reverse loop is swapped. SECURITY INVOKER and the
-- (authenticated, postgres) grants are preserved, exactly as round-77a.
--
-- Rebuilt from the round-77a body; only the two marked blocks changed position.

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
as $function$
declare
  v_status    public.purchase_status;
  v_lot_count int;
  v_txn       record;
begin
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

  -- round-77b: drop the part-payment rows FIRST so nothing references the
  -- transactions when we reverse (hard-delete) them below. (Was after the
  -- reverse loop, which tripped purchase_order_payments_transaction_id_fkey.)
  delete from public.purchase_order_payments
    where purchase_order_id = p_purchase_order_id;

  -- Reverse every purchase-linked ledger line for this order (covers both the
  -- old single-payment line AND any part-payment lines).
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
