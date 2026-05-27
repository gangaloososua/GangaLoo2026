-- round-39-noninventory-products-04-edit-unpaid-sale.sql
--
-- Patches edit_unpaid_sale so non-inventory products skip FIFO during the
-- replay phase. The reverse phase needs no change: a non-inventory item
-- never had sale_lot_consumption rows, so the inner loop iterates zero
-- times naturally.
--
-- Surgical change in the per-item replay (same pattern as the round-39
-- patches to confirm_pos_sale and create_online_order):
--   * new local v_is_inventory boolean
--   * v_item_cogs_cents := 0 BEFORE the FIFO block
--   * lookup of products.is_inventory once per item
--   * FIFO consumption block (lots walk, no-lots error, overshoot, apply)
--     wrapped in IF v_is_inventory
--
-- Everything else (RBAC gate, status guard, sale_items insert, discount
-- audit, commission row, sales aggregate UPDATE) byte-for-byte identical
-- to round-25k.

create or replace function public.edit_unpaid_sale(
  p_sale_id uuid,
  p_items jsonb,
  p_discount_cents int default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $eus$ declare
  v_user_id uuid := auth.uid();
  v_user_role user_role;
  v_user_profile_id uuid;
  v_sale record;
  v_seller_id uuid;
  v_src_wh uuid;
  v_item jsonb;
  v_subtotal_cents int := 0;
  v_total_cogs_cents int := 0;
  v_item_cogs_cents int;
  v_product_id uuid;
  v_qty_needed numeric;
  v_line_unit_price_cents int;
  v_line_discount_cents int;
  v_line_total_cents int;
  v_commission_percent numeric;
  v_commission_amount_cents int;
  v_seller_override numeric;
  v_product_default_pct numeric;
  v_sale_item_id uuid;
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
  v_old_item record;
  v_old_cons record;

  -- Round 39
  v_is_inventory boolean;
begin
  select id, role into v_user_profile_id, v_user_role
  from profiles where auth_user_id = v_user_id;
  if v_user_role is null or v_user_role not in ('owner','admin','seller') then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  select id, status, paid_cents, seller_id, source_warehouse_id, discount_cents
    into v_sale
  from sales where id = p_sale_id for update;
  if not found then raise exception 'sale not found'; end if;
  if v_sale.status <> 'confirmed' or coalesce(v_sale.paid_cents,0) <> 0 then
    raise exception 'edit_unpaid_sale: only a confirmed, unpaid sale can be edited (status=%, paid=%)',
      v_sale.status, v_sale.paid_cents using errcode = '22023';
  end if;
  if p_items is null or jsonb_array_length(p_items) < 1 then
    raise exception 'at least one item is required' using errcode = '22023';
  end if;
  v_seller_id := v_sale.seller_id;
  v_src_wh := v_sale.source_warehouse_id;

  -- REVERSE phase: same as round-25k.
  -- Non-inventory items never wrote sale_lot_consumption / stock_movements,
  -- so the inner loop iterates zero times for them naturally.
  for v_old_item in select id from sale_items where sale_id = p_sale_id loop
    for v_old_cons in
      select slc.lot_id, slc.qty_consumed
      from sale_lot_consumption slc
      where slc.sale_item_id = v_old_item.id
    loop
      update inventory_lots set qty_remaining = qty_remaining + v_old_cons.qty_consumed
        where id = v_old_cons.lot_id;
    end loop;
    delete from stock_movements where sale_item_id = v_old_item.id;
    delete from sale_lot_consumption where sale_item_id = v_old_item.id;
    delete from sale_commissions where sale_item_id = v_old_item.id;
    delete from sale_discount_applications where sale_item_id = v_old_item.id;
  end loop;
  delete from sale_items where sale_id = p_sale_id;

  -- REPLAY phase
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty_needed := (v_item->>'qty')::numeric;
    v_line_unit_price_cents := (v_item->>'unit_price_cents')::int;
    v_line_discount_cents := coalesce((v_item->>'discount_cents')::int, 0);
    v_line_total_cents := (v_qty_needed * v_line_unit_price_cents)::int - v_line_discount_cents;

    select commission_percent_override into v_seller_override from profiles where id = v_seller_id;
    select commission_percent into v_product_default_pct from products where id = v_product_id;
    v_commission_percent := coalesce(v_seller_override, v_product_default_pct, 0);
    v_commission_amount_cents := round(v_line_total_cents * v_commission_percent / 100.0)::int;

    insert into sale_items (
      sale_id, product_id, qty, unit_price_cents, discount_cents,
      seller_commission_percent, distributor_commission_percent
    ) values (
      p_sale_id, v_product_id, v_qty_needed,
      v_line_unit_price_cents, v_line_discount_cents, v_commission_percent, 0
    ) returning id into v_sale_item_id;

    if v_line_discount_cents > 0 then
      insert into sale_discount_applications (sale_item_id, discount_rule_id, is_manual, percent, amount_cents, cap_hit)
      values (v_sale_item_id, null, true, null, v_line_discount_cents, false);
    end if;

    -- Round 39: init cogs accumulator BEFORE branching.
    v_item_cogs_cents := 0;

    -- Round 39: look up the product's inventory flag once per item.
    select coalesce(is_inventory, true) into v_is_inventory
      from products where id = v_product_id;

    if v_is_inventory then
      v_consumption_map := '{}'::jsonb;
      v_qty_remaining := v_qty_needed;
      v_first_lot_id := null; v_first_lot_unit_cost := null;

      for v_lots in
        select id, qty_remaining, unit_cost_dop
        from inventory_lots
        where product_id = v_product_id and warehouse_id = v_src_wh
        order by received_at asc, created_at asc, id asc
        for update
      loop
        if v_first_lot_id is null then
          v_first_lot_id := v_lots.id; v_first_lot_unit_cost := v_lots.unit_cost_dop;
        end if;
        exit when v_qty_remaining <= 0;
        v_qty_to_take := least(v_qty_remaining, greatest(v_lots.qty_remaining, 0));
        if v_qty_to_take > 0 then
          v_consumption_map := v_consumption_map || jsonb_build_object(
            v_lots.id::text, jsonb_build_object('qty_consumed', v_qty_to_take, 'unit_cost_dop', v_lots.unit_cost_dop));
          v_qty_remaining := v_qty_remaining - v_qty_to_take;
        end if;
      end loop;

      if v_first_lot_id is null then
        raise exception 'no_lots_for_product: product % has no inventory lots in warehouse %', v_product_id, v_src_wh;
      end if;

      if v_qty_remaining > 0 then
        v_lot_key := v_first_lot_id::text;
        if v_consumption_map ? v_lot_key then
          v_consumption_map := jsonb_set(v_consumption_map, array[v_lot_key,'qty_consumed'],
            to_jsonb(((v_consumption_map->v_lot_key->>'qty_consumed')::numeric + v_qty_remaining)));
        else
          v_consumption_map := v_consumption_map || jsonb_build_object(
            v_lot_key, jsonb_build_object('qty_consumed', v_qty_remaining, 'unit_cost_dop', v_first_lot_unit_cost));
        end if;
      end if;

      for v_consumption_row in select key, value from jsonb_each(v_consumption_map) loop
        v_lot_id_local := v_consumption_row.key::uuid;
        v_qty_local := (v_consumption_row.value->>'qty_consumed')::numeric;
        v_cost_local := (v_consumption_row.value->>'unit_cost_dop')::numeric;
        v_cogs_local := round(v_qty_local * v_cost_local * 100)::int;
        insert into sale_lot_consumption (sale_item_id, lot_id, qty_consumed, unit_cost_dop)
        values (v_sale_item_id, v_lot_id_local, v_qty_local, v_cost_local);
        update inventory_lots set qty_remaining = qty_remaining - v_qty_local where id = v_lot_id_local;
        insert into stock_movements (product_id, warehouse_id, lot_id, kind, qty_delta, unit_cost_dop, sale_item_id, created_by, occurred_at)
        values (v_product_id, v_src_wh, v_lot_id_local, 'sale_out', -v_qty_local, v_cost_local, v_sale_item_id, v_user_profile_id, now());
        v_item_cogs_cents := v_item_cogs_cents + v_cogs_local;
      end loop;
    end if;
    -- end if v_is_inventory

    update sale_items set cogs_cents = v_item_cogs_cents where id = v_sale_item_id;

    if v_commission_percent > 0 and v_commission_amount_cents > 0 then
      insert into sale_commissions (sale_item_id, earner_id, earner_role, percent, amount_cents, status)
      values (v_sale_item_id, v_seller_id, 'seller', v_commission_percent, v_commission_amount_cents, 'pending');
    end if;

    v_subtotal_cents := v_subtotal_cents + v_line_total_cents;
    v_total_cogs_cents := v_total_cogs_cents + v_item_cogs_cents;
  end loop;

  update sales set
    subtotal_cents = v_subtotal_cents,
    discount_cents = coalesce(p_discount_cents, 0),
    cogs_cents = v_total_cogs_cents,
    gross_profit_cents = (v_subtotal_cents - coalesce(p_discount_cents,0)) - v_total_cogs_cents
  where id = p_sale_id;

  return jsonb_build_object(
    'sale_id', p_sale_id,
    'subtotal_cents', v_subtotal_cents,
    'total_cents', v_subtotal_cents - coalesce(p_discount_cents,0),
    'cogs_cents', v_total_cogs_cents,
    'items', jsonb_array_length(p_items)
  );
end; $eus$;
