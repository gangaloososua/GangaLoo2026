-- Round 70a — US dropship shop: US flags + pricing on existing products
--
-- New approach (replaces the abandoned separate us_products table from 69a):
-- the SAME products already entered for the DR market can also be shown in the
-- US shop, flagged per product, priced in USD with NO commission/club/loyalty
-- add-ons. No double entry.
--
-- US price model (decided with owner):
--   * us_enabled OFF by default -> only flagged products appear in the US shop.
--   * us_price_override_usd: when set (> 0), that IS the US price.
--   * else: base_cost_usd * (1 + us_markup_percent/100).
--   * if a product is us_enabled but has NO base_cost_usd AND no override, the
--     US shop must SKIP it (no $0 products) — enforced in code, not here.
--
-- Purely additive. The DR storefront / POS / feed do NOT read these columns,
-- so nothing existing changes.

alter table public.products
  add column if not exists us_enabled boolean not null default false,
  add column if not exists us_markup_percent numeric not null default 5,
  add column if not exists us_price_override_usd numeric;

-- Fast lookup of the US catalog (only the flagged rows).
create index if not exists products_us_enabled_idx
  on public.products (us_enabled)
  where us_enabled;
