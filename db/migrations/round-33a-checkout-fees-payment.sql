-- round-33a-checkout-fees-payment.sql
-- Storefront checkout: delivery/pickup fees + payment method.
--
-- What this adds (NO new tables -- fees already live in store_config.delivery_fees):
--   1. sales.payment_method  (text)  -- records the customer's choice: 'cash' | 'transfer'
--   2. place_storefront_order() now accepts:
--        fulfillment         : 'pickup' | 'delivery'   (existing)
--        pickup_warehouse_id : uuid  -- which store they'll collect from (pickup only)
--        delivery_region     : 'local' | 'national'    (delivery only)
--        payment_method      : 'cash' | 'transfer'
--      and computes the fee SERVER-SIDE from store_config.delivery_fees so the
--      customer cannot tamper with it:
--        - pickup at the SAME store          -> fee 0,  fulfilled by that store
--        - pickup at ANOTHER store           -> warehousePickupFees[from->to].feeCents,
--                                               fulfilled by the OTHER store, but stock
--                                               still leaves the ORIGINAL store
--                                               (source_warehouse_id unchanged)
--        - delivery local                    -> localDeliveryCents
--        - delivery national                 -> nationalDeliveryCents
--      The fee is written to sales.shipping_cents, and sales.total_cents is now
--      set (= subtotal + shipping); the old code left total_cents null.
--
-- Backward compatible: a payload without the new fields behaves exactly as before
-- (pickup at the ordering store, no fee, payment defaults to 'cash').

alter table sales add column if not exists payment_method text;
comment on column sales.payment_method is
  'Customer-selected payment method on online orders: cash | transfer (more later).';

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

  -- Payment method (this slice: cash | transfer; anything else -> cash).
  v_payment := lower(coalesce(nullif(payload->>'payment_method', ''), 'cash'));
  if v_payment not in ('cash', 'transfer') then
    v_payment := 'cash';
  end if;

  -- Delivery region (delivery only): local | national.
  v_region := lower(coalesce(nullif(payload->>'delivery_region', ''), 'local'));
  if v_region not in ('local', 'national') then
    v_region := 'local';
  end if;

  -- Chosen pickup store (pickup only). Validate it's a real active store.
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

  -- ----------------------------------------------------------------------
  -- Fee + fulfillment store, computed server-side from store_config.
  -- ----------------------------------------------------------------------
  select value into v_fees from store_config where key = 'delivery_fees';

  if v_method = 'delivery' then
    -- Delivered from (and stock out of) the ordering store.
    v_fulfill_wh := v_wh_id;
    if v_region = 'national' then
      v_ship := coalesce((v_fees->>'nationalDeliveryCents')::int, 0);
    else
      v_ship := coalesce((v_fees->>'localDeliveryCents')::int, 0);
    end if;
  else
    -- Pickup. If they chose a DIFFERENT store, charge the move fee and mark
    -- that store as the fulfiller -- but stock still leaves the ORIGINAL store
    -- (source_warehouse_id stays v_wh_id below).
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

  -- (1) Logged-in customer: attach the order to THEIR own profile. auth.uid()
  -- is the calling user even though this function is SECURITY DEFINER, so this
  -- can only ever resolve to the caller's own account.
  v_cust_id := null;
  if auth.uid() is not null then
    select id into v_cust_id
      from profiles
     where auth_user_id = auth.uid()
     limit 1;
  end if;

  -- (2) Guest / not logged in: match by phone across ALL roles (phone is
  -- globally unique); reuse if found, else create a fresh customer profile.
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

    -- Normal price in this store (per-store override, else base).
    v_normal := coalesce(v_override, v_base);

    -- Active online deal? store_promotions exposes only promotions flagged as
    -- online daily/weekly deals, already filtered to the live window. We honor
    -- the one for this product that matches this store (or applies to all
    -- stores), highest priority. The 30% maximum discount cap matches the
    -- in-person promotion rules. When no deal applies, price stays normal --
    -- so an expired deal reverts automatically.
    select delta_percent into v_pct
      from store_promotions
     where product_id = v_pid
       and (warehouse_id is null or warehouse_id = v_wh_id)
     order by priority desc nulls last, delta_percent desc
     limit 1;

    if v_pct is not null then
      v_unit := round(v_normal * greatest(0.70, 1 - (v_pct / 100.0)))::int;
    else
      v_unit := v_normal;
    end if;
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

  v_total := v_subtotal + v_ship;
  update sales
     set subtotal_cents = v_subtotal,
         total_cents    = v_total
   where id = v_sale_id;

  return jsonb_build_object(
    'ok', true,
    'sale_id', v_sale_id,
    'invoice_number', v_invoice,
    'subtotal_cents', v_subtotal,
    'shipping_cents', v_ship,
    'total_cents', v_total,
    'payment_method', v_payment,
    'item_count', v_count
  );
end;
$function$;
