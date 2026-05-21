-- Round 22.9: stock adjustment RPC
-- ---------------------------------------------------------------------------
-- adjust_stock(p_payload jsonb) -> jsonb
--
-- Owner/admin only. Records a manual stock adjustment for ONE product at ONE
-- warehouse, atomically. Two directions:
--
--   direction = 'remove'  (damage / theft / loss / count-down)
--     Consumes existing inventory_lots FIFO (oldest received first), exactly
--     like confirm_pos_sale, at each lot's own unit_cost_dop. Writes one
--     'adjustment_out' stock_movements row per lot touched (negative qty).
--     HARD BLOCK: if requested qty > total on hand, raises and rolls back.
--
--   direction = 'add'  (found stock / count-up)
--     Creates a NEW inventory_lots row at a user-supplied unit cost, with a
--     generated lot_number. Writes one 'adjustment_in' stock_movements row
--     (positive qty).
--
-- Payload shape:
--   {
--     "product_id":   uuid,
--     "warehouse_id": uuid,
--     "direction":    "remove" | "add",
--     "qty":          numeric (> 0),
--     "reason":       text         (category, e.g. 'Damaged'; required),
--     "note":         text | null  (optional free text),
--     "unit_cost_dop": numeric     (required for 'add'; ignored for 'remove')
--   }
--
-- The reason category and optional note are combined into
-- stock_movements.adjustment_reason as "Reason — note".
--
-- Returns: { "ok": true, "direction": ..., "qty": ..., "lots_touched": n }
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.adjust_stock(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_product_id   uuid    := (p_payload->>'product_id')::uuid;
  v_warehouse_id uuid    := (p_payload->>'warehouse_id')::uuid;
  v_direction    text    := p_payload->>'direction';
  v_qty          numeric := (p_payload->>'qty')::numeric;
  v_reason       text    := nullif(btrim(p_payload->>'reason'), '');
  v_note         text    := nullif(btrim(p_payload->>'note'), '');
  v_unit_cost    numeric := nullif(p_payload->>'unit_cost_dop','')::numeric;

  v_user_id         uuid := auth.uid();
  v_user_role       user_role;
  v_user_profile_id uuid;

  v_reason_full text;
  v_on_hand     numeric;
  v_remaining   numeric;
  v_lots        record;
  v_take        numeric;
  v_lots_touched int := 0;

  v_new_lot_id uuid;
  v_lot_number text;
BEGIN
  -- 0. Permission gate
  SELECT id, role INTO v_user_profile_id, v_user_role
    FROM profiles WHERE auth_user_id = v_user_id;
  IF v_user_role IS NULL OR v_user_role NOT IN ('owner','admin') THEN
    RAISE EXCEPTION 'permission denied: only owner/admin can adjust stock'
      USING ERRCODE = '42501';
  END IF;

  -- 1. Validation
  IF v_product_id IS NULL THEN
    RAISE EXCEPTION 'product_id is required' USING ERRCODE = '22023';
  END IF;
  IF v_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'warehouse_id is required' USING ERRCODE = '22023';
  END IF;
  IF v_direction NOT IN ('remove','add') THEN
    RAISE EXCEPTION 'direction must be remove or add' USING ERRCODE = '22023';
  END IF;
  IF v_qty IS NULL OR v_qty <= 0 THEN
    RAISE EXCEPTION 'qty must be greater than zero' USING ERRCODE = '22023';
  END IF;
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'reason is required' USING ERRCODE = '22023';
  END IF;

  v_reason_full := v_reason || COALESCE(' — ' || v_note, '');

  -- =========================================================================
  -- REMOVE: FIFO-consume existing lots, hard-block on insufficient stock.
  -- =========================================================================
  IF v_direction = 'remove' THEN
    -- Lock the product's lots at this warehouse (row locks), then total the
    -- on hand separately. FOR UPDATE cannot be combined with an aggregate, so
    -- this is two steps: lock, then sum.
    PERFORM 1
      FROM inventory_lots
      WHERE product_id = v_product_id
        AND warehouse_id = v_warehouse_id
      FOR UPDATE;

    SELECT COALESCE(SUM(qty_remaining), 0) INTO v_on_hand
      FROM inventory_lots
      WHERE product_id = v_product_id
        AND warehouse_id = v_warehouse_id;

    IF v_on_hand < v_qty THEN
      RAISE EXCEPTION 'insufficient_stock: tried to remove % but only % on hand',
        v_qty, v_on_hand USING ERRCODE = '22023';
    END IF;

    v_remaining := v_qty;
    FOR v_lots IN
      SELECT id, qty_remaining, unit_cost_dop
        FROM inventory_lots
        WHERE product_id = v_product_id
          AND warehouse_id = v_warehouse_id
          AND qty_remaining > 0
        ORDER BY received_at ASC, created_at ASC, id ASC
        FOR UPDATE
    LOOP
      EXIT WHEN v_remaining <= 0;
      v_take := LEAST(v_remaining, v_lots.qty_remaining);
      IF v_take > 0 THEN
        UPDATE inventory_lots
          SET qty_remaining = qty_remaining - v_take
          WHERE id = v_lots.id;

        INSERT INTO stock_movements (
          product_id, warehouse_id, lot_id, kind, qty_delta,
          unit_cost_dop, adjustment_reason, created_by, occurred_at
        ) VALUES (
          v_product_id, v_warehouse_id, v_lots.id, 'adjustment_out', -v_take,
          v_lots.unit_cost_dop, v_reason_full, v_user_profile_id, now()
        );

        v_remaining := v_remaining - v_take;
        v_lots_touched := v_lots_touched + 1;
      END IF;
    END LOOP;

    -- Should not happen given the on-hand check, but guard anyway.
    IF v_remaining > 0 THEN
      RAISE EXCEPTION 'insufficient_stock_during_consume: % left unconsumed', v_remaining
        USING ERRCODE = '22023';
    END IF;

  -- =========================================================================
  -- ADD: create a new lot at the supplied unit cost.
  -- =========================================================================
  ELSE
    IF v_unit_cost IS NULL OR v_unit_cost < 0 THEN
      RAISE EXCEPTION 'unit_cost_dop is required and must be >= 0 when adding stock'
        USING ERRCODE = '22023';
    END IF;

    v_lot_number := 'ADJ-' || to_char(now(), 'YYYYMMDD-HH24MISS')
                    || '-' || substr(gen_random_uuid()::text, 1, 4);

    INSERT INTO inventory_lots (
      product_id, warehouse_id, lot_number,
      qty_received, qty_remaining, unit_cost_dop, received_at
    ) VALUES (
      v_product_id, v_warehouse_id, v_lot_number,
      v_qty, v_qty, v_unit_cost, now()
    )
    RETURNING id INTO v_new_lot_id;

    INSERT INTO stock_movements (
      product_id, warehouse_id, lot_id, kind, qty_delta,
      unit_cost_dop, adjustment_reason, created_by, occurred_at
    ) VALUES (
      v_product_id, v_warehouse_id, v_new_lot_id, 'adjustment_in', v_qty,
      v_unit_cost, v_reason_full, v_user_profile_id, now()
    );

    v_lots_touched := 1;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'direction', v_direction,
    'qty', v_qty,
    'lots_touched', v_lots_touched
  );
END;
$function$;
