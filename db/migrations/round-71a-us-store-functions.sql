-- Round 71a — US shop Phase 2: safe storefront read functions
--
-- The public /us storefront must read US products WITHOUT ever seeing cost or
-- markup (same protection as store_products vs products on the DR side). These
-- SECURITY DEFINER functions compute the US price INSIDE the database and
-- return only display-safe columns.
--
-- US price (matches the product form preview):
--   * us_price_override_usd if set (> 0), else
--   * cost * (1 + us_markup_percent/100), where cost = cost_calc->>'base_cost_usd'
--     (the value typed on the Calculator tab — NOT the products.base_cost_usd
--     column, which can differ).
--   * A us_enabled product with NO resolvable price (no override AND no/zero
--     cost) is EXCLUDED — no $0 products in the shop.
--
-- Only us_enabled AND is_active AND visible_in_store products are returned.
-- Tax and shipping are NOT part of the price (those are Phase 3 / checkout).

-- Single helper for the price so list + detail stay identical.
create or replace function public._us_price_usd(
  p_override numeric,
  p_markup numeric,
  p_cost numeric
)
returns numeric
language sql
immutable
as $$
  select case
    when p_override is not null and p_override > 0
      then round(p_override, 2)
    when p_cost is not null and p_cost > 0
      then round(p_cost * (1 + coalesce(p_markup, 0) / 100.0), 2)
    else null
  end
$$;

-- List: all sellable US products with a resolvable price.
create or replace function public.get_us_store_products()
returns table (
  id uuid,
  name text,
  slug text,
  description text,
  primary_image_url text,
  us_price_usd numeric
)
language sql
security definer
set search_path = public
as $$
  select
    p.id,
    p.name,
    p.slug,
    p.description,
    p.primary_image_url,
    public._us_price_usd(
      p.us_price_override_usd,
      p.us_markup_percent,
      nullif(p.cost_calc->>'base_cost_usd', '')::numeric
    ) as us_price_usd
  from products p
  where p.us_enabled = true
    and p.is_active = true
    and p.visible_in_store = true
    and public._us_price_usd(
      p.us_price_override_usd,
      p.us_markup_percent,
      nullif(p.cost_calc->>'base_cost_usd', '')::numeric
    ) is not null
  order by p.name asc;
$$;

-- Detail: one US product by slug (same price + safe columns).
create or replace function public.get_us_store_product(p_slug text)
returns table (
  id uuid,
  name text,
  slug text,
  description text,
  primary_image_url text,
  us_price_usd numeric
)
language sql
security definer
set search_path = public
as $$
  select
    p.id,
    p.name,
    p.slug,
    p.description,
    p.primary_image_url,
    public._us_price_usd(
      p.us_price_override_usd,
      p.us_markup_percent,
      nullif(p.cost_calc->>'base_cost_usd', '')::numeric
    ) as us_price_usd
  from products p
  where p.slug = p_slug
    and p.us_enabled = true
    and p.is_active = true
    and p.visible_in_store = true
    and public._us_price_usd(
      p.us_price_override_usd,
      p.us_markup_percent,
      nullif(p.cost_calc->>'base_cost_usd', '')::numeric
    ) is not null
  limit 1;
$$;

-- The price helper reads no table, so it's safe to expose. The two store
-- functions are SECURITY DEFINER and return only display-safe columns, so the
-- public (anon) storefront may call them.
grant execute on function public._us_price_usd(numeric, numeric, numeric) to anon, authenticated;
grant execute on function public.get_us_store_products() to anon, authenticated;
grant execute on function public.get_us_store_product(text) to anon, authenticated;
