-- ============================================================================
-- Round 24e: Sales post to the live accounting ledger (Stage 2, sales path).
--
-- Every customer payment on a sale now posts to the transactions ledger AND
-- moves the money-account balance, via the new helper post_sale_payment_to_ledger.
--   * POS sales (confirm_pos_sale)        -> Shop Sales (income), one line / payment.
--   * Online orders (create_online_order) -> Seller Sales + Shipping Revenue,
--                                            split proportionally per payment
--                                            (product share = remainder, no drift).
--   * Cancellations (mark_cancelled_online) -> exact NEGATIVE mirror of the
--                                            order's original posted lines.
--
-- Sign convention: income +, refund/outflow -. Categories are chosen
-- server-side (no new frontend input). Unpaid sales post nothing; orders with
-- no original ledger lines (legacy / pre-24e) refund nothing -> both correct.
--
-- Hard-wired category ids (account_categories):
--   Shop Sales       870f61ba-ac8c-47bf-9ed0-52e935a78136
--   Seller Sales     27ff0912-3dbf-4d07-9973-308f9c270e76
--   Shipping Revenue 0fb05271-ec32-4b80-9d6b-505b4ffc9bbe
--
-- Idempotent: all four are CREATE OR REPLACE; safe to re-run. The helper must
-- be created before the functions that call it (order below preserved).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Helper: post_sale_payment_to_ledger  (no role gate; created_by passed in)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_sale_payment_to_ledger(
  p_money_account_id       uuid,
  p_category_id            uuid,
  p_amount_cents           bigint,        -- SIGNED: income +, refund -
  p_scope                  account_scope,
  p_occurred_at            timestamptz,
  p_description            text,
  p_source_sale_id         uuid,
  p_source_sale_payment_id uuid,
  p_created_by             uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_new_id uuid;
BEGIN
  -- NO permission gate, on purpose: this is only ever called from inside
  -- a sale function that has ALREADY checked the caller's role. Sellers may
  -- ring up POS sales but are not allowed to post to the ledger directly,
  -- so re-gating here would make their sales fail.

  -- Defensive no-op on a zero/empty amount, so a rounding edge in the
  -- shipping split can never abort a live customer sale.
  IF p_amount_cents IS NULL OR p_amount_cents = 0 THEN
    RETURN NULL;
  END IF;

  IF p_money_account_id IS NULL THEN
    RAISE EXCEPTION 'post_sale_payment_to_ledger: money_account_id is required'
      USING ERRCODE = '22023';
  END IF;
  IF p_category_id IS NULL THEN
    RAISE EXCEPTION 'post_sale_payment_to_ledger: category_id is required'
      USING ERRCODE = '22023';
  END IF;
  IF p_scope IS NULL THEN
    RAISE EXCEPTION 'post_sale_payment_to_ledger: scope is required'
      USING ERRCODE = '22023';
  END IF;

  -- Lock the account row before moving its balance (mirrors post_transaction).
  PERFORM 1 FROM money_accounts WHERE id = p_money_account_id FOR UPDATE;

  INSERT INTO transactions (
    money_account_id, category_id, amount_cents, scope, occurred_at, description,
    source_sale_id, source_sale_payment_id, is_manual, created_by
  ) VALUES (
    p_money_account_id, p_category_id, p_amount_cents, p_scope,
    COALESCE(p_occurred_at, now()), nullif(btrim(p_description), ''),
    p_source_sale_id, p_source_sale_payment_id, false, p_created_by
  )
  RETURNING id INTO v_new_id;

  UPDATE money_accounts
    SET balance_cents = balance_cents + p_amount_cents
    WHERE id = p_money_account_id;

  RETURN v_new_id;
END;
$function$;


-- ----------------------------------------------------------------------------
-- 2. confirm_pos_sale  (POS -> Shop Sales)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_pos_sale(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- 16.6: discount audit locals
  v_breakdown jsonb;
  v_breakdown_entry jsonb;

  -- Round 24e: ledger posting locals
  v_shop_sales_category_id constant uuid
    := '870f61ba-ac8c-47bf-9ed0-52e935a78136';  -- Shop Sales (income)
  v_pay_row record;
BEGIN
  -- 0. Permission gate (and capture profile id for FK references)
  SELECT id, role INTO v_user_profile_id, v_user_role
    FROM profiles WHERE auth_user_id = v_user_id;
  IF v_user_role IS NULL
     OR v_user_role NOT IN ('owner','admin','seller') THEN
    RAISE EXCEPTION 'permission denied: only owner/admin/seller can ring up POS sales'
      USING ERRCODE = '42501';
  END IF;

  -- 1. Validation
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
  IF jsonb_array_length(v_payments) < 1 THEN
    RAISE EXCEPTION 'at least one payment is required' USING ERRCODE = '22023';
  END IF;

  -- 2. Compute subtotal, paid, status
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    v_subtotal_cents := v_subtotal_cents
      + (((v_item->>'qty')::numeric * (v_item->>'unit_price_cents')::int)::int
         - COALESCE((v_item->>'discount_cents')::int, 0));
  END LOOP;

  FOR v_payment IN SELECT * FROM jsonb_array_elements(v_payments) LOOP
    v_paid_cents := v_paid_cents + (v_payment->>'amount_cents')::int;
  END LOOP;

  v_total_cents := v_subtotal_cents - v_sale_discount_cents;

  IF v_paid_cents >= v_total_cents THEN
    v_status := 'paid';
  ELSIF v_paid_cents > 0 THEN
    v_status := 'partially_paid';
  ELSE
    v_status := 'confirmed';
  END IF;

  -- 3. Invoice number
  v_next_seq := nextval('public.sales_fac_seq');
  v_invoice_number := 'FAC-' || v_next_seq;

  -- 4. Insert sales
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

  -- 16.6: sale-level discount audit (always manual; no rule kind covers
  -- order-level discounts in v1)
  IF v_sale_discount_cents > 0 THEN
    INSERT INTO sale_discount_applications (
      sale_id, discount_rule_id, is_manual,
      percent, amount_cents, cap_hit
    ) VALUES (
      v_sale_id, NULL, true,
      NULL, v_sale_discount_cents, false
    );
  END IF;

  -- 5. Per item: insert + audit + FIFO + commission
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
      v_line_unit_price_cents, v_line_discount_cents,
      v_commission_percent, 0
    )
    RETURNING id INTO v_sale_item_id;

    -- 16.6: per-line discount audit
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

    v_consumption_map := '{}'::jsonb;
    v_qty_remaining := v_qty_needed;
    v_first_lot_id := NULL;
    v_first_lot_unit_cost := NULL;

    FOR v_lots IN
      SELECT id, qty_remaining, unit_cost_dop
        FROM inventory_lots
        WHERE product_id = v_product_id
          AND warehouse_id = v_source_warehouse_id
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
          jsonb_build_object(
            'qty_consumed', v_qty_to_take,
            'unit_cost_dop', v_lots.unit_cost_dop
          )
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
          v_consumption_map,
          ARRAY[v_lot_key, 'qty_consumed'],
          to_jsonb(((v_consumption_map->v_lot_key->>'qty_consumed')::numeric
                    + v_qty_remaining))
        );
      ELSE
        v_consumption_map := v_consumption_map || jsonb_build_object(
          v_lot_key,
          jsonb_build_object(
            'qty_consumed', v_qty_remaining,
            'unit_cost_dop', v_first_lot_unit_cost
          )
        );
      END IF;
    END IF;

    v_item_cogs_cents := 0;
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

    UPDATE sale_items SET cogs_cents = v_item_cogs_cents
      WHERE id = v_sale_item_id;

    IF v_commission_percent > 0 AND v_commission_amount_cents > 0 THEN
      INSERT INTO sale_commissions (
        sale_item_id, earner_id, earner_role, percent, amount_cents, status
      ) VALUES (
        v_sale_item_id, v_seller_id, 'seller',
        v_commission_percent, v_commission_amount_cents, 'pending'
      );
    END IF;

    v_total_cogs_cents := v_total_cogs_cents + v_item_cogs_cents;
  END LOOP;

  -- 6. Aggregate + payments + paid_cents
  UPDATE sales SET
    cogs_cents = v_total_cogs_cents,
    gross_profit_cents = (v_subtotal_cents - v_sale_discount_cents) - v_total_cogs_cents
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

  -- Round 24e: post each customer payment to the LIVE LEDGER.
  -- One ledger line per payment, into the money account it landed in,
  -- filed under Shop Sales (income), credited to the selling user.
  -- Reads the rows we just wrote so each ledger line links to its exact
  -- sale_payment. Uses the SECURITY DEFINER helper because the selling
  -- user may be a 'seller' (not owner/admin) and must NOT be gated out.
  -- An unpaid sale has no payment rows -> nothing posts (correct).
  FOR v_pay_row IN
    SELECT id, amount_cents, money_account_id, paid_at
      FROM sale_payments
     WHERE sale_id = v_sale_id
       AND amount_cents > 0
  LOOP
    PERFORM public.post_sale_payment_to_ledger(
      v_pay_row.money_account_id,
      v_shop_sales_category_id,
      v_pay_row.amount_cents::bigint,        -- income: POSITIVE
      'business'::account_scope,
      v_pay_row.paid_at,
      'POS sale ' || v_invoice_number,
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


-- ----------------------------------------------------------------------------
-- 3. create_online_order  (online -> Seller Sales + Shipping Revenue split)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_online_order(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- 16.6: discount audit locals
  v_breakdown jsonb;
  v_breakdown_entry jsonb;

  -- Round 24e: ledger posting locals
  v_seller_sales_category_id    constant uuid
    := '27ff0912-3dbf-4d07-9973-308f9c270e76';  -- Seller Sales (income)
  v_shipping_revenue_category_id constant uuid
    := '0fb05271-ec32-4b80-9d6b-505b4ffc9bbe';  -- Shipping Revenue (income)
  v_pay_row record;
  v_ship_share bigint;
  v_prod_share bigint;
BEGIN
  -- 0. RBAC: owner / admin only
  SELECT id, role INTO v_user_profile_id, v_user_role
    FROM profiles WHERE auth_user_id = v_user_id;
  IF v_user_role IS NULL
     OR v_user_role NOT IN ('owner','admin') THEN
    RAISE EXCEPTION 'permission denied: only owner/admin can create online orders'
      USING ERRCODE = '42501';
  END IF;

  -- 1. Validation
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

  -- 2. Resolve distributor on the fulfillment warehouse
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

  -- 3. Compute subtotal, paid, status
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

  -- 4. Invoice number: ONL-NNNN, 4-digit zero-padded
  v_next_seq := nextval('public.sales_onl_seq');
  v_invoice_number := 'ONL-' || lpad(v_next_seq::text, 4, '0');

  -- 5. Insert sales row
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

  -- 16.6: sale-level discount audit (always manual; no rule kind covers
  -- order-level discounts in v1)
  IF v_sale_discount_cents > 0 THEN
    INSERT INTO sale_discount_applications (
      sale_id, discount_rule_id, is_manual,
      percent, amount_cents, cap_hit
    ) VALUES (
      v_sale_id, NULL, true,
      NULL, v_sale_discount_cents, false
    );
  END IF;

  -- 6. Per-item processing
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty_needed := (v_item->>'qty')::numeric;
    v_line_unit_price_cents := (v_item->>'unit_price_cents')::int;
    v_line_discount_cents := COALESCE((v_item->>'discount_cents')::int, 0);
    v_line_total_cents := (v_qty_needed * v_line_unit_price_cents)::int
                          - v_line_discount_cents;

    -- 6a. Strict stock check: refuse to oversell.
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

    -- 6b. Seller commission resolution (same as POS)
    SELECT commission_percent_override INTO v_seller_override
      FROM profiles WHERE id = v_seller_id;
    SELECT commission_percent INTO v_product_default_pct
      FROM products WHERE id = v_product_id;
    v_seller_pct := COALESCE(v_seller_override, v_product_default_pct, 0);
    v_seller_commission_amount_cents
      := ROUND(v_line_total_cents * v_seller_pct / 100.0)::int;

    -- 6c. Distributor commission amount (pct resolved once outside the loop)
    v_distributor_commission_amount_cents
      := ROUND(v_line_total_cents * v_distributor_pct / 100.0)::int;

    -- 6d. Insert sale_items
    INSERT INTO sale_items (
      sale_id, product_id, qty, unit_price_cents, discount_cents,
      seller_commission_percent, distributor_commission_percent
    ) VALUES (
      v_sale_id, v_product_id, v_qty_needed,
      v_line_unit_price_cents, v_line_discount_cents,
      v_seller_pct, v_distributor_pct
    )
    RETURNING id INTO v_sale_item_id;

    -- 16.6: per-line discount audit
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

    -- 6e. FIFO consume - strict (no fallback, stock check above guarantees coverage)
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

    -- Safety: if guard 6a was correct this can never fire
    IF v_qty_remaining > 0 THEN
      RAISE EXCEPTION
        'race_condition: stock changed between check and consume for product %',
        v_product_id USING ERRCODE = 'P0001';
    END IF;

    -- 6f. Apply consumption: lot_consumption rows, decrement lots, stock_movements
    v_item_cogs_cents := 0;
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

    UPDATE sale_items SET cogs_cents = v_item_cogs_cents
      WHERE id = v_sale_item_id;

    -- 6g. Seller commission row
    IF v_seller_pct > 0 AND v_seller_commission_amount_cents > 0 THEN
      INSERT INTO sale_commissions (
        sale_item_id, earner_id, earner_role, percent, amount_cents, status
      ) VALUES (
        v_sale_item_id, v_seller_id, 'seller',
        v_seller_pct, v_seller_commission_amount_cents, 'pending'
      );
    END IF;

    -- 6h. Distributor commission row
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

  -- 7. Aggregate cogs / gross profit
  UPDATE sales SET
    cogs_cents = v_total_cogs_cents,
    gross_profit_cents = (v_subtotal_cents - v_sale_discount_cents + v_shipping_cents)
                         - v_total_cogs_cents
    WHERE id = v_sale_id;

  -- 8. Payments
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

  -- 9. paid_cents (no trigger on sale_payments - must set manually)
  UPDATE sales SET paid_cents = v_paid_cents WHERE id = v_sale_id;

  -- Round 24e: post each customer payment to the LIVE LEDGER, SPLIT into
  -- product revenue (Seller Sales) + shipping (Shipping Revenue).
  -- The shipping share of each payment is proportional to the order's
  -- shipping fraction; the product share is the REMAINDER, so the two
  -- lines always sum to the exact payment (no rounding drift). Orders
  -- with no shipping post a single Seller Sales line (the helper no-ops
  -- on a zero amount). Reads the rows we just wrote so each ledger line
  -- links to its exact sale_payment. SECURITY DEFINER helper used so the
  -- posting cannot be blocked by ledger permission rules.
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

    -- Product revenue -> Seller Sales
    PERFORM public.post_sale_payment_to_ledger(
      v_pay_row.money_account_id,
      v_seller_sales_category_id,
      v_prod_share,                          -- income: POSITIVE
      'business'::account_scope,
      v_pay_row.paid_at,
      'Online order ' || v_invoice_number,
      v_sale_id,
      v_pay_row.id,
      v_user_profile_id
    );

    -- Shipping portion -> Shipping Revenue (skipped automatically if 0)
    PERFORM public.post_sale_payment_to_ledger(
      v_pay_row.money_account_id,
      v_shipping_revenue_category_id,
      v_ship_share,                          -- income: POSITIVE
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


-- ----------------------------------------------------------------------------
-- 4. mark_cancelled_online  (refund = exact negative mirror)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_cancelled_online(p_sale_id uuid, p_reason text)
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

  -- Round 24e: ledger refund locals
  v_invoice_number text;
  v_orig record;
BEGIN
  -- 0. RBAC
  SELECT id, role INTO v_user_profile_id, v_user_role
    FROM profiles WHERE auth_user_id = v_user_id;
  IF v_user_role IS NULL OR v_user_role NOT IN ('owner','admin') THEN
    RAISE EXCEPTION 'permission denied: only owner/admin can cancel online orders'
      USING ERRCODE = '42501';
  END IF;

  -- 1. Load + guards
  SELECT source, tracking_status, status, invoice_number
    INTO v_source, v_tracking_status, v_sale_status, v_invoice_number
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

  -- 3b. Round 24e: post the LEDGER REFUND. Mirror each ORIGINAL posted
  --     ledger line (the order's positive income postings) as a NEGATIVE
  --     into the same account + same category, pulling the money back out
  --     and lowering the balance. This is an exact mirror -- no re-split,
  --     no rounding risk. Orders placed before Round 24e (or legacy) have
  --     no original ledger lines, so this loop finds nothing and posts
  --     nothing, which is correct (they never posted income to begin with).
  FOR v_orig IN
    SELECT money_account_id, category_id, amount_cents, scope, source_sale_payment_id
      FROM transactions
     WHERE source_sale_id = p_sale_id
       AND amount_cents > 0
  LOOP
    PERFORM public.post_sale_payment_to_ledger(
      v_orig.money_account_id,
      v_orig.category_id,
      (-v_orig.amount_cents)::bigint,        -- refund: NEGATIVE
      v_orig.scope,
      now(),
      'Cancelled ' || COALESCE(v_invoice_number, p_sale_id::text),
      p_sale_id,
      v_orig.source_sale_payment_id,
      v_user_profile_id
    );
  END LOOP;

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
