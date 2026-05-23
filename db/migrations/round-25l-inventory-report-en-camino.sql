-- round-25l-inventory-report-en-camino.sql
-- Extends inventory_report() with "en camino" (in-transit) figures: units and
-- landed-cost value of purchase-order items not yet received (excluding
-- cancelled/lost). Value uses dop_unit_landed_cost when present (it is fully
-- populated for in-transit orders), falling back to usd_unit_cost * exchange
-- rate (fallback 60) only if a landed cost is ever missing - consistent with
-- how the balance sheet values unpaid purchase orders.
-- Everything else is byte-for-byte the prior inventory_report() (round-25d).
-- Read-only STABLE fn, money in CENTS. No own gate (report fn).

create or replace function public.inventory_report()
returns jsonb language sql stable as $ir$
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
  ),
  incoming as (
    select
      poi.qty as units,
      round(poi.qty * (case when coalesce(poi.dop_unit_landed_cost, 0) > 0
                            then poi.dop_unit_landed_cost
                            else coalesce(poi.usd_unit_cost, 0) * coalesce(po.exchange_rate, 60) end)
            * 100)::bigint as cost_cents
    from purchase_orders po
    join purchase_order_items poi on poi.purchase_order_id = po.id
    where po.received_at is null
      and po.status not in ('cancelled', 'lost')
  )
  select jsonb_build_object(
    'units',          (select coalesce(sum(qty_remaining), 0) from enriched),
    'cost_cents',     (select coalesce(sum(cost_cents), 0) from enriched),
    'retail_cents',   (select coalesce(sum(retail_cents), 0) from enriched),
    'margin_cents',   (select coalesce(sum(retail_cents - cost_cents), 0) from enriched),
    'slow_cost_cents',(select coalesce(sum(cost_cents) filter (where received_at < now() - interval '120 days'), 0) from enriched),
    'slow_units',     (select coalesce(sum(qty_remaining) filter (where received_at < now() - interval '120 days'), 0) from enriched),
    'incoming_units',      (select coalesce(sum(units), 0) from incoming),
    'incoming_cost_cents', (select coalesce(sum(cost_cents), 0) from incoming),
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
  ); $ir$;
