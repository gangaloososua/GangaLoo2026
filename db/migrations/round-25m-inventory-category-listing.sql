-- round-25m-inventory-category-listing.sql
-- Read-only listing for the per-category inventory PDF (print page at
-- /reports/inventory/print). For one category, returns the active warehouses
-- and each active product's stock per warehouse + a total. Products with no
-- stock appear with an empty by_wh map / total 0 (shown as 0 on the sheet).
-- by_wh is a { warehouse_id -> qty } map so the page can render one column
-- per warehouse in the warehouses[] order. STABLE, no own gate (report fn).

create or replace function public.inventory_category_listing(p_category_id uuid)
returns jsonb language sql stable as $icl$
  with whs as (
    select w.id, w.name from warehouses w where w.is_active = true order by w.name
  ),
  prods as (
    select distinct on (pc.product_id) pc.product_id, p.name, p.sku
    from product_categories pc
    join products p on p.id = pc.product_id
    where pc.is_primary = true and pc.category_id = p_category_id and p.is_active = true
    order by pc.product_id, pc.display_order nulls last
  ),
  stock as (
    select il.product_id, il.warehouse_id, sum(il.qty_remaining) as qty
    from inventory_lots il
    where il.qty_remaining > 0
    group by il.product_id, il.warehouse_id
  )
  select jsonb_build_object(
    'category', (select jsonb_build_object('id', c.id, 'name', c.name)
                 from categories c where c.id = p_category_id),
    'warehouses', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name)) from whs), '[]'::jsonb),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'product_id', pr.product_id,
               'name', pr.name,
               'sku', pr.sku,
               'by_wh', (select coalesce(jsonb_object_agg(s.warehouse_id::text, s.qty), '{}'::jsonb)
                         from stock s where s.product_id = pr.product_id),
               'total', coalesce((select sum(s.qty) from stock s where s.product_id = pr.product_id), 0)
             ) order by pr.name)
      from prods pr
    ), '[]'::jsonb)
  ); $icl$;
