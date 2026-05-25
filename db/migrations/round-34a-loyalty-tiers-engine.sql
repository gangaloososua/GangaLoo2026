-- round-34a-loyalty-tiers-engine.sql
-- Loyalty tiers (engine + online application).
--
-- Rules agreed with the owner:
--   * Earn 1 point per RD$100 spent (ptsPerHundred), counting ONLINE + POS sales.
--   * Window = trailing 365 days (computed live; no reset job).
--   * Four tiers by points: 250 Bronze, 500 Silver, 750 Gold, 1000 Platinum.
--   * Discounts: 5% / 10% / 15% / 20%.
--   * Only role = 'customer' qualifies (sellers/distributors/owner never earn).
--   * Tier discount STACKS on a deal/offer price, but TOTAL discount per item is
--     capped at 30% off the normal store price (same cap as in-person promos).
--   * Counts FULL order total (total_cents) of non-cancelled, non-draft,
--     non-refunded sales (status in confirmed / paid / partially_paid).
--
-- Thresholds + percentages are stored as plain numeric store_config keys, so the
-- owner can edit them in the existing Store Config admin screen. Tier NAMES are
-- fixed in code.
--
-- This migration: (1) seeds the settings, (2) adds get_customer_tier() and
-- get_my_customer_tier(), (3) updates place_storefront_order() to apply the tier
-- discount at online checkout. The in-person (POS) application is a separate step.

-- (1) Settings (editable in Store Config). Keep any value the owner already set.
insert into store_config (key, value, description) values
  ('tier1_points', to_jsonb(250),  'Loyalty: points needed for Bronze'),
  ('tier1_pct',    to_jsonb(5),    'Loyalty: Bronze discount %'),
  ('tier2_points', to_jsonb(500),  'Loyalty: points needed for Silver'),
  ('tier2_pct',    to_jsonb(10),   'Loyalty: Silver discount %'),
  ('tier3_points', to_jsonb(750),  'Loyalty: points needed for Gold'),
  ('tier3_pct',    to_jsonb(15),   'Loyalty: Gold discount %'),
  ('tier4_points', to_jsonb(1000), 'Loyalty: points needed for Platinum'),
  ('tier4_pct',    to_jsonb(20),   'Loyalty: Platinum discount %'),
  ('ptsPerHundred', to_jsonb(1),   'Loyalty: points earned per RD$100 spent')
on conflict (key) do nothing;

