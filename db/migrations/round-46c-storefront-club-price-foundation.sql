-- round-46c-storefront-club-price-foundation.sql
-- Foundation for showing club prices in the storefront (grid / cart / checkout
-- DISPLAY). Two safe, additive changes — nothing looks different until the
-- catalog.ts code is updated to use them (next step).
--
-- (1) Widen the store_products view to also expose club_price_cents. The
--     storefront reads this view, which currently hides that column — which is
--     exactly why the grid/cart can't show club prices. Same columns, same order,
--     with club_price_cents appended (CREATE OR REPLACE VIEW keeps grants).
-- (2) get_my_is_club_member(): read-only; returns whether the logged-in customer
--     has the Club toggle on (resolved by auth.uid()). Lets the storefront detect
--     a member safely without reading the profiles table directly.

-- (1) Widen the view — append club_price_cents, everything else unchanged.
create or replace view public.store_products as
  select
    id,
    sku,
    name,
    slug,
    description,
    price_cents,
    primary_image_url,
    is_active,
    visible_in_store,
    club_price_cents
  from products;

-- (2) Is the logged-in customer a Club member?
create or replace function public.get_my_is_club_member()
returns boolean
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_member boolean := false;
begin
  if auth.uid() is null then
    return false;
  end if;
  select coalesce(is_club_member, false)
    into v_member
    from profiles
   where auth_user_id = auth.uid() and role = 'customer'
   limit 1;
  return coalesce(v_member, false);
end;
$function$;

grant execute on function public.get_my_is_club_member() to authenticated, anon;
