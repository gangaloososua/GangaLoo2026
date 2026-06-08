-- round-43-coupon-codes-06-quote-preview.sql
-- Teach get_storefront_quote to preview a coupon, so checkout can show the
-- discount BEFORE the order is confirmed.
--
-- WHAT CHANGED (everything else is byte-for-byte the original):
--   * Reads optional payload->>'coupon_code'.
--   * After computing the authoritative subtotal (v_after), calls validate_coupon
--     with the SAME base, the quote's warehouse as the store, and channel
--     'online' — so the previewed discount exactly matches what place_storefront_order
--     will apply at confirm time. (Store-scoped coupons preview correctly because
--     we pass v_wh_id.)
--   * Returns coupon_applied / coupon_code / coupon_discount_cents and a
--     total_after_coupon_cents convenience value.
--   * Backward compatible: no coupon_code -> the new fields just report "none".
--   * Read-only (STABLE) — no order or profile is created. This is the one
--     public surface that can report a code's validity; acceptable for codes
--     printed on public flyers.

CREATE OR REPLACE FUNCTION public.get_storefront_quote(payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_wh_id       uuid;
  v_cust_id     uuid;
  v_is_guest    boolean := false;
  v_markup      numeric := 0;
  v_raw         text;
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
  v_sale        integer;
  v_override    integer;
  v_list_normal integer;
  v_mem_normal  integer;
  v_pct         numeric;
  v_deal_frac   numeric;
  v_total_frac  numeric;
  v_unit_list   integer;
  v_unit_mem    integer;
  v_before      bigint := 0;
  v_after       bigint := 0;

  -- Round 43: coupon preview
  v_coupon_code     text;
  v_coupon_discount integer := 0;
  v_coupon_reason   text := null;
begin
  v_wh_id := nullif(payload->>'warehouse_id', '')::uuid;
  if v_wh_id is null then
    return jsonb_build_object('ok', false);
  end if;

  if auth.uid() is not null then
    select id into v_cust_id from profiles where auth_user_id = auth.uid() limit 1;
  end if;

  v_is_guest := (v_cust_id is null);
  if v_is_guest then
    select value #>> '{}' into v_raw from store_config where key = 'guest_markup';
    if v_raw is not null and v_raw ~ '^[0-9]+(\.[0-9]+)?$' then
      v_markup := v_raw::numeric;
    end if;
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

    select price_cents, club_price_cents, sale_price_cents
      into v_base, v_club, v_sale
      from products
     where id = v_pid and is_active = true and visible_in_store = true;
    if not found then
      continue;
    end if;

    select price_override_cents into v_override
      from product_warehouse_settings
     where product_id = v_pid and warehouse_id = v_wh_id;

    v_list_normal := coalesce(v_override, v_base);

    if v_cust_id is not null and v_sale is not null and v_sale > 0
       and v_sale < v_list_normal then
      v_list_normal := v_sale;
    end if;

    if v_is_member and v_club is not null and v_club > 0 then
      v_mem_normal := v_club;
      if v_cust_id is not null and v_sale is not null and v_sale > 0
         and v_sale < v_mem_normal then
        v_mem_normal := v_sale;
      end if;
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

    v_unit_list := round(v_list_normal * (1 - v_deal_frac))::int;
    v_unit_mem  := round(v_mem_normal  * (1 - v_total_frac))::int;

    if v_is_guest then
      v_unit_list := (ceil(v_unit_list::numeric * (1 + v_markup / 100.0) / 2500.0) * 2500)::int;
      v_unit_mem  := (ceil(v_unit_mem::numeric  * (1 + v_markup / 100.0) / 2500.0) * 2500)::int;
    end if;

    v_before := v_before + (v_unit_list * v_qty)::bigint;
    v_after  := v_after  + (v_unit_mem  * v_qty)::bigint;
  end loop;

  -- Round 43: coupon preview against the SAME subtotal the order will use,
  -- scoped to this storefront's warehouse and the 'online' channel. Invalid /
  -- wrong-scope codes simply report zero (never an error).
  v_coupon_code := nullif(trim(payload->>'coupon_code'), '');
  if v_coupon_code is not null and v_after > 0 then
    select discount_cents, reason
      into v_coupon_discount, v_coupon_reason
      from public.validate_coupon(
             v_coupon_code, v_wh_id, 'online'::sale_source, v_after::int, now()
           );
    if v_coupon_reason is distinct from 'ok' then
      v_coupon_discount := 0;
    end if;
    if v_coupon_discount > v_after then
      v_coupon_discount := v_after::int;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'subtotal_before_cents', v_before,
    'subtotal_after_cents', v_after,
    'member_discount_cents', v_before - v_after,
    'tier_name', v_tier_name,
    'tier_discount_pct', v_tier_pct,
    'is_club_member', v_is_member,
    'coupon_code', v_coupon_code,
    'coupon_applied', (v_coupon_discount > 0),
    'coupon_discount_cents', v_coupon_discount,
    'total_after_coupon_cents', greatest(v_after - v_coupon_discount, 0)
  );
end;
$function$;
