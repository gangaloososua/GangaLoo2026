-- round-39-noninventory-products-01-schema.sql
-- Adds is_inventory flag to products so the same admin can sell "service" /
-- non-inventory items (e.g. Pedido Amazon, Pedido Temu — third-party
-- purchase placeholders the user rings up as a sale without an underlying
-- lot).
--
-- Defaults to true so every existing product is unaffected. Subsequent
-- migrations in this round (02, 03, 04) patch the sale RPCs to skip lot
-- consumption, stock checks, cogs, and stock_movements when this flag is
-- false.
--
-- Idempotent.

alter table public.products
  add column if not exists is_inventory boolean not null default true;

comment on column public.products.is_inventory is
  'When false, this product is a service item: sale RPCs skip lot consumption, '
  'stock checks, COGS calculation, and stock_movements. Use for third-party '
  'purchase placeholders (e.g. "Pedido Amazon") or any non-physical item.';
