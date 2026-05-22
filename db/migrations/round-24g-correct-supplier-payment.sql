-- ============================================================================
-- Round 24g: Correct a supplier payment on an already-paid order.
--
-- Adds correct_supplier_payment(): lets the owner fix a mistaken supplier
-- payment (wrong amount, rate, account, category, or date) on an order whose
-- status is 'paid_supplier' -- BUT only while NO stock has been received yet.
--
-- Why the no-stock guard: once inventory lots exist (or have been sold), the
-- per-unit landed cost is baked into those lots and into any booked sale COGS.
-- Rewriting landed cost after that would desync inventory and historical
-- profit. So corrections are allowed only before the first receipt; after
-- that the button is hidden and this function refuses as a backstop.
--
-- What it does, atomically:
--   1. Verify the order exists and is 'paid_supplier' (else raise).
--   2. Verify NO inventory_lots exist for any of its lines (else raise).
--   3. Reverse any existing purchase-linked ledger line(s):
--        - orders paid AFTER round 24f have exactly one AUTO line -> reversed
--          (reverse_transaction restores the old account balance + deletes it)
--        - orders paid BEFORE 24f have none -> nothing to reverse (fine)
--   4. Re-run the shared allocation helper with the corrected numbers. The
--      helper recomputes the header (bank fee, status, paid-at) and every
--      line's landed cost, AND posts a fresh ledger line to the (possibly new)
--      account/category when a category is supplied.
--
-- Mirrors mark_paid_supplier's input validation and arg shape; the only
-- difference is the expected starting status (paid_supplier vs pending) and
-- the reverse-old-line step before re-allocating. SECURITY: the ledger
-- reverse/post calls (reverse_transaction / post_transaction) are themselves
-- owner/admin gated, same as every other posting path; the app layer also
-- calls requireOwner() before invoking this.
--
-- Idempotent definition (CREATE OR REPLACE); brand-new name, no prior
-- signature to drop.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.correct_supplier_payment(
  p_purchase_order_id uuid,
  p_dop_paid_total numeric,
  p_exchange_rate numeric,
  p_official_rate_at_payment numeric,
  p_supplier_payment_account_id uuid,
  p_paid_at_dop timestamp with time zone DEFAULT now(),
  p_category_id uuid DEFAULT NULL
)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  v_status    public.purchase_status;
  v_lot_count int;
  v_txn       record;
begin
  -- Input validation (same shape as mark_paid_supplier)
  if p_dop_paid_total is null or p_dop_paid_total <= 0 then
    raise exception 'dop_paid_total must be > 0 (got %)', p_dop_paid_total;
  end if;
  if p_exchange_rate is null or p_exchange_rate <= 0 then
    raise exception 'exchange_rate must be > 0 (got %)', p_exchange_rate;
  end if;

  -- Status guard - must already be paid_supplier
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

  -- Safety guard - refuse if ANY stock has already been received for this
  -- order. Correcting landed cost after receipt would desync inventory/COGS.
  select count(*) into v_lot_count
    from public.inventory_lots il
    join public.purchase_order_items poi on poi.id = il.purchase_order_item_id
    where poi.purchase_order_id = p_purchase_order_id;

  if v_lot_count > 0 then
    raise exception
      'cannot correct payment: % inventory lot(s) already received for order %; corrections are only allowed before any stock is received',
      v_lot_count, p_purchase_order_id;
  end if;

  -- Reverse any existing purchase-linked ledger line(s) for this order.
  -- (0 for pre-24f orders, 1 for orders paid after 24f. Loop handles any count
  -- safely.) reverse_transaction restores the old account balance + deletes
  -- the row.
  for v_txn in
    select id
      from public.transactions
      where source_purchase_order_id = p_purchase_order_id
  loop
    perform public.reverse_transaction(v_txn.id);
  end loop;

  -- Re-run the allocation with the corrected numbers. The shared helper
  -- recomputes the header + every line's landed cost and posts a fresh ledger
  -- line (when a category is supplied) to the corrected account/category.
  perform public._allocate_supplier_payment(
    p_purchase_order_id,
    p_dop_paid_total,
    p_exchange_rate,
    p_official_rate_at_payment,
    p_supplier_payment_account_id,
    p_paid_at_dop,
    p_category_id
  );
end;
$function$;
