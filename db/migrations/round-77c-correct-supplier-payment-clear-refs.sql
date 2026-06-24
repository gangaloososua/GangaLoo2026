-- round-77c-correct-supplier-payment-clear-refs.sql
--
-- 2026-06-24. Follow-up to 77b. Correcting a part-paid order still hit
--   purchase_order_payments_transaction_id_fkey
-- even after reordering delete-before-reverse. The data for the affected order
-- showed exactly one transaction and one payment row pointing at it, both
-- belonging to this order — so a plain "delete payments by order id, then
-- reverse" is logically sufficient. To make this bulletproof against stale /
-- linked references (and not depend on delete scoping by order id), this version:
--
--   (a) deletes purchase_order_payments by the TRANSACTION ids about to be
--       reversed (catches any row pointing at this order's transactions), AND
--   (b) defensively NULLs purchase_order_payments.transaction_id for any row
--       still referencing those transactions,
--
-- both BEFORE the reverse loop. reverse_transaction() hard-deletes the
-- transaction, and the FK is ON DELETE NO ACTION, so every reference must be
-- gone first. Same 8-arg signature, SECURITY INVOKER, (authenticated, postgres)
-- grants — only the cleanup block before the reverse loop changed. EUR forwarding
-- (round-77a) is unchanged.

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

  -- round-77c: clear EVERY reference to this order's transactions BEFORE the
  -- reverse loop hard-deletes them (FK is ON DELETE NO ACTION).
  --
  -- (a) delete part-payment rows by the transactions they point at (covers any
  --     row pointing at this order's transactions, regardless of its own order id),
  --     plus the by-order rows for completeness.
  delete from public.purchase_order_payments
    where transaction_id in (
      select id from public.transactions
      where source_purchase_order_id = p_purchase_order_id
    )
       or purchase_order_id = p_purchase_order_id;

  -- (b) belt-and-suspenders: null out any straggler reference that somehow remains.
  update public.purchase_order_payments
    set transaction_id = null
    where transaction_id in (
      select id from public.transactions
      where source_purchase_order_id = p_purchase_order_id
    );

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
