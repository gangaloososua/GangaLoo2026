-- Round 69a — US dropship shop: us_products table
--
-- Phase 1 of the US shop (see US-DROPSHIP-PLAN.md). A SEPARATE table from
-- public.products on purpose: US products are true dropship (no inventory),
-- priced in USD as supplier cost + markup, English, and must NEVER leak into
-- the DR storefront / feed / POS. Keeping them in their own table means
-- nothing that reads public.products has to change.
--
-- Pricing model (decided with owner):
--   * store supplier_cost_usd, supplier_shipping_usd, markup_percent (default 5)
--   * optional price_override_usd: when set, IT is the price (markup ignored)
--   * the SHOWN price is COMPUTED in code / a read fn, never stored, so it
--     can't drift. effective = override, else (cost + shipping) * (1 + markup/100)
--   * NO sale price yet (kept simple for v1)
--   * tax and customer-facing shipping charges are Phase 3 (checkout), not here
--
-- Purely additive. Touches nothing existing.

create table if not exists public.us_products (
  id                    uuid primary key default gen_random_uuid(),

  -- identity / display
  sku                   text,                              -- optional internal ref
  name                  text not null,
  slug                  text not null unique,
  description           text,

  -- pricing (USD). Money kept as numeric dollars here (NOT cents) to match
  -- the calculator-style usd columns already on public.products
  -- (base_cost_usd, shipping_usd are numeric). Checkout (Phase 3) will deal
  -- in cents at charge time.
  supplier_cost_usd     numeric not null default 0,
  supplier_shipping_usd numeric not null default 0,
  markup_percent        numeric not null default 5,        -- owner default 5%
  price_override_usd    numeric,                           -- null = use markup

  -- sourcing / media
  supplier_url          text,                              -- supplier product page (to forward the order)
  primary_image_url     text,

  -- simple text category for v1 (can become a real table later if needed)
  category              text,

  -- visibility (mirrors the active vs publicly-shown split on products)
  is_active             boolean not null default true,
  visible_in_store      boolean not null default true,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- keep updated_at fresh on edits (reuse the standard trigger pattern)
create or replace function public.us_products_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_us_products_touch on public.us_products;
create trigger trg_us_products_touch
  before update on public.us_products
  for each row execute function public.us_products_touch_updated_at();

-- helpful indexes
create index if not exists us_products_active_idx
  on public.us_products (is_active, visible_in_store);
create index if not exists us_products_category_idx
  on public.us_products (category);

-- RLS ON, locked down. Admin reads/writes go through the service-role
-- client inside requireOwner-gated actions (like the payroll_* tables).
-- The public storefront (Phase 2) will read via a SAFE view / read fn that
-- exposes only display columns + the computed price — NEVER supplier_cost,
-- markup, or supplier_url. (Same pattern as store_products vs products.)
alter table public.us_products enable row level security;
revoke all on table public.us_products from anon, authenticated;
grant all on table public.us_products to service_role;
