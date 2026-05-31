-- round-46b-club-online-uses-club-price.sql
-- SUPERSEDES round-46a. Correct Club model: a Club member pays each product's
-- CLUB PRICE (products.club_price_cents), and loyalty + any deal still come off
-- ON TOP of that club price, capped at 30% off the club price. This mirrors how
-- the in-person register already prices, so online and the till now agree.
--
-- "Club member" = profiles.is_club_member = true (role customer).
-- The flat-% pieces from round-45c/46a are no longer used by these functions
-- (left in place, harmless; nothing real was ever priced by them).
--
-- Per line, for a Club member with a club price set on the product:
--   member normal price = club_price_cents
--   charged = member normal price × (1 − LEAST(0.30, deal% + loyalty%))
-- For everyone else:
--   normal price = warehouse override price, else base price
--   charged = normal price × (1 − LEAST(0.30, deal% + loyalty%))
-- (loyalty% = get_customer_tier; deal% = store_promotions; both unchanged.)

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) get_storefront_quote — read-only checkout preview.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.get_storefront_quote(payload jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_wh_id       uuid;
  v_cust_id     uuid;
  v_tier        jsonb;
  v_tier_pct    numeric := 0;
  v_tier_name   text := '';
  v_is_member   boolean := false;
  v_items       jsonb;
  v_item        jsonb;
  v_pid         uuid;
  v_qty         numeric;
  v_base        integer;
  v_club        integer;
  v_override    integer;
  v_list_normal integer;   -- non-member normal price (override, else base)
  v_mem_normal  integer;   -- member normal price (club price when set)
  v_pct         numeric;
  v_deal_frac   numeric;
  v_total_frac  numeric;
  v_unit_list   integer;   -- what a non-member pays (deal only)
  v_unit_mem    integer;   -- what this customer pays (club + deal + loyalty)
  v_before      bigint := 0;
  v_after       bigint := 0;
begin
  v_wh_id := nullif(payload->>'warehouse_id', '')::uuid;
  if v_wh_id is null then
    return jsonb_build_object('ok', false);
  end if;

  if auth.uid() is not null then
    select id into v_cust_id from profiles where auth_user_id = auth.uid() limit 1;
  end if;

  v_tier := get_customer_tier(v_cust_id);
  v_tier_pct  := coalesce((v_tier->>'discount_pct')::numeric, 0);
  v_tier_name := coalesce(v_tier->>'tier_name', '');

  if v_cust_id is not null then
    select coalesce(is_club_member, false)
      into v_is_member
      from profiles
     where id = v_cust_id and role = 'customer';
  end if;
  v_is_member := coalesce(v_is_member, false);

  v_items := payload->'items';
  if v_items is null or jsonb_typeof(v_items) <> 'array' then
    v_items := '[]'::jsonb;
  end if;

  for v_item in select * from jsonb_array_elements(v_items)
  loop
    v_pid := nullif(v_item->>'product_id', '')::uuid;
    v_qty := coalesce((v_item->>'qty')::numeric, 0);
    if v_pid is null or v_qty <= 0 then
      continue;
    end if;

    select price_cents, club_price_cents
      into v_base, v_club
      from products
     where id = v_pid and is_active = true and visible_in_store = true;
    if not found then
      continue;
    end if;

    select price_override_cents into v_override
      from product_warehouse_settings
     where product_id = v_pid and warehouse_id = v_wh_id;

    v_list_normal := coalesce(v_override, v_base);
    if v_is_member and v_club is not null and v_club > 0 then
      v_mem_normal := v_club;            -- member pays the club price
    else
      v_mem_normal := v_list_normal;
    end if;

    select delta_percent into v_pct
      from store_promotions
     where product_id = v_pid
       and (warehouse_id is null or warehouse_id = v_wh_id)
     order by priority desc nulls last, delta_percent desc
     limit 1;

    v_deal_frac  := least(0.30, coalesce(v_pct, 0) / 100.0);
    v_total_frac := least(0.30, v_deal_frac + (v_tier_pct / 100.0));

    v_unit_list := round(v_list_normal * (1 - v_deal_frac))::int;  -- non-member baseline
    v_unit_mem  := round(v_mem_normal  * (1 - v_total_frac))::int; -- this customer

    v_before := v_before + (v_unit_list * v_qty)::bigint;
    v_after  := v_after  + (v_unit_mem  * v_qty)::bigint;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'subtotal_before_cents', v_before,
    'subtotal_after_cents', v_after,
    'member_discount_cents', v_before - v_after,
    'tier_name', v_tier_name,
    'tier_discount_pct', v_tier_pct,
    'is_club_member', v_is_member
  );
