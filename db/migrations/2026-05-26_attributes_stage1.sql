-- ============================================================================
-- Migration: Product Attributes — Stage 1 (data foundation)
-- Date: 2026-05-26
-- Feature: Product Attributes & Store Filters (see FEATURE-PLAN-attributes.md)
--
-- Scope: ADMIN-ONLY. Three new tables, no data backfill, no changes to any
--        existing table, ZERO storefront risk (store_* tables untouched).
--
-- Conventions matched against live schema this session (read-only checks):
--   - PK default uuid_generate_v4()  (as on `categories`, NOT gen_random_uuid)
--   - timestamptz NOT NULL default now() for created_at / updated_at
--   - is_active boolean NOT NULL default true; display_order int NOT NULL default 0
--   - slug text NOT NULL; uniqueness scoped like categories(parent_id, slug)
--   - RLS: single ALL policy for {authenticated}, gated role <> 'customer',
--          same expression for USING and WITH CHECK (copied from
--          product_categories_staff_all)
--
-- Pure DDL on new objects only = non-destructive, so this is wrapped as a
-- single all-or-nothing transaction (atomic create), NOT the preview/rollback
-- dance we use for data changes. Run it once; confirm with the standalone
-- verification SELECT at the very bottom (outside any transaction).
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1) attributes  (entity: "Color", "Length", "Texture", ...)
-- ----------------------------------------------------------------------------
create table public.attributes (
  id                uuid        not null default uuid_generate_v4(),
  name              text        not null,
  slug              text        not null,
  display_order     integer     not null default 0,
  is_active         boolean     not null default true,
  single_value_only boolean     not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint attributes_pkey primary key (id),
  constraint attributes_slug_key unique (slug)
);

comment on table public.attributes is
  'Product attribute types (Color, Length, ...). single_value_only = enforce one value per product for this attribute (enforced in app, see Stage 3).';

-- ----------------------------------------------------------------------------
-- 2) attribute_values  (entity: "Black", "26\"", "Wavy", ...)
-- ----------------------------------------------------------------------------
create table public.attribute_values (
  id            uuid        not null default uuid_generate_v4(),
  attribute_id  uuid        not null,
  value         text        not null,
  slug          text        not null,
  display_order integer     not null default 0,
  is_active     boolean     not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint attribute_values_pkey primary key (id),
  constraint attribute_values_attribute_id_fkey
    foreign key (attribute_id) references public.attributes (id) on delete cascade,
  -- slug unique WITHIN an attribute (mirrors categories' (parent_id, slug))
  constraint attribute_values_attribute_id_slug_key unique (attribute_id, slug)
);

-- ordered listing of an attribute's values
-- (mirrors idx_categories_parent on (parent_id, display_order))
create index idx_attribute_values_attribute
  on public.attribute_values (attribute_id, display_order);

-- ----------------------------------------------------------------------------
-- 3) product_attribute_values  (link: which values a product has)
--    Pure many-to-many. Supports both single- and multi-value attributes;
--    single-value is enforced in the app via attributes.single_value_only.
--    (mirrors product_categories: composite PK, uuid FKs, NOT NULL)
-- ----------------------------------------------------------------------------
create table public.product_attribute_values (
  product_id         uuid not null,
  attribute_value_id uuid not null,
  constraint product_attribute_values_pkey
    primary key (product_id, attribute_value_id),
  constraint product_attribute_values_product_id_fkey
    foreign key (product_id) references public.products (id) on delete cascade,
  constraint product_attribute_values_attribute_value_id_fkey
    foreign key (attribute_value_id) references public.attribute_values (id) on delete cascade
);

-- reverse lookup: "all products that are Black"
-- (mirrors idx_pc_category on product_categories(category_id))
create index idx_pav_value
  on public.product_attribute_values (attribute_value_id);

-- ----------------------------------------------------------------------------
-- 4) RLS — copied verbatim from product_categories_staff_all
--    (ALL, {authenticated}, profile role <> 'customer', same USING/WITH CHECK)
-- ----------------------------------------------------------------------------
alter table public.attributes                enable row level security;
alter table public.attribute_values          enable row level security;
alter table public.product_attribute_values  enable row level security;

create policy attributes_staff_all on public.attributes
  for all to authenticated
  using      (exists (select 1 from profiles p
                where p.auth_user_id = auth.uid() and p.role <> 'customer'::user_role))
  with check (exists (select 1 from profiles p
                where p.auth_user_id = auth.uid() and p.role <> 'customer'::user_role));

create policy attribute_values_staff_all on public.attribute_values
  for all to authenticated
  using      (exists (select 1 from profiles p
                where p.auth_user_id = auth.uid() and p.role <> 'customer'::user_role))
  with check (exists (select 1 from profiles p
                where p.auth_user_id = auth.uid() and p.role <> 'customer'::user_role));

create policy product_attribute_values_staff_all on public.product_attribute_values
  for all to authenticated
  using      (exists (select 1 from profiles p
                where p.auth_user_id = auth.uid() and p.role <> 'customer'::user_role))
  with check (exists (select 1 from profiles p
                where p.auth_user_id = auth.uid() and p.role <> 'customer'::user_role));

commit;

-- ============================================================================
-- VERIFICATION — run this SEPARATELY (standalone, after commit) to confirm
-- the three tables exist with RLS on and policies attached.
-- ============================================================================
-- select c.relname as table_name, c.relrowsecurity as rls_enabled,
--        count(pol.polname) as policy_count
-- from pg_class c
-- join pg_namespace n on n.oid = c.relnamespace
-- left join pg_policy pol on pol.polrelid = c.oid
-- where n.nspname = 'public'
--   and c.relname in ('attributes','attribute_values','product_attribute_values')
-- group by c.relname, c.relrowsecurity
-- order by c.relname;
-- Expect: 3 rows, rls_enabled = t, policy_count = 1 each.
