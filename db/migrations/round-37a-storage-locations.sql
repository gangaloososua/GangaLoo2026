-- round-37a-storage-locations.sql
-- NEW FEATURE: physical storage locations + product placements ("where is the stock kept").
-- This is a physical "where is it" layer only. It does NOT touch the lots / FIFO / money math.
-- Security: staff only (any logged-in profile whose role is NOT 'customer').
-- Safe to re-run: uses "if not exists" / "drop policy if exists".

-- 1) LOCATIONS: named spots inside a warehouse (e.g. "Shelve 1", "Hooks Abajo IZ", "Habitacion Oficina")
create table if not exists public.storage_locations (
  id           uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  name         text not null,
  code         text,
  sort_order   integer not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

-- one location name per warehouse (case-insensitive), so you can't make accidental duplicates
create unique index if not exists storage_locations_wh_name_key
  on public.storage_locations (warehouse_id, lower(name));

create index if not exists storage_locations_wh_idx
  on public.storage_locations (warehouse_id);

-- 2) PLACEMENTS: how many units of a product sit in a given location
create table if not exists public.product_locations (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  location_id uuid not null references public.storage_locations(id) on delete cascade,
  qty         integer not null default 0 check (qty >= 0),
  updated_at  timestamptz not null default now(),
  unique (product_id, location_id)
);

create index if not exists product_locations_product_idx
  on public.product_locations (product_id);

create index if not exists product_locations_location_idx
  on public.product_locations (location_id);

-- 3) SECURITY (RLS): only staff (any logged-in profile that is NOT a customer) can see/change these.
alter table public.storage_locations enable row level security;
alter table public.product_locations enable row level security;

drop policy if exists storage_locations_staff_all on public.storage_locations;
create policy storage_locations_staff_all
  on public.storage_locations
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.auth_user_id = auth.uid()
        and p.role <> 'customer'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.auth_user_id = auth.uid()
        and p.role <> 'customer'
    )
  );

drop policy if exists product_locations_staff_all on public.product_locations;
create policy product_locations_staff_all
  on public.product_locations
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.auth_user_id = auth.uid()
        and p.role <> 'customer'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.auth_user_id = auth.uid()
        and p.role <> 'customer'
    )
  );
