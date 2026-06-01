-- ===========================================================================
-- round-51a-product-video-column.sql
-- ---------------------------------------------------------------------------
-- Step A of the "product video link" feature.
--
-- Adds an optional YouTube link to products. Customers will see the video
-- play on the storefront product page (wired in Step B). This step is purely
-- additive: a new nullable column. Nothing existing reads or writes it yet,
-- so it cannot affect any current behaviour.
-- ===========================================================================

alter table public.products
  add column if not exists video_url text;

comment on column public.products.video_url is
  'Optional full YouTube URL (https://www.youtube.com/watch?v=...) shown on the storefront product page.';
