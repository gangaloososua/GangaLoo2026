-- round-83a: add video + attributes to the US single-product read fn
-- (get_us_store_products, the grid list, is untouched)

drop function if exists public.get_us_store_product(text);

create function public.get_us_store_product(p_slug text)
returns table(
  id uuid,
  name text,
  slug text,
  description text,
  primary_image_url text,
  us_price_usd numeric,
  video_url text,
  attributes jsonb
)
language sql
security definer
set search_path to 'public'
as $function$
  select
    p.id,
    p.name,
    p.slug,
    p.description,
    p.primary_image_url,
    public._us_price_usd(
      p.us_price_override_usd,
      p.us_markup_percent,
      nullif(p.cost_calc->>'base_cost_usd', '')::numeric
    ) as us_price_usd,
    p.video_url,
    (
      select coalesce(jsonb_agg(jsonb_build_object('name', g.attr_name, 'values', g.vals) order by g.min_order), '[]'::jsonb)
      from (
        select
          sa.name as attr_name,
          min(sa.display_order) as min_order,
          array_agg(sav.value order by sav.display_order) as vals
        from store_product_attribute_values spav
        join store_attribute_values sav on sav.id = spav.attribute_value_id
        join store_attributes sa on sa.id = sav.attribute_id
        where spav.product_id = p.id
          and sa.is_active = true
          and sav.is_active = true
        group by sa.name
      ) g
    ) as attributes
  from products p
  where p.slug = p_slug
    and p.us_enabled = true
    and p.is_active = true
    and p.visible_in_store = true
    and public._us_price_usd(
      p.us_price_override_usd,
      p.us_markup_percent,
      nullif(p.cost_calc->>'base_cost_usd', '')::numeric
    ) is not null
  limit 1;
$function$;

grant execute on function public.get_us_store_product(text) to anon, authenticated;
