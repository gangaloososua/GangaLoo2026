-- round-56a-product-supplier-url.sql
-- Owner-only "Supplier link" on products: the product's page on the supplier's
-- website, for quick reference. Nullable; the storefront never reads it (admin
-- product page only loads it on the owner path). Purely additive, idempotent.

alter table public.products
  add column if not exists supplier_url text;
