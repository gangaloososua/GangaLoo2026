-- round-44b-guest-round25.sql
-- Adds: GUEST prices round UP to the next RD$25 (2500 cents). Members unchanged.
-- Re-creates the quote + order functions from round-44a with that rounding.
-- (get_store_public_config is unchanged here but re-included; harmless to re-run.)
-- Original 44a header follows:
-- round-44a-guest-markup.sql
-- GUEST MARKUP: visitors who are NOT logged in pay a markup (store_config
-- 'guest_markup', a percent like 5) on every item; logged-in clients pay the
-- normal price (with their loyalty tier, unchanged). Applied identically in the
-- checkout quote and the actual order so the preview and the charge always match.
-- The product-grid display reads the same value and is handled in the catalog layer.
--
-- "Logged in" is decided by auth.uid() (captured BEFORE the phone-based profile
-- step in place_storefront_order, which assigns a profile even to guests).
-- A guest gets NO loyalty tier (you must sign in for member pricing) and the markup.
-- Members are byte-for-byte unchanged (markup fraction = 0).
--
-- Idempotent: all three are CREATE OR REPLACE. Reads the % via cfg_num('guest_markup',0).

-- ----------------------------------------------------------------------------
-- 1) Public config: expose guest_markup so the storefront can read it.
-- ----------------------------------------------------------------------------
create or replace function public.get_store_public_config()
returns jsonb
language sql
security definer
set search_path to 'public', 'pg_temp'
stable
as $function$
  select jsonb_build_object(
    'delivery_fees',     (select value from store_config where key = 'delivery_fees'),
    'bankName',          (select value from store_config where key = 'bankName'),
    'bankAccount',       (select value from store_config where key = 'bankAccount'),
    'bankAccountName',   (select value from store_config where key = 'bankAccountName'),
    'bankAccountType',   (select value from store_config where key = 'bankAccountType'),
    'online_pay_enabled',(select value from store_config where key = 'online_pay_enabled'),
    'stripe_fee_pct',    (select value from store_config where key = 'stripe_fee_pct'),
    'stripe_fee_fixed',  (select value from store_config where key = 'stripe_fee_fixed'),
    'paypal_fee_pct',    (select value from store_config where key = 'extra_pay_fee_pct'),
    'paypal_fee_fixed',  (select value from store_config where key = 'extra_pay_fee_fixed'),
    'paypal_name',       (select value from store_config where key = 'extra_pay_name'),
    'guest_markup',      (select value from store_config where key = 'guest_markup')
  );
$function$;
grant execute on function public.get_store_public_config() to authenticated, anon;

-- ----------------------------------------------------------------------------
-- 2) Checkout quote: apply guest markup (and no tier for guests).
-- ----------------------------------------------------------------------------
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
  v_is_member   boolean := false;
  v_markup_frac numeric := 0;
  v_tier        jsonb;
  v_tier_pct    numeric := 0;
  v_tier_name   text := '';
  v_items       jsonb;
  v_item        jsonb;
  v_pid         uuid;
  v_qty         numeric;
  v_base        integer;
  v_override    integer;
  v_normal      integer;
  v_pct         numeric;
  v_deal_frac   numeric;
  v_total_frac  numeric;
  v_unit_deal   integer;
  v_unit_comb   integer;
  v_before      bigint := 0;
  v_after       bigint := 0;
begin
  v_wh_id := nullif(payload->>'warehouse_id', '')::uuid;
  if v_wh_id is null then
    return jsonb_build_object('ok', false);
  end if;

  v_is_member := (auth.uid() is not null);
  if v_is_member then
    select id into v_cust_id from profiles where auth_user_id = auth.uid() limit 1;
    v_tier := get_customer_tier(v_cust_id);
    v_tier_pct  := coalesce((v_tier->>'discount_pct')::numeric, 0);
    v_tier_name := coalesce(v_tier->>'tier_name', '');
  else
    -- guest: no member tier, apply markup instead
    v_markup_frac := greatest(0, cfg_num('guest_markup', 0)) / 100.0;
  end if;

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

    v_deal_frac  := least(0.30, coalesce(v_pct, 0) / 100.0);
    v_total_frac := least(0.30, v_deal_frac + (v_tier_pct / 100.0));
    v_unit_deal := round(v_normal * (1 - v_deal_frac) * (1 + v_markup_frac))::int;
    v_unit_comb := round(v_normal * (1 - v_total_frac) * (1 + v_markup_frac))::int;

    -- Guests: round each unit UP to the next RD$25. Members keep exact prices.
    if not v_is_member then
      v_unit_deal := (ceil(v_unit_deal / 2500.0) * 2500)::int;
      v_unit_comb := (ceil(v_unit_comb / 2500.0) * 2500)::int;
    end if;

    v_before := v_before + (v_unit_deal * v_qty)::bigint;
    v_after  := v_after  + (v_unit_comb * v_qty)::bigint;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'subtotal_before_cents', v_before,
    'subtotal_after_cents', v_after,
    'member_discount_cents', v_before - v_after,
    'tier_name', v_tier_name,
    'tier_discount_pct', v_tier_pct,
    'is_guest', not v_is_member,
    'guest_markup_pct', round(v_markup_frac * 100)::int
  );
end;
$function$;
grant execute on function public.get_storefront_quote(jsonb) to authenticated, anon;

