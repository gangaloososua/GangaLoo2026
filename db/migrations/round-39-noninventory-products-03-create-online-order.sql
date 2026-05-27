-- round-39-noninventory-products-03-create-online-order.sql
--
-- Patches create_online_order so non-inventory (service) products bypass:
--   * the strict pre-flight stock check (6a)
--   * FIFO consumption (6e)
--   * stock_movements writes (6f)
--   * COGS rollup (cogs_cents stays 0 on the sale_items row)
--
-- All other behaviour — shipping split into Shipping Revenue, seller +
-- distributor commission, discount audit, ledger posting via
-- post_sale_payment_to_ledger — is byte-for-byte the round-24e version.
--
-- Same surgical pattern as the round-39 confirm_pos_sale patch:
--   * v_is_inventory boolean per-item
--   * v_item_cogs_cents initialized to 0 BEFORE branching
--   * stock check + FIFO block wrapped in IF v_is_inventory
--
-- Verified pre-condition: this function is the round-24e version
-- (create_online_order has not been re-defined since).

create or replace function public.create_online_order(p_payload jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE
  v_customer_id uuid := nullif(p_payload->>'customer_id','')::uuid;
  v_seller_id uuid := nullif(p_payload->>'seller_id','')::uuid;
  v_source_warehouse_id uuid := (p_payload->>'source_warehouse_id')::uuid;
  v_fulfillment_warehouse_id uuid := (p_payload->>'fulfillment_warehouse_id')::uuid;
  v_fulfillment_method fulfillment_method
    := (p_payload->>'fulfillment_method')::fulfillment_method;
  v_sale_discount_cents int := COALESCE((p_payload->>'discount_cents')::int, 0);
  v_shipping_cents int := COALESCE((p_payload->>'shipping_cents')::int, 0);
  v_shipping_address text := nullif(p_payload->>'shipping_address','');
  v_shipping_city text := nullif(p_payload->>'shipping_city','');
  v_delivery_notes text := nullif(p_payload->>'delivery_notes','');
  v_items jsonb := COALESCE(p_payload->'items', '[]'::jsonb);
  v_payments jsonb := COALESCE(p_payload->'payments', '[]'::jsonb);

  v_user_id uuid := auth.uid();
  v_user_role user_role;
  v_user_profile_id uuid;

  v_distributor_id uuid;
  v_distributor_default_pct numeric;
  v_distributor_override_pct numeric;
  v_distributor_pct numeric;

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
  v_seller_pct numeric;
  v_seller_override numeric;
  v_product_default_pct numeric;
  v_seller_commission_amount_cents int;
  v_distributor_commission_amount_cents int;
  v_lots record;
  v_qty_to_take numeric;
  v_qty_remaining numeric;
  v_available_total numeric;
  v_consumption_map jsonb;
  v_consumption_row record;
  v_lot_id_local uuid;
  v_qty_local numeric;
  v_cost_local numeric;
  v_cogs_local int;

  v_breakdown jsonb;
  v_breakdown_entry jsonb;

  v_seller_sales_category_id    constant uuid
    := '27ff0912-3dbf-4d07-9973-308f9c270e76';
  v_shipping_revenue_category_id constant uuid
    := '0fb05271-ec32-4b80-9d6b-505b4ffc9bbe';
  v_pay_row record;
  v_ship_share bigint;
  v_prod_share bigint;

  -- Round 39: per-item inventory flag
  v_is_inventory boolean;
BEGIN
  SELECT id, role INTO v_user_profile_id, v_user_role
    FROM profiles WHERE auth_user_id = v_user_id;
  IF v_user_role IS NULL
     OR v_user_role NOT IN ('owner','admin') THEN
    RAISE EXCEPTION 'permission denied: only owner/admin can create online orders'
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
  IF v_fulfillment_method IS NULL THEN
    RAISE EXCEPTION 'fulfillment_method is required' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(v_items) < 1 THEN
    RAISE EXCEPTION 'at least one item is required' USING ERRCODE = '22023';
  END IF;

  SELECT distributor_id, distributor_commission_percent
    INTO v_distributor_id, v_distributor_default_pct
    FROM warehouses WHERE id = v_fulfillment_warehouse_id;
  v_distributor_pct := 0;
  IF v_distributor_id IS NOT NULL THEN
    SELECT commission_percent_override INTO v_distributor_override_pct
      FROM profiles WHERE id = v_distributor_id;
    v_distributor_pct := COALESCE(v_distributor_override_pct,
                                  v_distributor_default_pct, 0);
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    v_subtotal_cents := v_subtotal_cents
      + (((v_item->>'qty')::numeric * (v_item->>'unit_price_cents')::int)::int
         - COALESCE((v_item->>'discount_cents')::int, 0));
  END LOOP;

  FOR v_payment IN SELECT * FROM jsonb_array_elements(v_payments) LOOP
    v_paid_cents := v_paid_cents + (v_payment->>'amount_cents')::int;
  END LOOP;

  v_total_cents := v_subtotal_cents - v_sale_discount_cents + v_shipping_cents;

  IF v_paid_cents >= v_total_cents AND v_total_cents > 0 THEN
    v_status := 'paid';
  ELSIF v_paid_cents > 0 THEN
    v_status := 'partially_paid';
  ELSE
    v_status := 'confirmed';
  END IF;

  v_next_seq := nextval('public.sales_onl_seq');
  v_invoice_number := 'ONL-' || lpad(v_next_seq::text, 4, '0');

  INSERT INTO sales (
    invoice_number, source, status, tracking_status,
    customer_id, seller_id,
    source_warehouse_id, fulfillment_warehouse_id, fulfillment_method,
    subtotal_cents, discount_cents, shipping_cents,
    shipping_address, shipping_city, delivery_notes,
    sold_at, confirmed_at, paid_at
  ) VALUES (
    v_invoice_number, 'online', v_status, 'received',
    v_customer_id, v_seller_id,
    v_source_warehouse_id, v_fulfillment_warehouse_id, v_fulfillment_method,
    v_subtotal_cents, v_sale_discount_cents, v_shipping_cents,
    v_shipping_address, v_shipping_city, v_delivery_notes,
    now(), now(),
    CASE WHEN v_status = 'paid' THEN now() ELSE NULL END
  )
  RETURNING id INTO v_sale_id;

  IF v_sale_discount_cents > 0 THEN
    INSERT INTO sale_discount_applications (
      sale_id, discount_rule_id, is_manual,
      percent, amount_cents, cap_hit
    ) VALUES (
      v_sale_id, NULL, true,
      NULL, v_sale_discount_cents, false
    );
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty_needed := (v_item->>'qty')::numeric;
    v_line_unit_price_cents := (v_item->>'unit_price_cents')::int;
    v_line_discount_cents := COALESCE((v_item->>'discount_cents')::int, 0);
    v_line_total_cents := (v_qty_needed * v_line_unit_price_cents)::int
                          - v_line_discount_cents;

    -- Round 39: look up the product's inventory flag once per item.
    SELECT COALESCE(is_inventory, true) INTO v_is_inventory
      FROM products WHERE id = v_product_id;

    -- 6a. Strict stock check — only for inventory-tracked products.
    IF v_is_inventory THEN
      SELECT COALESCE(SUM(qty_remaining), 0) INTO v_available_total
        FROM inventory_lots
        WHERE product_id = v_product_id
          AND warehouse_id = v_source_warehouse_id
          AND qty_remaining > 0;
      IF v_available_total < v_qty_needed THEN
        RAISE EXCEPTION
          'insufficient_stock: product % has % available in warehouse %, but % requested',
          v_product_id, v_available_total, v_source_warehouse_id, v_qty_needed
          USING ERRCODE = 'P0001';
      END IF;
    END IF;

    SELECT commission_percent_override INTO v_seller_override
      FROM profiles WHERE id = v_seller_id;
    SELECT commission_percent INTO v_product_default_pct
      FROM products WHERE id = v_product_id;
    v_seller_pct := COALESCE(v_seller_override, v_product_default_pct, 0);
    v_seller_commission_amount_cents
      := ROUND(v_line_total_cents * v_seller_pct / 100.0)::int;

    v_distributor_commission_amount_cents
      := ROUND(v_line_total_cents * v_distributor_pct / 100.0)::int;

    INSERT INTO sale_items (
      sale_id, product_id, qty, unit_price_cents, discount_cents,
      seller_commission_percent, distributor_commission_percent
    ) VALUES (
      v_sale_id, v_product_id, v_qty_needed,
      v_line_unit_price_cents, v_line_discount_cents,
      v_seller_pct, v_distributor_pct
    )
    RETURNING id INTO v_sale_item_id;

    v_breakdown := COALESCE(v_item->'discount_breakdown', '[]'::jsonb);
    IF jsonb_array_length(v_breakdown) > 0 THEN
      FOR v_breakdown_entry IN SELECT * FROM jsonb_array_elements(v_breakdown) LOOP
        INSERT INTO sale_discount_applications (
          sale_item_id, discount_rule_id, is_manual,
          percent, amount_cents, cap_hit
        ) VALUES (
          v_sale_item_id,
          (v_breakdown_entry->>'rule_id')::uuid,
          false,
          NULLIF(v_breakdown_entry->>'percent','')::numeric,
          abs((v_breakdown_entry->>'amount_cents')::int),
          COALESCE((v_breakdown_entry->>'cap_hit')::boolean, false)
        );
      END LOOP;
    ELSIF v_line_discount_cents > 0 THEN
      INSERT INTO sale_discount_applications (
        sale_item_id, discount_rule_id, is_manual,
        percent, amount_cents, cap_hit
      ) VALUES (
        v_sale_item_id, NULL, true,
        NULL, v_line_discount_cents, false
      );
    END IF;

    -- Round 39: init cogs accumulator before branching.
    v_item_cogs_cents := 0;

    IF v_is_inventory THEN
      -- 6e. FIFO consume — strict (no fallback; 6a guarantees coverage)
      v_consumption_map := '{}'::jsonb;
      v_qty_remaining := v_qty_needed;

      FOR v_lots IN
        SELECT id, qty_remaining, unit_cost_dop
          FROM inventory_lots
          WHERE product_id = v_product_id
            AND warehouse_id = v_source_warehouse_id
            AND qty_remaining > 0
          ORDER BY received_at ASC, created_at ASC, id ASC
          FOR UPDATE
      LOOP
        EXIT WHEN v_qty_remaining <= 0;
        v_qty_to_take := LEAST(v_qty_remaining, v_lots.qty_remaining);
        IF v_qty_to_take > 0 THEN
          v_consumption_map := v_consumption_map || jsonb_build_object(
            v_lots.id::text,
            jsonb_build_object(
              'qty_consumed', v_qty_to_take,
              'unit_cost_dop', v_lots.unit_cost_dop
            )
          );
          v_qty_remaining := v_qty_remaining - v_qty_to_take;
        END IF;
      END LOOP;

      IF v_qty_remaining > 0 THEN
        RAISE EXCEPTION
          'race_condition: stock changed between check and consume for product %',
          v_product_id USING ERRCODE = 'P0001';
      END IF;

      -- 6f. Apply consumption
      FOR v_consumption_row IN
        SELECT key, value FROM jsonb_each(v_consumption_map)
      LOOP
        v_lot_id_local := v_consumption_row.key::uuid;
        v_qty_local := (v_consumption_row.value->>'qty_consumed')::numeric;
        v_cost_local := (v_consumption_row.value->>'unit_cost_dop')::numeric;
        v_cogs_local := ROUND(v_qty_local * v_cost_local * 100)::int;

        INSERT INTO sale_lot_consumption (
          sale_item_id, lot_id, qty_consumed, unit_cost_dop
        ) VALUES (
          v_sale_item_id, v_lot_id_local, v_qty_local, v_cost_local
        );

        UPDATE inventory_lots
          SET qty_remaining = qty_remaining - v_qty_local
          WHERE id = v_lot_id_local;

        INSERT INTO stock_movements (
          product_id, warehouse_id, lot_id, kind, qty_delta,
          unit_cost_dop, sale_item_id, created_by, occurred_at
        ) VALUES (
          v_product_id, v_source_warehouse_id, v_lot_id_local,
          'sale_out', -v_qty_local,
          v_cost_local, v_sale_item_id, v_user_profile_id, now()
        );

        v_item_cogs_cents := v_item_cogs_cents + v_cogs_local;
      END LOOP;
    END IF;
    -- end IF v_is_inventory (non-inventory items fall through with cogs = 0)

    UPDATE sale_items SET cogs_cents = v_item_cogs_cents
      WHERE id = v_sale_item_id;

    IF v_seller_pct > 0 AND v_seller_commission_amount_cents > 0 THEN
      INSERT INTO sale_commissions (
        sale_item_id, earner_id, earner_role, percent, amount_cents, status
      ) VALUES (
        v_sale_item_id, v_seller_id, 'seller',
        v_seller_pct, v_seller_commission_amount_cents, 'pending'
      );
    END IF;

    IF v_distributor_id IS NOT NULL
       AND v_distributor_pct > 0
       AND v_distributor_commission_amount_cents > 0 THEN
      INSERT INTO sale_commissions (
        sale_item_id, earner_id, earner_role, percent, amount_cents, status
      ) VALUES (
        v_sale_item_id, v_distributor_id, 'distributor',
        v_distributor_pct, v_distributor_commission_amount_cents, 'pending'
      );
    END IF;

    v_total_cogs_cents := v_total_cogs_cents + v_item_cogs_cents;
  END LOOP;

  UPDATE sales SET
    cogs_cents = v_total_cogs_cents,
    gross_profit_cents = (v_subtotal_cents - v_sale_discount_cents + v_shipping_cents)
                         - v_total_cogs_cents
    WHERE id = v_sale_id;

  FOR v_payment IN SELECT * FROM jsonb_array_elements(v_payments) LOOP
    INSERT INTO sale_payments (
      sale_id, method, amount_cents, money_account_id, paid_at, reference
    ) VALUES (
      v_sale_id,
      (v_payment->>'method')::payment_method,
      (v_payment->>'amount_cents')::int,
      (v_payment->>'money_account_id')::uuid,
      COALESCE((v_payment->>'paid_at')::timestamptz, now()),
      NULLIF(v_payment->>'reference', '')
    );
  END LOOP;

  UPDATE sales SET paid_cents = v_paid_cents WHERE id = v_sale_id;

  FOR v_pay_row IN
    SELECT id, amount_cents, money_account_id, paid_at
      FROM sale_payments
     WHERE sale_id = v_sale_id
       AND amount_cents > 0
  LOOP
    IF v_shipping_cents > 0 AND v_total_cents > 0 THEN
      v_ship_share := ROUND(
        v_pay_row.amount_cents::numeric * v_shipping_cents / v_total_cents
      )::bigint;
    ELSE
      v_ship_share := 0;
    END IF;
    v_prod_share := v_pay_row.amount_cents - v_ship_share;

    PERFORM public.post_sale_payment_to_ledger(
      v_pay_row.money_account_id,
      v_seller_sales_category_id,
      v_prod_share,
      'business'::account_scope,
      v_pay_row.paid_at,
      'Online order ' || v_invoice_number,
      v_sale_id,
      v_pay_row.id,
      v_user_profile_id
    );

    PERFORM public.post_sale_payment_to_ledger(
      v_pay_row.money_account_id,
      v_shipping_revenue_category_id,
      v_ship_share,
      'business'::account_scope,
      v_pay_row.paid_at,
      'Online order ' || v_invoice_number || ' - shipping',
      v_sale_id,
      v_pay_row.id,
      v_user_profile_id
    );
  END LOOP;

  RETURN jsonb_build_object(
    'sale_id', v_sale_id,
    'invoice_number', v_invoice_number
  );
END;
$function$;
