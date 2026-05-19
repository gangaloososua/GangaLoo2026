-- Round 15.2.3 — mark_cancelled_online
--
-- Cancels an online order. Reverses stock, reverses payments, voids
-- pending commissions, resets the sale row. All in one transaction.
--
-- Guards:
--   - RBAC: owner/admin only
--   - source must be 'online'
--   - tracking_status must NOT be 'delivered' (cannot cancel post-delivery)
--   - sale_status must NOT already be 'cancelled' (idempotency)
--
-- Effects, in order:
--   1. For each sale_lot_consumption row on this sale: restore
--      inventory_lots.qty_remaining (+ qty_consumed), insert a
--      compensating stock_movements row (kind='return_in',
--      qty_delta=+qty_consumed).
--   2. For each existing sale_payments row with amount_cents > 0,
--      insert a compensating negative row (same method + account,
--      reference='CANCEL ' || original.id::text). Reset
--      sales.paid_cents to 0 (no trigger maintains it — verified
--      via information_schema.triggers in 15.2.1).
--   3. UPDATE sale_commissions SET status='void' for pending rows.
--   4. UPDATE sales: status='cancelled', tracking_status='cancelled',
--      cogs_cents=NULL, gross_profit_cents=NULL, refund_reason=p_reason,
--      refunded_at=now(), updated_at=now().
--
-- Does NOT delete any rows: history is preserved. The compensating
-- entries are recoverable.

CREATE OR REPLACE FUNCTION public.mark_cancelled_online(
  p_sale_id uuid,
  p_reason  text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_user_role user_role;
  v_user_profile_id uuid;

  v_source sale_source;
  v_tracking_status text;
  v_sale_status sale_status;

  v_consumption record;
  v_payment record;
  v_sale_item record;
BEGIN
  -- 0. RBAC
  SELECT id, role INTO v_user_profile_id, v_user_role
    FROM profiles WHERE auth_user_id = v_user_id;
  IF v_user_role IS NULL OR v_user_role NOT IN ('owner','admin') THEN
    RAISE EXCEPTION 'permission denied: only owner/admin can cancel online orders'
      USING ERRCODE = '42501';
  END IF;

  -- 1. Load + guards
  SELECT source, tracking_status, status
    INTO v_source, v_tracking_status, v_sale_status
    FROM sales WHERE id = p_sale_id
    FOR UPDATE;   -- lock the sale row until commit

  IF v_source IS NULL THEN
    RAISE EXCEPTION 'sale % not found', p_sale_id USING ERRCODE = 'P0002';
  END IF;
  IF v_source <> 'online' THEN
    RAISE EXCEPTION 'mark_cancelled_online: sale % is not an online order (source=%)',
      p_sale_id, v_source USING ERRCODE = '22023';
  END IF;
  IF v_tracking_status = 'delivered' THEN
    RAISE EXCEPTION 'mark_cancelled_online: sale % is already delivered (cannot cancel)',
      p_sale_id USING ERRCODE = '22023';
  END IF;
  IF v_sale_status = 'cancelled' THEN
    RAISE EXCEPTION 'mark_cancelled_online: sale % is already cancelled',
      p_sale_id USING ERRCODE = '22023';
  END IF;

  -- 2. Reverse stock: per sale_lot_consumption row, restore the lot
  --    and write a compensating return_in stock_movement.
  FOR v_consumption IN
    SELECT slc.id           AS consumption_id,
           slc.lot_id,
           slc.qty_consumed,
           slc.unit_cost_dop,
           slc.sale_item_id,
           si.product_id,
           sa.source_warehouse_id
      FROM sale_lot_consumption slc
      JOIN sale_items si ON si.id = slc.sale_item_id
      JOIN sales      sa ON sa.id = si.sale_id
     WHERE si.sale_id = p_sale_id
  LOOP
    UPDATE inventory_lots
      SET qty_remaining = qty_remaining + v_consumption.qty_consumed
      WHERE id = v_consumption.lot_id;

    INSERT INTO stock_movements (
      product_id, warehouse_id, lot_id, kind, qty_delta,
      unit_cost_dop, sale_item_id, created_by, occurred_at
    ) VALUES (
      v_consumption.product_id,
      v_consumption.source_warehouse_id,
      v_consumption.lot_id,
      'return_in',
      v_consumption.qty_consumed,
      v_consumption.unit_cost_dop,
      v_consumption.sale_item_id,
      v_user_profile_id,
      now()
    );
  END LOOP;

  -- 3. Reverse positive payments with compensating negatives. Skip
  --    rows that are already compensations (amount_cents <= 0) so
  --    the operation is idempotent under repeated guard violations.
  FOR v_payment IN
    SELECT id, method, amount_cents, money_account_id
      FROM sale_payments
     WHERE sale_id = p_sale_id
       AND amount_cents > 0
  LOOP
    INSERT INTO sale_payments (
      sale_id, method, amount_cents, money_account_id, paid_at, reference
    ) VALUES (
      p_sale_id,
      v_payment.method,
      -v_payment.amount_cents,
      v_payment.money_account_id,
      now(),
      'CANCEL ' || v_payment.id::text
    );
  END LOOP;

  -- Reset paid_cents (no trigger maintains it)
  UPDATE sales SET paid_cents = 0 WHERE id = p_sale_id;

  -- 4. Void pending commissions on this sale's items
  UPDATE sale_commissions
    SET status = 'void'
    WHERE status = 'pending'
      AND sale_item_id IN (
        SELECT id FROM sale_items WHERE sale_id = p_sale_id
      );

  -- 5. Mark the sale row cancelled
  UPDATE sales
    SET status            = 'cancelled',
        tracking_status   = 'cancelled',
        cogs_cents        = NULL,
        gross_profit_cents = NULL,
        refund_reason     = p_reason,
        refunded_at       = now(),
        updated_at        = now()
    WHERE id = p_sale_id;
END;
$function$;