-- ----------------------------------------------------------------------------
-- 3) Place order: apply guest markup to the charged unit prices.
-- ----------------------------------------------------------------------------
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
  v_pay_fee     integer := 0;
  v_pay_pct     numeric := 0;
  v_pay_fixed   numeric := 0;
  v_total       integer;
  v_name        text;
  v_phone       text;
  v_email       text;
  v_addr        text;
  v_city        text;
  v_notes       text;
  v_cust_id     uuid;
  v_is_member   boolean := false;
  v_markup_frac numeric := 0;
  v_tier        jsonb;
  v_tier_pct    numeric := 0;
  v_tier_name   text := '';
  v_deal_frac   numeric;
  v_total_frac  numeric;
  v_unit_deal   integer;
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

  -- cash | transfer | stripe | paypal
  v_payment := lower(coalesce(nullif(payload->>'payment_method', ''), 'cash'));
  if v_payment not in ('cash', 'transfer', 'stripe', 'paypal') then
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

  -- Surcharge rate for the chosen card method (fixed is in pesos).
  if v_payment = 'stripe' then
    v_pay_pct := cfg_num('stripe_fee_pct', 0);
    v_pay_fixed := cfg_num('stripe_fee_fixed', 0);
  elsif v_payment = 'paypal' then
    v_pay_pct := cfg_num('extra_pay_fee_pct', 0);
    v_pay_fixed := cfg_num('extra_pay_fee_fixed', 0);
  end if;

  -- Capture login status BEFORE the phone-based profile step below (guests also
  -- get a profile, so we must read auth.uid() now to know who is a member).
  v_is_member := (auth.uid() is not null);

  v_cust_id := null;
  if v_is_member then
    select id into v_cust_id from profiles where auth_user_id = auth.uid() limit 1;
  end if;

  if v_cust_id is null then
    select id into v_cust_id from profiles where phone = v_phone order by created_at asc limit 1;
    if v_cust_id is null then
      insert into profiles (full_name, phone, email, role)
      values (v_name, v_phone, v_email, 'customer')
      returning id into v_cust_id;
    end if;
  end if;

  -- Member -> loyalty tier (unchanged). Guest -> no tier, apply markup instead.
  if v_is_member then
    v_tier := get_customer_tier(v_cust_id);
    v_tier_pct  := coalesce((v_tier->>'discount_pct')::numeric, 0);
    v_tier_name := coalesce(v_tier->>'tier_name', '');
  else
    v_markup_frac := greatest(0, cfg_num('guest_markup', 0)) / 100.0;
  end if;

  v_items := payload->'items';
  if v_items is null or jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
    raise exception 'no items';
  end if;
  if jsonb_array_length(v_items) > 100 then
    raise exception 'too many items';
  end if;

  v_invoice := 'ONL-' || lpad(nextval('public.sales_onl_seq')::text, 4, '0');

  insert into sales (
    source, status, tracking_status, customer_id,
    source_warehouse_id, fulfillment_warehouse_id, fulfillment_method,
    subtotal_cents, shipping_cents, paid_cents, payment_method, payment_fee_cents,
    shipping_address, shipping_city, delivery_notes,
    invoice_number, sold_at
  ) values (
    'online', 'draft', 'received', v_cust_id,
    v_wh_id, v_fulfill_wh, v_method,
    0, v_ship, 0, v_payment, 0,
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

    v_deal_frac  := least(0.30, coalesce(v_pct, 0) / 100.0);
    v_total_frac := least(0.30, v_deal_frac + (v_tier_pct / 100.0));
    v_unit_deal := round(v_normal * (1 - v_deal_frac) * (1 + v_markup_frac))::int;
    v_unit      := round(v_normal * (1 - v_total_frac) * (1 + v_markup_frac))::int;

    -- Guests: round each unit UP to the next RD$25. Members keep exact prices.
    if not v_is_member then
      v_unit_deal := (ceil(v_unit_deal / 2500.0) * 2500)::int;
      v_unit      := (ceil(v_unit / 2500.0) * 2500)::int;
    end if;

    v_sub_before := v_sub_before + (v_unit_deal * v_qty)::int;
    v_line := (v_unit * v_qty)::integer;
    v_subtotal := v_subtotal + v_line;
    v_count := v_count + 1;

    insert into sale_items (sale_id, product_id, qty, unit_price_cents, discount_cents)
    values (v_sale_id, v_pid, v_qty, v_unit, 0);
  end loop;

  if v_count = 0 then
    delete from sales where id = v_sale_id;
    raise exception 'no valid items';
  end if;

  -- Surcharge on (items after discount + shipping). Fixed portion is pesos.
  if v_pay_pct > 0 or v_pay_fixed > 0 then
    v_pay_fee := round((v_subtotal + v_ship) * v_pay_pct / 100.0)::int + round(v_pay_fixed * 100)::int;
  end if;

  update sales
     set subtotal_cents = v_subtotal,
         payment_fee_cents = v_pay_fee
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
    'payment_fee_cents', v_pay_fee,
    'total_cents', coalesce(v_total, v_subtotal + v_ship),
    'amount_due_cents', coalesce(v_total, v_subtotal + v_ship) + v_pay_fee,
    'payment_method', v_payment,
    'tier_name', v_tier_name,
    'tier_discount_pct', v_tier_pct,
    'is_guest', not v_is_member,
    'item_count', v_count
  );
end;
$function$;
