-- round-39-noninventory-products-02-confirm-pos-sale.sql
--
-- Patches confirm_pos_sale so non-inventory (service) products bypass the
-- whole FIFO/lot/COGS/stock_movements block. All other behaviour is
-- byte-for-byte identical to round-25o (optional payment).
--
-- Surgical changes:
--   * new local v_is_inventory boolean
--   * v_item_cogs_cents is initialized to 0 BEFORE the (now optional) FIFO
--     block so non-inventory items still write cogs_cents = 0 to sale_items
--   * one SELECT looks up the flag per item
--   * the FIFO block (consumption setup, lots walk, no-lots error, overshoot,
--     apply loop) is wrapped in IF v_is_inventory THEN ... END IF
--   * commission, sale_items insert, discount audit, ledger posting, paid
--     status logic — ALL unchanged
--
-- Verified pre-condition: this function is the round-25o version. Diff vs
-- round-25o is mechanical and confined to the per-item loop.

create or replace function public.confirm_pos_sale(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $cps$
DECLARE
  v_customer_id uuid := nullif(p_payload->>'customer_id','')::uuid;
  v_seller_id uuid := nullif(p_payload->>'seller_id','')::uuid;
  v_source_warehouse_id uuid := (p_payload->>'source_warehouse_id')::uuid;
  v_fulfillment_warehouse_id uuid := (p_payload->>'fulfillment_warehouse_id')::uuid;
  v_fulfillment_method fulfillment_method
    := (p_payload->>'fulfillment_method')::fulfillment_method;
  v_sale_discount_cents int := COALESCE((p_payload->>'discount_cents')::int, 0);
  v_items jsonb := COALESCE(p_payload->'items', '[]'::jsonb);
  v_payments jsonb := COALESCE(p_payload->'payments', '[]'::jsonb);
  v_user_id uuid := auth.uid();
  v_user_role user_role;
  v_user_profile_id uuid;

  v_item jsonb;
  v_payment jsonb;
  v_sale_id uuid;
  v_sale_item_id uuid;
  v_invoice_number text;
  v_next_seq bigint;
  v_subtotal_cents int := 0;
  v_paid_cents int := 0;
  v_total_cents int;
  v_total_cogs_cents int := 0;
  v_item_cogs_cents int;
  v_status sale_status;

  v_product_id uuid;
  v_qty_needed numeric;
  v_line_unit_price_cents int;
  v_line_discount_cents int;
  v_line_total_cents int;
  v_commission_percent numeric;
  v_commission_amount_cents int;
  v_seller_override numeric;
  v_product_default_pct numeric;
  v_lots record;
  v_qty_to_take numeric;
  v_qty_remaining numeric;
  v_first_lot_id uuid;
  v_first_lot_unit_cost numeric;
  v_lot_key text;
  v_consumption_map jsonb;
  v_consumption_row record;
  v_lot_id_local uuid;
  v_qty_local numeric;
  v_cost_local numeric;
  v_cogs_local int;

  v_breakdown jsonb;
  v_breakdown_entry jsonb;

  v_shop_sales_category_id constant uuid
    := '870f61ba-ac8c-47bf-9ed0-52e935a78136';
  v_pay_row record;

  -- Round 39: per-item inventory flag.
  v_is_inventory boolean;
BEGIN
  SELECT id, role INTO v_user_profile_id, v_user_role
    FROM profiles WHERE auth_user_id = v_user_id;
  IF v_user_role IS NULL
     OR v_user_role NOT IN ('owner','admin','seller') THEN
    RAISE EXCEPTION 'permission denied: only owner/admin/seller can ring up POS sales'
      USING ERRCODE = '42501';
  END IF;

  IF v_seller_id IS NULL THEN
    RAISE EXCEPTION 'seller_id is required' USING ERRCODE = '22023';
  END IF;
  IF v_source_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'source_warehouse_id is required' USING ERRCODE = '22023';
  END IF;
  IF v_fulfillment_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'fulfillment_warehouse_id is required' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(v_items) < 1 THEN
    RAISE EXCEPTION 'at least one item is required' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    v_subtotal_cents := v_subtotal_cents
      + (((v_item->>'qty')::numeric * (v_item->>'unit_price_cents')::int)::int
         - COALESCE((v_item->>'discount_cents')::int, 0));
  END LOOP;

  FOR v_payment IN SELECT * FROM jsonb_array_elements(v_payments) LOOP
    v_paid_cents := v_paid_cents + (v_payment->>'amount_cents')::int;
  END LOOP;

  v_total_cents := v_subtotal_cents - v_sale_discount_cents;

  IF v_paid_cents >= v_total_cents AND v_paid_cents > 0 THEN
    v_status := 'paid';
  ELSIF v_paid_cents > 0 THEN
    v_status := 'partially_paid';
  ELSE
    v_status := 'confirmed';
  END IF;

  v_next_seq := nextval('public.sales_fac_seq');
  v_invoice_number := 'FAC-' || v_next_seq;

  INSERT INTO sales (
    invoice_number, source, status,
    customer_id, seller_id,
    source_warehouse_id, fulfillment_warehouse_id, fulfillment_method,
    subtotal_cents, discount_cents,
    sold_at, confirmed_at, paid_at
  ) VALUES (
    v_invoice_number, 'pos', v_status,
    v_customer_id, v_seller_id,
    v_source_warehouse_id, v_fulfillment_warehouse_id, v_fulfillment_method,
    v_subtotal_cents, v_sale_discount_cents,
    now(), now(),
    CASE WHEN v_status = 'paid' THEN now() ELSE NULL END
  )
  RETURNING id INTO v_sale_id;

  IF v_sale_discount_cents > 0 THEN
    INSERT INTO sale_discount_applications (
      sale_id, discount_rule_id, is_manual, percent, amount_cents, cap_hit
    ) VALUES (v_sale_id, NULL, true, NULL, v_sale_discount_cents, false);
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty_needed := (v_item->>'qty')::numeric;
    v_line_unit_price_cents := (v_item->>'unit_price_cents')::int;
    v_line_discount_cents := COALESCE((v_item->>'discount_cents')::int, 0);
    v_line_total_cents := (v_qty_needed * v_line_unit_price_cents)::int
                          - v_line_discount_cents;

    SELECT commission_percent_override INTO v_seller_override
      FROM profiles WHERE id = v_seller_id;
    SELECT commission_percent INTO v_product_default_pct
      FROM products WHERE id = v_product_id;
    v_commission_percent := COALESCE(v_seller_override, v_product_default_pct, 0);
    v_commission_amount_cents
      := ROUND(v_line_total_cents * v_commission_percent / 100.0)::int;

    INSERT INTO sale_items (
      sale_id, product_id, qty, unit_price_cents, discount_cents,
      seller_commission_percent, distributor_commission_percent
    ) VALUES (
      v_sale_id, v_product_id, v_qty_needed,
      v_line_unit_price_cents, v_line_discount_cents, v_commission_percent, 0
    )
    RETURNING id INTO v_sale_item_id;

    v_breakdown := COALESCE(v_item->'discount_breakdown', '[]'::jsonb);
    IF jsonb_array_length(v_breakdown) > 0 THEN
      FOR v_breakdown_entry IN SELECT * FROM jsonb_array_elements(v_breakdown) LOOP
        INSERT INTO sale_discount_applications (
          sale_item_id, discount_rule_id, is_manual, percent, amount_cents, cap_hit
        ) VALUES (
          v_sale_item_id, (v_breakdown_entry->>'rule_id')::uuid, false,
          NULLIF(v_breakdown_entry->>'percent','')::numeric,
          abs((v_breakdown_entry->>'amount_cents')::int),
          COALESCE((v_breakdown_entry->>'cap_hit')::boolean, false)
        );
      END LOOP;
    ELSIF v_line_discount_cents > 0 THEN
      INSERT INTO sale_discount_applications (
        sale_item_id, discount_rule_id, is_manual, percent, amount_cents, cap_hit
      ) VALUES (v_sale_item_id, NULL, true, NULL, v_line_discount_cents, false);
    END IF;

    -- Round 39: initialize cogs accumulator BEFORE branching, so both the
    -- inventory branch (which adds to it) and the non-inventory branch
    -- (which skips it) pass a definite value to the UPDATE below.
    v_item_cogs_cents := 0;

    -- Round 39: look up the product's inventory flag once per item.
    SELECT COALESCE(is_inventory, true) INTO v_is_inventory
      FROM products WHERE id = v_product_id;

    IF v_is_inventory THEN
      v_consumption_map := '{}'::jsonb;
      v_qty_remaining := v_qty_needed;
      v_first_lot_id := NULL;
      v_first_lot_unit_cost := NULL;

      FOR v_lots IN
        SELECT id, qty_remaining, unit_cost_dop
          FROM inventory_lots
          WHERE product_id = v_product_id AND warehouse_id = v_source_warehouse_id
          ORDER BY received_at ASC, created_at ASC, id ASC
          FOR UPDATE
      LOOP
        IF v_first_lot_id IS NULL THEN
          v_first_lot_id := v_lots.id;
          v_first_lot_unit_cost := v_lots.unit_cost_dop;
        END IF;
        EXIT WHEN v_qty_remaining <= 0;
        v_qty_to_take := LEAST(v_qty_remaining, GREATEST(v_lots.qty_remaining, 0));
        IF v_qty_to_take > 0 THEN
          v_consumption_map := v_consumption_map || jsonb_build_object(
            v_lots.id::text,
            jsonb_build_object('qty_consumed', v_qty_to_take, 'unit_cost_dop', v_lots.unit_cost_dop)
          );
          v_qty_remaining := v_qty_remaining - v_qty_to_take;
        END IF;
      END LOOP;

      IF v_first_lot_id IS NULL THEN
        RAISE EXCEPTION 'no_lots_for_product: product % has no inventory lots in warehouse %',
          v_product_id, v_source_warehouse_id;
      END IF;

      IF v_qty_remaining > 0 THEN
        v_lot_key := v_first_lot_id::text;
        IF v_consumption_map ? v_lot_key THEN
          v_consumption_map := jsonb_set(
            v_consumption_map, ARRAY[v_lot_key, 'qty_consumed'],
            to_jsonb(((v_consumption_map->v_lot_key->>'qty_consumed')::numeric + v_qty_remaining))
          );
        ELSE
          v_consumption_map := v_consumption_map || jsonb_build_object(
            v_lot_key,
            jsonb_build_object('qty_consumed', v_qty_remaining, 'unit_cost_dop', v_first_lot_unit_cost)
          );
        END IF;
      END IF;

      FOR v_consumption_row IN SELECT key, value FROM jsonb_each(v_consumption_map) LOOP
        v_lot_id_local := v_consumption_row.key::uuid;
        v_qty_local := (v_consumption_row.value->>'qty_consumed')::numeric;
        v_cost_local := (v_consumption_row.value->>'unit_cost_dop')::numeric;
        v_cogs_local := ROUND(v_qty_local * v_cost_local * 100)::int;

        INSERT INTO sale_lot_consumption (sale_item_id, lot_id, qty_consumed, unit_cost_dop)
        VALUES (v_sale_item_id, v_lot_id_local, v_qty_local, v_cost_local);

        UPDATE inventory_lots SET qty_remaining = qty_remaining - v_qty_local
          WHERE id = v_lot_id_local;

        INSERT INTO stock_movements (
          product_id, warehouse_id, lot_id, kind, qty_delta,
          unit_cost_dop, sale_item_id, created_by, occurred_at
        ) VALUES (
          v_product_id, v_source_warehouse_id, v_lot_id_local, 'sale_out', -v_qty_local,
          v_cost_local, v_sale_item_id, v_user_profile_id, now()
        );

        v_item_cogs_cents := v_item_cogs_cents + v_cogs_local;
      END LOOP;
    END IF;
    -- end IF v_is_inventory (non-inventory items fall through with cogs = 0)

    UPDATE sale_items SET cogs_cents = v_item_cogs_cents WHERE id = v_sale_item_id;

    IF v_commission_percent > 0 AND v_commission_amount_cents > 0 THEN
      INSERT INTO sale_commissions (
        sale_item_id, earner_id, earner_role, percent, amount_cents, status
      ) VALUES (
        v_sale_item_id, v_seller_id, 'seller', v_commission_percent, v_commission_amount_cents, 'pending'
      );
    END IF;

    v_total_cogs_cents := v_total_cogs_cents + v_item_cogs_cents;
  END LOOP;

  UPDATE sales SET
    cogs_cents = v_total_cogs_cents,
    gross_profit_cents = (v_subtotal_cents - v_sale_discount_cents) - v_total_cogs_cents
    WHERE id = v_sale_id;

  FOR v_payment IN SELECT * FROM jsonb_array_elements(v_payments) LOOP
    INSERT INTO sale_payments (
      sale_id, method, amount_cents, money_account_id, paid_at, reference
    ) VALUES (
      v_sale_id, (v_payment->>'method')::payment_method,
      (v_payment->>'amount_cents')::int, (v_payment->>'money_account_id')::uuid,
      COALESCE((v_payment->>'paid_at')::timestamptz, now()),
      NULLIF(v_payment->>'reference', '')
    );
  END LOOP;

  UPDATE sales SET paid_cents = v_paid_cents WHERE id = v_sale_id;

  FOR v_pay_row IN
    SELECT id, amount_cents, money_account_id, paid_at
      FROM sale_payments WHERE sale_id = v_sale_id AND amount_cents > 0
  LOOP
    PERFORM public.post_sale_payment_to_ledger(
      v_pay_row.money_account_id, v_shop_sales_category_id,
      v_pay_row.amount_cents::bigint, 'business'::account_scope,
      v_pay_row.paid_at, 'POS sale ' || v_invoice_number,
      v_sale_id, v_pay_row.id, v_user_profile_id
    );
  END LOOP;

  RETURN jsonb_build_object('sale_id', v_sale_id, 'invoice_number', v_invoice_number);
END;
$cps$;
