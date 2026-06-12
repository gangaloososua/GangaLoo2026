-- round-72a-category-store-visibility.sql
-- Goal: let the owner hide a category from the public storefront WITHOUT
-- affecting it anywhere else (admin, inventory grouping, product tabs).
--
-- 1) New per-category flag `visible_in_store`, DEFAULT true so every existing
--    category stays visible exactly as today. Separate from `is_active`
--    (which governs the category everywhere), mirroring how products already
--    have their own visible_in_store.
-- 2) Rebuild the store_categories view to only expose visible ones. The
--    storefront builds its category chips from this view (lib/store/catalog.ts
--    reads store_categories), so filtering here hides them on the shop with no
--    app code change. The view keeps the same columns (id, name, parent_id,
--    display_order) so nothing downstream breaks.

-- 1) Additive column. Existing rows get true via the default; not null.
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS visible_in_store boolean NOT NULL DEFAULT true;

-- 2) Same shape as before, plus the visibility filter.
CREATE OR REPLACE VIEW public.store_categories AS
  SELECT id,
         name,
         parent_id,
         display_order
  FROM categories
  WHERE visible_in_store IS TRUE;
