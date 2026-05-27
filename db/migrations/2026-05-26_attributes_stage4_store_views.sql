-- ============================================================================
-- Migration: Product Attributes — Stage 4 (storefront views)
-- Date: 2026-05-26
-- Feature: Product Attributes & Store Filters (see FEATURE-PLAN-attributes.md)
--
-- CONTEXT CORRECTION: the original plan assumed an admin→store "sync/publish"
-- step that copies rows into store_* TABLES. That is wrong. Reading
-- round-29b-storefront-public-views.sql shows the storefront reads SAFE VIEWS
-- (store_*) defined directly over the admin base tables. There is no copy step.
-- So Stage 4 is NOT a sync table — it's three parallel views exposing the
-- customer-safe attribute columns, mirroring how categories are exposed
-- (store_categories + store_product_categories).
--
-- Pattern copied from round-29b:
--   - views run with owner rights (security_invoker off) so the public reads
--     through them without any grant on the base tables;
--   - expose only customer-safe columns (NO single_value_only, NO timestamps);
--   - expose is_active as a COLUMN and let the consumer filter (catalog.ts does
--     `.eq('is_active', true)` itself — we match that, we don't pre-filter);
--   - grant select to anon, authenticated; then notify pgrst to reload.
--
-- Additive only: three new views over existing tables. No base-table changes,
-- no data movement. Safe to re-run (create or replace). Zero write-path risk.
-- ============================================================================

-- Attribute types (Color, Length, ...). Customer-safe columns only.
create or replace view public.store_attributes as
  select id, name, slug, display_order, is_active
  from public.attributes;

-- Attribute values (Black, 26", ...). Customer-safe columns only.
create or replace view public.store_attribute_values as
  select id, attribute_id, value, slug, display_order, is_active
  from public.attribute_values;

-- Link: which values a product has. Mirrors store_product_categories.
-- Queryable by product_id (a product's attributes) and by attribute_value_id
-- (reverse: all products with a given value — the Stage-1 idx_pav_value index).
create or replace view public.store_product_attribute_values as
  select product_id, attribute_value_id
  from public.product_attribute_values;

grant select on
  public.store_attributes,
  public.store_attribute_values,
  public.store_product_attribute_values
to anon, authenticated;

-- Make PostgREST pick up the new views immediately.
notify pgrst, 'reload schema';

-- ============================================================================
-- VERIFICATION — run SEPARATELY after this migration to confirm the three views
-- exist and are granted to the public roles.
-- ============================================================================
-- select table_name,
--        has_table_privilege('anon', 'public.' || table_name, 'SELECT')          as anon_select,
--        has_table_privilege('authenticated', 'public.' || table_name, 'SELECT') as auth_select
-- from information_schema.views
-- where table_schema = 'public'
--   and table_name in ('store_attributes','store_attribute_values','store_product_attribute_values')
-- order by table_name;
-- Expect: 3 rows, anon_select = t, auth_select = t each.
