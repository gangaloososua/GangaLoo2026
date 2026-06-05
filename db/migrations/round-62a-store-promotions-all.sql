-- round-62a-store-promotions-all.sql
-- Widen the store_promotions view so the public storefront applies EVERY
-- active promotion (per-store), not only the featured "Deal of the Day/Week"
-- ones.
--
-- Background: store_promotions is a VIEW over discount_rules (kind='promotion').
-- It previously required deal_slot IN ('daily','weekly'), so a plain promotion
-- (no online-deal toggle) never reached the storefront at all. The two checkout
-- functions (get_storefront_quote, place_storefront_order) and the product page
-- (lib/store/product.ts) read this view by product_id + warehouse and take the
-- top promotion's delta_percent -- none of them care about deal_slot. So simply
-- including all active promotions makes plain promotions lower the online price,
-- per-store, on those surfaces with no code change.
--
-- deal_slot is KEPT as a column (null for plain promotions). It still marks
-- which promotions are FEATURED (homepage countdown carousel + grid sections).
-- The grid (lib/store/catalog.ts) is adjusted separately so a plain promotion
-- lowers the displayed price but is NOT treated as a featured deal.
--
-- Only change vs the prior definition: the WHERE clause no longer requires
-- deal_slot to be daily/weekly. All other conditions (active, product-scoped,
-- in-window) are unchanged. Idempotent (CREATE OR REPLACE VIEW).

CREATE OR REPLACE VIEW public.store_promotions AS
  SELECT
    id,
    scope_product_id   AS product_id,
    scope_warehouse_id AS warehouse_id,
    deal_slot,
    delta_percent,
    ends_at,
    priority
  FROM discount_rules dr
  WHERE kind = 'promotion'::discount_rule_kind
    AND is_active = true
    AND scope_product_id IS NOT NULL
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at  IS NULL OR ends_at  > now());
