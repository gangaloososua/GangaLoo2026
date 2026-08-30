-- round-84a: safe, product-teaser-only reads for the /tienda landing page
-- Recently sold: distinct products with a real sale (excludes cancelled/refunded),
-- most recently sold first, scoped to the store (source or fulfillment warehouse).
create or replace function public.get_store_recent_sold(p_warehouse_id uuid, p_limit int default 8)
returns table(product_id uuid, name text, slug text, image_url text)
language sql
security definer
set search_path to 'public'
as $function$
  select p.id, p.name, p.slug, p.primary_image_url
  from (
    select si.product_id, max(s.sold_at) as last_sold_at
    from sale_items si
    join sales s on s.id = si.sale_id
    where s.status not in ('cancelled', 'refunded')
      and coalesce(s.fulfillment_warehouse_id, s.source_warehouse_id) = p_warehouse_id
    group by si.product_id
  ) x
  join products p on p.id = x.product_id
  where p.is_active = true
    and p.visible_in_store = true
  order by x.last_sold_at desc
  limit p_limit;
$function$;

grant execute on function public.get_store_recent_sold(uuid, int) to anon, authenticated;

-- Incoming / on the way: products on an open PO (not yet received, not
-- cancelled/lost) for this warehouse, most recently ordered first. No prices,
-- costs, or supplier info exposed -- name/slug/image only. Not filtered by
-- visible_in_store, since these products often aren't published yet.
create or replace function public.get_store_incoming_products(p_warehouse_id uuid, p_limit int default 8)
returns table(product_id uuid, name text, slug text, image_url text)
language sql
security definer
set search_path to 'public'
as $function$
  select p.id, p.name, p.slug, p.primary_image_url
  from (
    select poi.product_id, max(po.ordered_at) as last_ordered_at
    from purchase_order_items poi
    join purchase_orders po on po.id = poi.purchase_order_id
    where po.warehouse_id = p_warehouse_id
      and po.received_at is null
      and po.status not in ('cancelled', 'lost')
    group by poi.product_id
  ) x
  join products p on p.id = x.product_id
  where p.is_active = true
  order by x.last_ordered_at desc
  limit p_limit;
$function$;

grant execute on function public.get_store_incoming_products(uuid, int) to anon, authenticated;
