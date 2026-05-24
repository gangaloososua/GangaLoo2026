-- round-30c-rls-products-warehouses.sql
-- Security sweep: products and warehouses had RLS OFF while the 'authenticated'
-- role held full grants. Since 'authenticated' now includes CUSTOMERS (they
-- share the role with staff), a logged-in customer could in theory read product
-- cost columns or change products/warehouses directly via the database.
--
-- This closes the gap by giving both tables the SAME row-level protection that
-- is already proven on inventory_lots / sales / etc.:
--   * owner + admin            -> full access (read/insert/update/delete)
--   * seller + distributor     -> read only
--   * everyone else (customers)-> nothing
--
-- Safe for the storefront: the public store reads through owner-rights store_*
-- views, which bypass RLS, so the catalog is unaffected.
-- Safe for the admin: owner/admin keep full access; seller/distributor keep read.
-- Mirrors the existing auth_role() helper used by every other policy.
-- Idempotent: drops each policy before recreating it, and enabling RLS twice is
-- harmless.
--
-- ROLLBACK (if ever needed): run
--   alter table public.products   disable row level security;
--   alter table public.warehouses disable row level security;

-- ---------- products ----------
alter table public.products enable row level security;

drop policy if exists products_owner_all on public.products;
create policy products_owner_all on public.products
  for all to authenticated
  using (auth_role() = any (array['owner', 'admin']))
  with check (auth_role() = any (array['owner', 'admin']));

drop policy if exists products_admin_roles_read on public.products;
create policy products_admin_roles_read on public.products
  for select to authenticated
  using (auth_role() = any (array['owner', 'admin', 'seller', 'distributor']));

-- ---------- warehouses ----------
alter table public.warehouses enable row level security;

drop policy if exists warehouses_owner_all on public.warehouses;
create policy warehouses_owner_all on public.warehouses
  for all to authenticated
  using (auth_role() = any (array['owner', 'admin']))
  with check (auth_role() = any (array['owner', 'admin']));

drop policy if exists warehouses_admin_roles_read on public.warehouses;
create policy warehouses_admin_roles_read on public.warehouses
  for select to authenticated
  using (auth_role() = any (array['owner', 'admin', 'seller', 'distributor']));