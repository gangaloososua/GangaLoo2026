-- Round 89a: settle pre-sold stock automatically when stock arrives.
--
-- Problem: when the register sells a product with no stock, confirm_pos_sale
-- books the shortfall on the oldest lot of that product in that store (or on a
-- new 'RESERVE-AUTO' lot at cost 0 if none exists), pushing it below zero.
-- The stock screens (v_inventory_current) only add up lots ABOVE zero, so when
-- the real item later arrives it shows as free stock, and the sale keeps the
-- placeholder cost (RD$0 or an old purchase cost).
--
-- Fix: whenever a lot's stock goes up (new lot inserted with stock: purchase
-- received, transfer received, adjustment; or an existing lot bumped up), this
-- trigger first covers that product's BELOW-ZERO lots in the SAME store:
--   * it moves the pre-sold units (sale_lot_consumption + the matching
--     'sale_out' stock_movement) onto the arriving lot, at the arriving lot's cost,
--   * fixes sale_items.cogs_cents and sales.cogs_cents / gross_profit_cents,
--   * raises the below-zero lot back toward 0 and lowers the arriving lot.
-- Oldest below-zero lot first. Within a lot, the most recent consumption rows
-- are the overdrawn ones; on a partial arrival the OLDEST of those are settled
-- first. Cancelled / refunded / draft sales are ignored. Commissions are not
-- touched (they are based on the selling price, not cost).
-- Reverse a mistake by hand (no automatic undo).

CREATE OR REPLACE FUNCTION public._settle_negative_lots()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_available numeric;
  v_new_cost numeric;
  v_neg record;
  v_deficit numeric;
  v_settle numeric;
  v_skip numeric;
  v_left numeric;
  v_moved numeric;
  v_row record;
  v_in_row numeric;
  v_move numeric;
  v_delta_cents int;
  v_mv record;
BEGIN
  -- Only when stock on this lot went UP and is now above zero.
  IF NEW.qty_remaining IS NULL OR NEW.qty_remaining <= 0 THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.qty_remaining <= COALESCE(OLD.qty_remaining, 0) THEN
    RETURN NULL;
  END IF;

  -- Re-read the arriving lot (locked) so we use its current numbers.
  SELECT qty_remaining, unit_cost_dop INTO v_available, v_new_cost
    FROM inventory_lots WHERE id = NEW.id FOR UPDATE;
  IF v_available IS NULL OR v_available <= 0 THEN
    RETURN NULL;
  END IF;

  FOR v_neg IN
    SELECT id, qty_remaining
      FROM inventory_lots
     WHERE product_id = NEW.product_id
       AND warehouse_id = NEW.warehouse_id
       AND id <> NEW.id
       AND qty_remaining < 0
     ORDER BY received_at ASC, created_at ASC, id ASC
     FOR UPDATE
  LOOP
    EXIT WHEN v_available <= 0;

    v_deficit := -v_neg.qty_remaining;
    v_settle  := LEAST(v_deficit, v_available);
    v_skip    := v_deficit - v_settle;  -- newest overdrawn units that keep waiting
    v_left    := v_settle;

    FOR v_row IN
      SELECT c.id, c.sale_item_id, c.qty_consumed, c.unit_cost_dop, si.sale_id
        FROM sale_lot_consumption c
        JOIN sale_items si ON si.id = c.sale_item_id
        JOIN sales s       ON s.id  = si.sale_id
       WHERE c.lot_id = v_neg.id
         AND c.qty_consumed > 0
         AND s.status::text NOT IN ('cancelled', 'refunded', 'draft')
       ORDER BY c.created_at DESC, c.id DESC
    LOOP
      EXIT WHEN v_left <= 0;

      IF v_skip >= v_row.qty_consumed THEN
        v_skip := v_skip - v_row.qty_consumed;
        CONTINUE;
      END IF;
      v_in_row := v_row.qty_consumed - v_skip;
      v_skip := 0;
      v_move := LEAST(v_in_row, v_left);

      -- 1. consumption row -> arriving lot (split if only part moves)
      IF v_move >= v_row.qty_consumed THEN
        UPDATE sale_lot_consumption
           SET lot_id = NEW.id, unit_cost_dop = v_new_cost
         WHERE id = v_row.id;
      ELSE
        UPDATE sale_lot_consumption
           SET qty_consumed = qty_consumed - v_move
         WHERE id = v_row.id;
        INSERT INTO sale_lot_consumption (sale_item_id, lot_id, qty_consumed, unit_cost_dop)
        VALUES (v_row.sale_item_id, NEW.id, v_move, v_new_cost);
      END IF;

      -- 2. the matching 'sale_out' movement -> arriving lot (split if needed)
      SELECT id, qty_delta, occurred_at, created_by, created_at INTO v_mv
        FROM stock_movements
       WHERE sale_item_id = v_row.sale_item_id
         AND lot_id = v_neg.id
         AND kind = 'sale_out'
         AND qty_delta < 0
       ORDER BY qty_delta ASC, created_at ASC
       LIMIT 1;
      IF FOUND THEN
        IF -v_mv.qty_delta <= v_move THEN
          UPDATE stock_movements
             SET lot_id = NEW.id, unit_cost_dop = v_new_cost
           WHERE id = v_mv.id;
        ELSE
          UPDATE stock_movements
             SET qty_delta = qty_delta + v_move
           WHERE id = v_mv.id;
          INSERT INTO stock_movements (
            product_id, warehouse_id, lot_id, kind, qty_delta,
            unit_cost_dop, sale_item_id, created_by, occurred_at, created_at
          ) VALUES (
            NEW.product_id, NEW.warehouse_id, NEW.id, 'sale_out', -v_move,
            v_new_cost, v_row.sale_item_id, v_mv.created_by, v_mv.occurred_at, v_mv.created_at
          );
        END IF;
      END IF;

      -- 3. cost + profit of the sale
      v_delta_cents := ROUND(v_move * v_new_cost * 100)::int
                     - ROUND(v_move * COALESCE(v_row.unit_cost_dop, 0) * 100)::int;
      IF v_delta_cents <> 0 THEN
        UPDATE sale_items
           SET cogs_cents = COALESCE(cogs_cents, 0) + v_delta_cents
         WHERE id = v_row.sale_item_id;
        UPDATE sales
           SET cogs_cents = COALESCE(cogs_cents, 0) + v_delta_cents,
               gross_profit_cents = COALESCE(gross_profit_cents, 0) - v_delta_cents
         WHERE id = v_row.sale_id;
      END IF;

      v_left := v_left - v_move;
    END LOOP;

    -- 4. lot counts
    v_moved := v_settle - v_left;
    IF v_moved > 0 THEN
      UPDATE inventory_lots SET qty_remaining = qty_remaining + v_moved WHERE id = v_neg.id;
      UPDATE inventory_lots SET qty_remaining = qty_remaining - v_moved WHERE id = NEW.id;
      v_available := v_available - v_moved;
    END IF;
  END LOOP;

  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_settle_negative_lots ON public.inventory_lots;
CREATE TRIGGER trg_settle_negative_lots
  AFTER INSERT OR UPDATE OF qty_remaining ON public.inventory_lots
  FOR EACH ROW
  EXECUTE FUNCTION public._settle_negative_lots();