-- helper: read a numeric store_config value robustly (jsonb number OR string).
create or replace function public.cfg_num(p_key text, p_default numeric)
returns numeric
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select coalesce((select (value #>> '{}')::numeric from store_config where key = p_key), p_default);
$function$;

-- (2) Tier for a given customer, computed live from the trailing-365-day spend.
create or replace function public.get_customer_tier(p_customer_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_role        text;
  v_sum_cents   bigint := 0;
  v_per_hundred numeric;
  v_points      integer;
  v_t1 integer; v_t2 integer; v_t3 integer; v_t4 integer;
  v_p1 numeric; v_p2 numeric; v_p3 numeric; v_p4 numeric;
  v_idx integer := 0;
  v_name text := '';
  v_pct numeric := 0;
  v_next integer;
  v_to_next integer;
begin
  if p_customer_id is null then
    return jsonb_build_object('tier_index',0,'tier_name','','discount_pct',0,'points',0,'next_points',null,'points_to_next',null);
  end if;

  select role into v_role from profiles where id = p_customer_id;
  if v_role is distinct from 'customer' then
    -- staff / owner / distributor never earn tiers
    return jsonb_build_object('tier_index',0,'tier_name','','discount_pct',0,'points',0,'next_points',null,'points_to_next',null);
  end if;

  select coalesce(sum(total_cents), 0) into v_sum_cents
    from sales
   where customer_id = p_customer_id
     and status in ('confirmed','paid','partially_paid')
     and source in ('online','pos')
     and sold_at >= now() - interval '365 days';

  v_per_hundred := cfg_num('ptsPerHundred', 1);
  -- points = (pesos / 100) * per_hundred ; pesos = cents / 100
  v_points := floor((v_sum_cents / 100.0) / 100.0 * v_per_hundred)::int;

  v_t1 := cfg_num('tier1_points', 250)::int;
  v_t2 := cfg_num('tier2_points', 500)::int;
  v_t3 := cfg_num('tier3_points', 750)::int;
  v_t4 := cfg_num('tier4_points', 1000)::int;
  v_p1 := cfg_num('tier1_pct', 5);
  v_p2 := cfg_num('tier2_pct', 10);
  v_p3 := cfg_num('tier3_pct', 15);
  v_p4 := cfg_num('tier4_pct', 20);

  if v_points >= v_t4 then
    v_idx := 4; v_name := 'Platinum'; v_pct := v_p4; v_next := null; v_to_next := null;
  elsif v_points >= v_t3 then
    v_idx := 3; v_name := 'Gold'; v_pct := v_p3; v_next := v_t4; v_to_next := v_t4 - v_points;
  elsif v_points >= v_t2 then
    v_idx := 2; v_name := 'Silver'; v_pct := v_p2; v_next := v_t3; v_to_next := v_t3 - v_points;
  elsif v_points >= v_t1 then
    v_idx := 1; v_name := 'Bronze'; v_pct := v_p1; v_next := v_t2; v_to_next := v_t2 - v_points;
  else
    v_idx := 0; v_name := ''; v_pct := 0; v_next := v_t1; v_to_next := v_t1 - v_points;
  end if;

  return jsonb_build_object(
    'tier_index', v_idx,
    'tier_name', v_name,
    'discount_pct', v_pct,
    'points', v_points,
    'next_points', v_next,
    'points_to_next', v_to_next
  );
end;
$function$;

-- The logged-in customer's own tier (safe to expose; resolves by auth.uid()).
create or replace function public.get_my_customer_tier()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    return get_customer_tier(null);
  end if;
  select id into v_id from profiles where auth_user_id = auth.uid() limit 1;
  return get_customer_tier(v_id);
end;
$function$;

grant execute on function public.get_customer_tier(uuid) to authenticated;
grant execute on function public.get_my_customer_tier() to authenticated, anon;

-- (3) Apply the tier discount at online checkout. Identical to round-33c except
-- it now also reads the customer's tier discount and combines it with any deal,
-- capped at 30% off the normal store price.
create or replace function public.place_storefront_order(payload jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_wh_id       uuid;
  v_fulfill     text;
  v_method      fulfillment_method;
  v_pickup_wh   uuid;
  v_fulfill_wh  uuid;
  v_region      text;
  v_payment     text;
  v_fees        jsonb;
  v_ship        integer := 0;
  v_total       integer;
  v_name        text;
  v_phone       text;
  v_email       text;
  v_addr        text;
  v_city        text;
  v_notes       text;
  v_cust_id     uuid;
  v_tier        jsonb;
  v_tier_pct    numeric := 0;
  v_tier_name   text := '';
  v_deal_frac   numeric;
  v_total_frac  numeric;
  v_items       jsonb;
  v_item        jsonb;
  v_pid         uuid;
  v_qty         numeric;
  v_base        integer;
  v_override    integer;
  v_normal      integer;
  v_pct         numeric;
  v_unit        integer;
  v_line        integer;
  v_subtotal    integer := 0;
  v_count       integer := 0;
  v_sale_id     uuid;
  v_invoice     text;
begin
  v_wh_id := nullif(payload->>'warehouse_id', '')::uuid;
  if v_wh_id is null then
    raise exception 'warehouse_id required';
  end if;
  perform 1 from warehouses where id = v_wh_id and is_active = true;
  if not found then
    raise exception 'warehouse not found';
  end if;

  v_fulfill := coalesce(nullif(payload->>'fulfillment', ''), 'pickup');
  if v_fulfill not in ('pickup', 'delivery') then
    v_fulfill := 'pickup';
  end if;
  v_method := v_fulfill::fulfillment_method;

  v_payment := lower(coalesce(nullif(payload->>'payment_method', ''), 'cash'));
  if v_payment not in ('cash', 'transfer') then
    v_payment := 'cash';
  end if;

  v_region := lower(coalesce(nullif(payload->>'delivery_region', ''), 'local'));
  if v_region not in ('local', 'national') then
    v_region := 'local';
  end if;

  v_pickup_wh := nullif(payload->>'pickup_warehouse_id', '')::uuid;
  if v_pickup_wh is not null then
    perform 1 from warehouses where id = v_pickup_wh and is_active = true;
    if not found then
      v_pickup_wh := null;
    end if;
  end if;

  v_name  := nullif(trim(payload->'customer'->>'name'), '');
  v_phone := nullif(trim(payload->'customer'->>'phone'), '');
  v_email := nullif(trim(payload->'customer'->>'email'), '');
  if v_name is null or v_phone is null then
    raise exception 'customer name and phone required';
  end if;

  v_addr  := nullif(trim(payload->>'shipping_address'), '');
  v_city  := nullif(trim(payload->>'shipping_city'), '');
  v_notes := nullif(trim(payload->>'delivery_notes'), '');
  if v_method = 'delivery' and v_addr is null then
    raise exception 'shipping address required for delivery';
  end if;

  -- Fee + fulfillment store, computed server-side from store_config.
  select value into v_fees from store_config where key = 'delivery_fees';

  if v_method = 'delivery' then
    v_fulfill_wh := v_wh_id;
    if v_region = 'national' then
      v_ship := coalesce((v_fees->>'nationalDeliveryCents')::int, 0);
    else
      v_ship := coalesce((v_fees->>'localDeliveryCents')::int, 0);
    end if;
  else
    if v_pickup_wh is not null and v_pickup_wh <> v_wh_id then
      v_fulfill_wh := v_pickup_wh;
      select coalesce((e->>'feeCents')::int, 0) into v_ship
        from jsonb_array_elements(coalesce(v_fees->'warehousePickupFees', '[]'::jsonb)) e
       where e->>'fromWarehouseId' = v_wh_id::text
         and e->>'toWarehouseId'   = v_pickup_wh::text
       limit 1;
      v_ship := coalesce(v_ship, 0);
    else
      v_fulfill_wh := v_wh_id;
      v_ship := 0;
    end if;
  end if;

  v_cust_id := null;
  if auth.uid() is not null then
    select id into v_cust_id
      from profiles
     where auth_user_id = auth.uid()
     limit 1;
  end if;

  if v_cust_id is null then
    select id into v_cust_id
      from profiles
     where phone = v_phone
     order by created_at asc
     limit 1;
    if v_cust_id is null then
      insert into profiles (full_name, phone, email, role)
      values (v_name, v_phone, v_email, 'customer')
      returning id into v_cust_id;
    end if;
  end if;

  -- Loyalty tier (0 for staff or below Bronze). Based on PRIOR spend; this new
  -- draft order is not counted yet.
  v_tier := get_customer_tier(v_cust_id);
  v_tier_pct  := coalesce((v_tier->>'discount_pct')::numeric, 0);
  v_tier_name := coalesce(v_tier->>'tier_name', '');

  v_items := payload->'items';
  if v_items is null
     or jsonb_typeof(v_items) <> 'array'
     or jsonb_array_length(v_items) = 0 then
    raise exception 'no items';
  end if;
  if jsonb_array_length(v_items) > 100 then
    raise exception 'too many items';
  end if;

  v_invoice := 'ONL-' || lpad(nextval('public.sales_onl_seq')::text, 4, '0');

  insert into sales (
    source, status, tracking_status, customer_id,
    source_warehouse_id, fulfillment_warehouse_id, fulfillment_method,
    subtotal_cents, shipping_cents, paid_cents, payment_method,
    shipping_address, shipping_city, delivery_notes,
    invoice_number, sold_at
  ) values (
    'online', 'draft', 'received', v_cust_id,
    v_wh_id, v_fulfill_wh, v_method,
    0, v_ship, 0, v_payment,
    v_addr, v_city, v_notes,
    v_invoice, now()
  ) returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(v_items)
  loop
    v_pid := nullif(v_item->>'product_id', '')::uuid;
    v_qty := coalesce((v_item->>'qty')::numeric, 0);
    if v_pid is null or v_qty <= 0 then
      continue;
    end if;

    select price_cents into v_base
      from products
     where id = v_pid and is_active = true and visible_in_store = true;
    if not found then
      continue;
    end if;

    select price_override_cents into v_override
      from product_warehouse_settings
     where product_id = v_pid and warehouse_id = v_wh_id;

    v_normal := coalesce(v_override, v_base);

    select delta_percent into v_pct
      from store_promotions
     where product_id = v_pid
       and (warehouse_id is null or warehouse_id = v_wh_id)
     order by priority desc nulls last, delta_percent desc
     limit 1;

    -- Deal fraction (capped at 30%) + tier fraction, combined and re-capped at 30%.
    v_deal_frac  := least(0.30, coalesce(v_pct, 0) / 100.0);
    v_total_frac := least(0.30, v_deal_frac + (v_tier_pct / 100.0));
    v_unit := round(v_normal * (1 - v_total_frac))::int;

    v_line := (v_unit * v_qty)::integer;
    v_subtotal := v_subtotal + v_line;
    v_count := v_count + 1;

    insert into sale_items (
      sale_id, product_id, qty, unit_price_cents, discount_cents
    ) values (
      v_sale_id, v_pid, v_qty, v_unit, 0
    );
  end loop;

  if v_count = 0 then
    delete from sales where id = v_sale_id;
    raise exception 'no valid items';
  end if;

  -- total_cents is GENERATED; only set subtotal_cents (shipping set at insert).
  update sales
     set subtotal_cents = v_subtotal
   where id = v_sale_id;

  select total_cents into v_total from sales where id = v_sale_id;

  return jsonb_build_object(
    'ok', true,
    'sale_id', v_sale_id,
    'invoice_number', v_invoice,
    'subtotal_cents', v_subtotal,
    'shipping_cents', v_ship,
    'total_cents', coalesce(v_total, v_subtotal + v_ship),
    'payment_method', v_payment,
    'tier_name', v_tier_name,
    'tier_discount_pct', v_tier_pct,
    'item_count', v_count
  );
end;
$function$;
