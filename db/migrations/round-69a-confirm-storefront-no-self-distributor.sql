-- round-69a-confirm-storefront-no-self-distributor.sql
-- Rule (owner, 2026-06-11): the warehouse distributor does NOT earn the 5%
-- distributor commission on an order where they are themselves the SELLER or
-- the CUSTOMER. They earn it only for handling OTHER people's orders.
--
-- Rebuilt verbatim from the LIVE confirm_storefront_order body. Only changes:
--   1) load customer_id into a new v_customer_id variable
--   2) after resolving the warehouse distributor, drop it (no 5%) when it
--      equals the seller or the customer.
-- Everything else is unchanged.

CREATE OR REPLACE FUNCTION public.confirm_storefront_order(p_sale_id uuid, p_seller_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
declare
  v_user_id uuid := auth.uid();
  v_user_role user_role;
  v_user_profile_id uuid;

  v_status sale_status;
  v_source sale_source;
  v_source_wh uuid;
  v_fulfill_wh uuid;
  v_subtotal int;
  v_discount int;
  v_shipping int;
  v_customer_id uuid;          -- Round 69: needed for the self-distributor guard

  v_distributor_id uuid;
  v_distributor_default_pct numeric;
  v_distributor_override_pct numeric;
  v_distributor_pct numeric := 0;

  v_seller_override numeric;
  v_product_default_pct numeric;
  v_seller_pct numeric;
  v_seller_amt int;
  v_dist_amt int;
  v_line_total int;

  v_item record;
  v_available numeric;
  v_qty_remaining numeric;
  v_lot record;
  v_qty_to_take numeric;
  v_consumption jsonb;
  v_crow record;
  v_lot_id uuid;
  v_qty_local numeric;
  v_cost_local numeric;
  v_item_cogs int;
  v_total_cogs int := 0;
begin
  -- RBAC: owner / admin only
  select id, role into v_user_profile_id, v_user_role
    from profiles where auth_user_id = v_user_id;
  if v_user_role is null or v_user_role not in ('owner','admin') then
    raise exception 'permission denied: only owner/admin can confirm online orders'
      using errcode = '42501';
  end if;

  if p_seller_id is null then
    raise exception 'seller_id is required' using errcode = '22023';
  end if;
  perform 1 from profiles where id = p_seller_id;
  if not found then
    raise exception 'seller not found' using errcode = '22023';
  end if;

  -- load + lock the draft
  select status, source, source_warehouse_id, fulfillment_warehouse_id,
         subtotal_cents, discount_cents, shipping_cents, customer_id
    into v_status, v_source, v_source_wh, v_fulfill_wh,
         v_subtotal, v_discount, v_shipping, v_customer_id
    from sales where id = p_sale_id for update;
  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;
  if v_source <> 'online' then
    raise exception 'not an online order' using errcode = '22023';
  end if;
  if v_status <> 'draft' then
    raise exception 'order is not a draft (current status: %)', v_status
      using errcode = '22023';
  end if;
  if v_source_wh is null then
    raise exception 'order has no source warehouse' using errcode = '22023';
  end if;

  -- distributor on the fulfillment warehouse
  select distributor_id, distributor_commission_percent
    into v_distributor_id, v_distributor_default_pct
    from warehouses where id = v_fulfill_wh;
  if v_distributor_id is not null then
    select commission_percent_override into v_distributor_override_pct
      from profiles where id = v_distributor_id;
    v_distributor_pct := coalesce(v_distributor_override_pct, v_distributor_default_pct, 0);
  end if;

  -- Round 69: the warehouse distributor does NOT earn the distributor
  -- commission on an order where they are themselves the seller or the
  -- customer. Dropping v_distributor_id here skips the distributor commission
  -- insert below and records 0% on the item.
  if v_distributor_id is not null
     and (v_distributor_id = p_seller_id or v_distributor_id = v_customer_id) then
    v_distributor_id := null;
    v_distributor_pct := 0;
  end if;

  -- seller override (resolved once)
  select commission_percent_override into v_seller_override
    from profiles where id = p_seller_id;

  for v_item in
    select id, product_id, qty, unit_price_cents, discount_cents, line_total_cents
      from sale_items where sale_id = p_sale_id
  loop
    v_line_total := v_item.line_total_cents;

    -- strict stock check
    select coalesce(sum(qty_remaining), 0) into v_available
      from inventory_lots
      where product_id = v_item.product_id
        and warehouse_id = v_source_wh
        and qty_remaining > 0;
    if v_available < v_item.qty then
      raise exception
        'insufficient_stock: product % has % available, % requested',
        v_item.product_id, v_available, v_item.qty using errcode = 'P0001';
    end if;

    -- commission percentages
    select commission_percent into v_product_default_pct
      from products where id = v_item.product_id;
    v_seller_pct := coalesce(v_seller_override, v_product_default_pct, 0);
    v_seller_amt := round(v_line_total * v_seller_pct / 100.0)::int;
    v_dist_amt   := round(v_line_total * v_distributor_pct / 100.0)::int;

    -- FIFO consume (strict)
    v_consumption := '{}'::jsonb;
    v_qty_remaining := v_item.qty;
    for v_lot in
      select id, qty_remaining, unit_cost_dop
        from inventory_lots
        where product_id = v_item.product_id
          and warehouse_id = v_source_wh
          and qty_remaining > 0
        order by received_at asc, created_at asc, id asc
        for update
    loop
      exit when v_qty_remaining <= 0;
      v_qty_to_take := least(v_qty_remaining, v_lot.qty_remaining);
      if v_qty_to_take > 0 then
        v_consumption := v_consumption || jsonb_build_object(
          v_lot.id::text,
          jsonb_build_object('qty_consumed', v_qty_to_take, 'unit_cost_dop', v_lot.unit_cost_dop)
        );
        v_qty_remaining := v_qty_remaining - v_qty_to_take;
      end if;
    end loop;
    if v_qty_remaining > 0 then
      raise exception 'race_condition: stock changed for product %',
        v_item.product_id using errcode = 'P0001';
    end if;

    -- apply consumption
    v_item_cogs := 0;
    for v_crow in select key, value from jsonb_each(v_consumption)
    loop
      v_lot_id := v_crow.key::uuid;
      v_qty_local := (v_crow.value->>'qty_consumed')::numeric;
      v_cost_local := (v_crow.value->>'unit_cost_dop')::numeric;

      insert into sale_lot_consumption (sale_item_id, lot_id, qty_consumed, unit_cost_dop)
      values (v_item.id, v_lot_id, v_qty_local, v_cost_local);

      update inventory_lots set qty_remaining = qty_remaining - v_qty_local
        where id = v_lot_id;

      insert into stock_movements (
        product_id, warehouse_id, lot_id, kind, qty_delta,
        unit_cost_dop, sale_item_id, created_by, occurred_at
      ) values (
        v_item.product_id, v_source_wh, v_lot_id, 'sale_out', -v_qty_local,
        v_cost_local, v_item.id, v_user_profile_id, now()
      );

      v_item_cogs := v_item_cogs + round(v_qty_local * v_cost_local * 100)::int;
    end loop;

    update sale_items
       set cogs_cents = v_item_cogs,
           seller_commission_percent = v_seller_pct,
           distributor_commission_percent = v_distributor_pct
     where id = v_item.id;

    if v_seller_pct > 0 and v_seller_amt > 0 then
      insert into sale_commissions (sale_item_id, earner_id, earner_role, percent, amount_cents, status)
      values (v_item.id, p_seller_id, 'seller', v_seller_pct, v_seller_amt, 'pending');
    end if;
    if v_distributor_id is not null and v_distributor_pct > 0 and v_dist_amt > 0 then
      insert into sale_commissions (sale_item_id, earner_id, earner_role, percent, amount_cents, status)
      values (v_item.id, v_distributor_id, 'distributor', v_distributor_pct, v_dist_amt, 'pending');
    end if;

    v_total_cogs := v_total_cogs + v_item_cogs;
  end loop;

  update sales
     set status = 'confirmed',
         seller_id = p_seller_id,
         confirmed_at = now(),
         cogs_cents = v_total_cogs,
         gross_profit_cents =
           (coalesce(v_subtotal,0) - coalesce(v_discount,0) + coalesce(v_shipping,0))
           - v_total_cogs
   where id = p_sale_id;

  return jsonb_build_object('ok', true, 'sale_id', p_sale_id, 'status', 'confirmed');
end;
$$;