end;
$function$;

grant execute on function public.get_storefront_quote(jsonb) to authenticated, anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) place_storefront_order — the actual charge.
-- ─────────────────────────────────────────────────────────────────────────────
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
  v_is_member   boolean := false;
  v_items       jsonb;
  v_item        jsonb;
  v_pid         uuid;
  v_qty         numeric;
  v_base        integer;
  v_club        integer;
  v_override    integer;
  v_list_normal integer;
  v_mem_normal  integer;
  v_pct         numeric;
  v_deal_frac   numeric;
  v_total_frac  numeric;
  v_unit_list   integer;
  v_unit        integer;
  v_line        integer;
  v_subtotal    integer := 0;
  v_sub_before  integer := 0;
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

  v_tier := get_customer_tier(v_cust_id);
  v_tier_pct  := coalesce((v_tier->>'discount_pct')::numeric, 0);
  v_tier_name := coalesce(v_tier->>'tier_name', '');

  select coalesce(is_club_member, false)
    into v_is_member
    from profiles
   where id = v_cust_id and role = 'customer';
  v_is_member := coalesce(v_is_member, false);

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

    select price_cents, club_price_cents
      into v_base, v_club
      from products
     where id = v_pid and is_active = true and visible_in_store = true;
    if not found then
      continue;
    end if;

    select price_override_cents into v_override
      from product_warehouse_settings
     where product_id = v_pid and warehouse_id = v_wh_id;

    v_list_normal := coalesce(v_override, v_base);
    if v_is_member and v_club is not null and v_club > 0 then
      v_mem_normal := v_club;
    else
      v_mem_normal := v_list_normal;
    end if;

    select delta_percent into v_pct
      from store_promotions
     where product_id = v_pid
       and (warehouse_id is null or warehouse_id = v_wh_id)
     order by priority desc nulls last, delta_percent desc
     limit 1;

    v_deal_frac  := least(0.30, coalesce(v_pct, 0) / 100.0);
    v_total_frac := least(0.30, v_deal_frac + (v_tier_pct / 100.0));

    v_unit_list := round(v_list_normal * (1 - v_deal_frac))::int;  -- non-member baseline
    v_unit      := round(v_mem_normal  * (1 - v_total_frac))::int; -- charged price

    v_sub_before := v_sub_before + (v_unit_list * v_qty)::int;
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

  update sales
     set subtotal_cents = v_subtotal
   where id = v_sale_id;

  select total_cents into v_total from sales where id = v_sale_id;

  return jsonb_build_object(
    'ok', true,
    'sale_id', v_sale_id,
    'invoice_number', v_invoice,
    'subtotal_cents', v_subtotal,
    'subtotal_before_cents', v_sub_before,
    'member_discount_cents', v_sub_before - v_subtotal,
    'shipping_cents', v_ship,
    'total_cents', coalesce(v_total, v_subtotal + v_ship),
    'payment_method', v_payment,
    'tier_name', v_tier_name,
    'tier_discount_pct', v_tier_pct,
    'is_club_member', v_is_member,
    'item_count', v_count
  );
end;
$function$;
