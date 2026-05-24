-- round-29b-storefront-public-views.sql
-- Opens the storefront to the public SAFELY.
--
-- The raw tables hold sensitive data (product costs, commission %, target
-- margins, inventory cash value, distributor commission rates). We never grant
-- the public access to those tables. Instead we expose narrow "store_*" views
-- containing ONLY customer-facing columns, and grant read access to the views.
--
-- Views run with the view owner's rights over the base tables (the default,
-- security_invoker = off), so the public can read through these windows without
-- any direct grant on the underlying tables. Safe to re-run.

create or replace view public.store_warehouses as
  select id, name, is_active
  from public.warehouses;

create or replace view public.store_products as
  select id, sku, name, slug, description, price_cents,
         primary_image_url, is_active, visible_in_store
  from public.products;

create or replace view public.store_product_settings as
  select product_id, warehouse_id, is_visible, price_override_cents
  from public.product_warehouse_settings;

create or replace view public.store_inventory as
  select product_id, warehouse_id, qty_on_hand
  from public.v_inventory_current;

create or replace view public.store_categories as
  select id, name
  from public.categories;

create or replace view public.store_product_categories as
  select product_id, category_id, is_primary
  from public.product_categories;

create or replace view public.store_product_images as
  select product_id, url, alt_text, display_order
  from public.product_images;

grant select on
  public.store_warehouses,
  public.store_products,
  public.store_product_settings,
  public.store_inventory,
  public.store_categories,
  public.store_product_categories,
  public.store_product_images
to anon, authenticated;

-- Make PostgREST pick up the new views immediately.
notify pgrst, 'reload schema';
