-- round-72b-create-us-order.sql
-- US dropship shop: public create-order function (Phase 3).
-- Prices are recomputed server-side from the products table; client prices are ignored.

create or replace function public.create_us_order(
  p_customer_name  text,
  p_customer_email text,
  p_customer_phone text,
  p_ship_line1     text,
  p_ship_line2     text,
  p_ship_city      text,
  p_ship_state     text,
  p_ship_zip       text,
  p_items          jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $FN$
declare
  v_item        jsonb;
  v_pid         uuid;
  v_qty         integer;
  v_price       numeric;
  v_name        text;
  v_slug        text;
  v_lines       jsonb := '[]'::jsonb;
  v_subtotal    numeric := 0;
  v_order_id    uuid;
begin
  if coalesce(trim(p_customer_name), '') = '' then
    raise exception 'NAME_REQUIRED';
  end if;
  if coalesce(trim(p_customer_email), '') = '' then
    raise exception 'EMAIL_REQUIRED';
  end if;
  if coalesce(trim(p_ship_line1), '') = ''
     or coalesce(trim(p_ship_city), '') = ''
     or coalesce(trim(p_ship_state), '') = ''
     or coalesce(trim(p_ship_zip), '') = '' then
    raise exception 'ADDRESS_REQUIRED';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'NO_ITEMS';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := greatest(coalesce((v_item->>'qty')::integer, 0), 0);
    if v_qty = 0 then
      continue;
    end if;

    select p.name,
           p.slug,
           public._us_price_usd(
             p.us_price_override_usd,
             p.us_markup_percent,
             nullif(p.cost_calc->>'base_cost_usd','')::numeric
           )
      into v_name, v_slug, v_price
      from public.products p
     where p.id = v_pid
       and p.us_enabled
       and p.is_active
       and p.visible_in_store;

    if v_price is null or v_price <= 0 then
      continue;
    end if;

    v_lines := v_lines || jsonb_build_object(
      'product_id', v_pid,
      'name',       v_name,
      'slug',       v_slug,
      'qty',        v_qty,
      'price_usd',  v_price
    );
    v_subtotal := v_subtotal + (v_price * v_qty);
  end loop;

  if jsonb_array_length(v_lines) = 0 then
    raise exception 'NO_VALID_ITEMS';
  end if;

  insert into public.us_orders (
    customer_name, customer_email, customer_phone,
    ship_line1, ship_line2, ship_city, ship_state, ship_zip,
    items, subtotal_usd, shipping_usd, tax_usd, total_usd,
    status,
    timeline
  ) values (
    trim(p_customer_name), trim(p_customer_email), nullif(trim(p_customer_phone), ''),
    trim(p_ship_line1), nullif(trim(p_ship_line2), ''), trim(p_ship_city), trim(p_ship_state), trim(p_ship_zip),
    v_lines, v_subtotal, 0, 0, v_subtotal,
    'pending',
    jsonb_build_array(jsonb_build_object('label','created','ts', now()))
  )
  returning id into v_order_id;

  return jsonb_build_object(
    'ok', true,
    'order_id', v_order_id,
    'total_usd', v_subtotal
  );
end;
$FN$;

grant execute on function public.create_us_order(
  text, text, text, text, text, text, text, text, jsonb
) to anon, authenticated;
