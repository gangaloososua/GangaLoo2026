-- round-72a-us-orders-table.sql
-- US dropship shop: orders table (Phase 3). Additive only.

create table if not exists public.us_orders (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),

  customer_name  text not null,
  customer_email text not null,
  customer_phone text,

  ship_line1   text not null,
  ship_line2   text,
  ship_city    text not null,
  ship_state   text not null,
  ship_zip     text not null,
  ship_country text not null default 'US',

  items        jsonb   not null default '[]'::jsonb,
  subtotal_usd numeric not null default 0,
  shipping_usd numeric not null default 0,
  tax_usd      numeric not null default 0,
  total_usd    numeric not null default 0,

  status         text not null default 'pending',
  payment_method text,
  payment_ref    text,
  paid_at        timestamptz,

  supplier_ref      text,
  supplier_cost_usd numeric,
  internal_notes    text,
  timeline          jsonb not null default '[]'::jsonb,
  created_by        uuid
);

alter table public.us_orders
  add constraint us_orders_status_check
  check (status in ('pending','paid','cancelled','forwarded','shipped','completed'));

create index if not exists us_orders_created_at_idx on public.us_orders (created_at desc);

alter table public.us_orders enable row level security;
revoke all on public.us_orders from anon, authenticated;
grant all on public.us_orders to service_role;
