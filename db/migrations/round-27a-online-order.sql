-- round-27a-online-order.sql
-- The single, locked-down door the public storefront is allowed through.
--
-- create_online_order(payload jsonb):
--   * SECURITY DEFINER so it can write the order despite RLS, but it can ONLY
--     create a draft (pending) online order — it touches nothing else.
--   * Re-prices every line from products / product_warehouse_settings, so a
--     customer cannot tamper with prices in the browser.
--   * Finds or creates the customer profile by phone (no auth user needed).
--   * Does NOT consume stock or record money — the owner confirms the draft in
--     admin, which runs the existing engine.
--
-- Safe to re-run.

create sequence if not exists public.online_order_seq;

create or replace function public.create_online_order(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_wh_id      uuid;
  v_fulfill    text;
  v_method     fulfillment_method;
  v_name       text;
  v_phone      text;
  v_email      text;
  v_addr       text;
  v_city       text;
  v_notes      text;
  v_cust_id    uuid;
  v_items      jsonb;
  v_item       jsonb;
  v_pid        uuid;
  v_qty        numeric;
  v_base       integer;
  v_override   integer;
  v_unit       integer;
  v_line       integer;
  v_subtotal   integer := 0;
  v_count      integer := 0;
  v_sale_id    uuid;
  v_invoice    text;
begin
  -- ---- warehouse ----
  v_wh_id := nullif(payload->>'warehouse_id', '')::uuid;
  if v_wh_id is null then
    raise exception 'warehouse_id required';
  end if;
  perform 1 from warehouses where id = v_wh_id and is_active = true;
  if not found then
    raise exception 'warehouse not found';
  end if;

  -- ---- fulfillment ----
  v_fulfill := coalesce(nullif(payload->>'fulfillment', ''), 'pickup');
  if v_fulfill not in ('pickup', 'delivery') then
    v_fulfill := 'pickup';
  end if;
  v_method := v_fulfill::fulfillment_method;

  -- ---- customer ----
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

  select id into v_cust_id
    from profiles
   where role = 'customer' and phone = v_phone
   order by created_at asc
   limit 1;
  if v_cust_id is null then
    insert into profiles (full_name, phone, email, role)
    values (v_name, v_phone, v_email, 'customer')
    returning id into v_cust_id;
  end if;

  -- ---- items ----
  v_items := payload->'items';
  if v_items is null
     or jsonb_typeof(v_items) <> 'array'
     or jsonb_array_length(v_items) = 0 then
    raise exception 'no items';
  end if;

  v_invoice := 'ONL-' || lpad(nextval('online_order_seq')::text, 4, '0');

  insert into sales (
    source, status, customer_id,
    source_warehouse_id, fulfillment_warehouse_id, fulfillment_method,
    subtotal_cents, total_cents, paid_cents,
    shipping_address, shipping_city, delivery_notes,
    invoice_number, sold_at
  ) values (
    'online', 'draft', v_cust_id,
    v_wh_id, v_wh_id, v_method,
    0, 0, 0,
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
      continue;  -- product no longer available; skip it
    end if;

    select price_override_cents into v_override
      from product_warehouse_settings
     where product_id = v_pid and warehouse_id = v_wh_id;

    v_unit := coalesce(v_override, v_base);
    v_line := (v_unit * v_qty)::integer;
    v_subtotal := v_subtotal + v_line;
    v_count := v_count + 1;

    insert into sale_items (
      sale_id, product_id, qty, unit_price_cents, discount_cents, line_total_cents
    ) values (
      v_sale_id, v_pid, v_qty, v_unit, 0, v_line
    );
  end loop;

  if v_count = 0 then
    delete from sales where id = v_sale_id;
    raise exception 'no valid items';
  end if;

  update sales
     set subtotal_cents = v_subtotal,
         total_cents = v_subtotal
   where id = v_sale_id;

  return jsonb_build_object(
    'ok', true,
    'sale_id', v_sale_id,
    'invoice_number', v_invoice,
    'total_cents', v_subtotal,
    'item_count', v_count
  );
end;
$$;

grant execute on function public.create_online_order(jsonb) to anon, authenticated;
