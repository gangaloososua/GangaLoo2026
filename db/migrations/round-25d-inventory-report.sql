-- Round 25d - Inventory valuation report function.
--
-- Read-only STABLE function backing the Reports > Inventory Valuation screen.
-- Point-in-time snapshot of current stock (inventory_lots.qty_remaining > 0),
-- so it takes no arguments. All money values are in CENTS.
--
--   cost_cents    = stock at landed cost (unit_cost_dop is PESOS -> *100)
--   retail_cents  = stock at products.price_cents (potential revenue)
--   margin_cents  = retail - cost (unrealized margin in stock)
--   slow_*        = stock received > 120 days ago (cash on the shelf)
--
-- Breakdowns:
--   by_warehouse  - value + units per warehouse
--   by_category   - value + units per PRIMARY product category (so a product
--                   in several categories isn't double-counted). The primary
--                   category comes from product_categories where is_primary,
--                   joined to the products `categories` table (NOT the
--                   accounting account_categories table). No-primary -> the
--                   coalesce falls back to 'Uncategorized'.
--   top_products  - top 15 products by cost value (name, sku, units, value)

create or replace function public.inventory_report()
returns jsonb language sql stable as $inv$
  with lots as (
    select il.product_id, il.warehouse_id, il.qty_remaining,
           il.unit_cost_dop, il.received_at
    from inventory_lots il
    where il.qty_remaining > 0
  ),
  primary_cat as (
    select distinct on (pc.product_id) pc.product_id, pc.category_id
    from product_categories pc
    where pc.is_primary = true
    order by pc.product_id, pc.display_order nulls last
  ),
  enriched as (
    select
      l.product_id, l.warehouse_id, l.qty_remaining, l.received_at,
      l.unit_cost_dop,
      round(l.qty_remaining * l.unit_cost_dop * 100)::bigint as cost_cents,
      round(l.qty_remaining * coalesce(p.price_cents, 0))::bigint as retail_cents,
      p.name as product_name, p.sku as sku,
      pc.category_id, l.unit_cost_dop * 100 as unit_cost_cents
    from lots l
    left join products p       on p.id = l.product_id
    left join primary_cat pc   on pc.product_id = l.product_id
  )
  select jsonb_build_object(
    'units',          (select coalesce(sum(qty_remaining), 0) from enriched),
    'cost_cents',     (select coalesce(sum(cost_cents), 0) from enriched),
    'retail_cents',   (select coalesce(sum(retail_cents), 0) from enriched),
    'margin_cents',   (select coalesce(sum(retail_cents - cost_cents), 0) from enriched),
    'slow_cost_cents',(select coalesce(sum(cost_cents) filter (where received_at < now() - interval '120 days'), 0) from enriched),
    'slow_units',     (select coalesce(sum(qty_remaining) filter (where received_at < now() - interval '120 days'), 0) from enriched),
    'by_warehouse', coalesce((
      select jsonb_agg(jsonb_build_object(
               'warehouse', wname, 'units', units, 'cost_cents', cost_cents
             ) order by cost_cents desc)
      from (
        select coalesce(w.name, '(unknown)') as wname,
               sum(e.qty_remaining) as units,
               sum(e.cost_cents)    as cost_cents
        from enriched e
        left join warehouses w on w.id = e.warehouse_id
        group by coalesce(w.name, '(unknown)')
      ) q
    ), '[]'::jsonb),
    'by_category', coalesce((
      select jsonb_agg(jsonb_build_object(
               'category', cname, 'units', units, 'cost_cents', cost_cents
             ) order by cost_cents desc)
      from (
        select coalesce(c.name, 'Uncategorized') as cname,
               sum(e.qty_remaining) as units,
               sum(e.cost_cents)    as cost_cents
        from enriched e
        left join categories c on c.id = e.category_id
        group by coalesce(c.name, 'Uncategorized')
      ) q
    ), '[]'::jsonb),
    'top_products', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', product_name, 'sku', sku,
               'units', units, 'cost_cents', cost_cents
             ) order by cost_cents desc)
      from (
        select e.product_name, e.sku,
               sum(e.qty_remaining) as units,
               sum(e.cost_cents)    as cost_cents
        from enriched e
        group by e.product_name, e.sku
        order by cost_cents desc
        limit 15
      ) q
    ), '[]'::jsonb)
  ); $inv$;
