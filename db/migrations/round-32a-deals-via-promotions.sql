-- round-32a-deals-via-promotions.sql
-- Deal of the Day / Week -- STAGE 3a. Switches the SOURCE of online deals from
-- the warehouse_offers experiment to your existing discount_rules PROMOTIONS,
-- so deals are created in one place (the Promotion screen).
--
-- 1) Adds a small `deal_slot` label to discount_rules ('daily' | 'weekly' |
--    NULL). A promotion with deal_slot set is an ONLINE featured deal.
-- 2) Adds a SAFE view `store_promotions` (owner-rights, customer-safe) of
--    active, non-expired online deal promotions, optionally store-scoped.
-- 3) Recreates place_storefront_order so online checkout charges the deal price
--    (percent off the normal store price, capped at 30%). Safe to re-run.

alter table public.discount_rules
  add column if not exists deal_slot text;
alter table public.discount_rules
  drop constraint if exists discount_rules_deal_slot_chk;
alter table public.discount_rules
  add constraint discount_rules_deal_slot_chk
  check (deal_slot is null or deal_slot in ('daily', 'weekly'));

create or replace view public.store_promotions as
select
  dr.id,
  dr.scope_product_id   as product_id,
  dr.scope_warehouse_id as warehouse_id,
  dr.deal_slot,
  dr.delta_percent,
  dr.ends_at,
  dr.priority
from public.discount_rules dr
where dr.kind = 'promotion'
  and dr.is_active = true
  and dr.deal_slot in ('daily', 'weekly')
  and dr.scope_product_id is not null
  and (dr.starts_at is null or dr.starts_at <= now())
  and (dr.ends_at is null or dr.ends_at > now());

grant select on public.store_promotions to anon, authenticated;

create or replace function public.place_storefront_order(payload jsonb)
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
  v_normal     integer;
  v_pct        numeric;
  v_unit       integer;
  v_line       integer;
  v_subtotal   integer := 0;
  v_count      integer := 0;
  v_sale_id    uuid;
  v_invoice    text;
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
    subtotal_cents, paid_cents,
    shipping_address, shipping_city, delivery_notes,
    invoice_number, sold_at
  ) values (
    'online', 'draft', 'received', v_cust_id,
    v_wh_id, v_wh_id, v_method,
    0, 0,
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

  update sales set subtotal_cents = v_subtotal where id = v_sale_id;

  return jsonb_build_object(
    'ok', true,
    'sale_id', v_sale_id,
    'invoice_number', v_invoice,
    'total_cents', v_subtotal,
    'item_count', v_count
  );
end;
$$;