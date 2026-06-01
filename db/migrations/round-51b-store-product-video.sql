-- ===========================================================================
-- round-51b-store-product-video.sql
-- ---------------------------------------------------------------------------
-- Step B of the "product video link" feature.
--
-- The public storefront reads products through the SAFE store_* views so a
-- customer's browser never touches costs/commissions. Rather than widen that
-- view, we expose JUST the video link through a tiny read-only function. It
-- returns the YouTube URL for one product, and only when that product is
-- active and visible in the store — so it can never leak anything else.
--
-- Purely additive: creates one function + grants. Touches no existing view,
-- table, or read path. If anything about it ever fails, the storefront simply
-- shows no video (the page still works).
-- ===========================================================================

create or replace function public.get_store_product_video(p_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select video_url
  from public.products
  where id = p_id
    and is_active = true
    and visible_in_store = true
$$;

-- Lock it down, then grant execute to the public (anon + logged-in) roles.
revoke all on function public.get_store_product_video(uuid) from public;
grant execute on function public.get_store_product_video(uuid) to anon, authenticated;
