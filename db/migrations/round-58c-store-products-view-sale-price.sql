-- round-58c-store-products-view-sale-price.sql
-- Widen the SAFE store_products view to expose sale_price_cents (was club_price_cents only).
-- Without this, the storefront (product page + grid) read undefined and silently skipped the
-- sale price. Reproduced WHOLE per CREATE OR REPLACE VIEW. Applied live; this is the record.
CREATE OR REPLACE VIEW public.store_products AS
 SELECT id,
    sku,
    name,
    slug,
    description,
    price_cents,
    primary_image_url,
    is_active,
    visible_in_store,
    club_price_cents,
    sale_price_cents
   FROM products;
