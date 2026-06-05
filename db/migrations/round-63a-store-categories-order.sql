-- round-63a-store-categories-order.sql
-- Expose the admin display order (and parent) on the SAFE storefront category
-- view, so the public store can show categories in the SAME order the owner
-- arranged them in admin (drag-to-reorder), instead of alphabetical.
--
-- Background: store_categories was `SELECT id, name FROM categories`. The
-- storefront (lib/store/catalog.ts) therefore had no way to sort by the admin
-- order and fell back to name (localeCompare). Adding display_order + parent_id
-- lets the storefront sort by parent's order, then the sub's order -- matching
-- the admin Categories page. Neither column is sensitive (no cost/inventory),
-- so it is safe to expose on the public view.
--
-- Additive: existing readers select `id, name` explicitly and are unaffected.
-- Idempotent (CREATE OR REPLACE VIEW). Column NAMES of the pre-existing columns
-- (id, name) are unchanged, so the replace is allowed.

CREATE OR REPLACE VIEW public.store_categories AS
  SELECT
    id,
    name,
    parent_id,
    display_order
  FROM categories;
