-- Round 25e - Sales analysis report function.
--
-- Read-only STABLE function backing the Reports > Sales Analysis screen.
-- Given a period [p_start, p_end), returns headline totals, a sales-over-time
-- trend, and five breakdowns. All money values are in CENTS.
--
-- Excludes cancelled/refunded sales; dated by sold_at.
--
--   revenue/sales_count/avg_sale - from sales.total_cents (the true money).
--   GROSS MARGIN is PRELIMINARY: cogs_cents is missing/unreliable on most
--     legacy sales, so costed_revenue_cents, cogs_cents and margin_cents are
--     computed ONLY over sales that carry a positive cogs_cents, and the UI
--     shows margin muted with a "N of M sales costed" note. (One known bad row,
--     ONL-0001, has an inflated cogs; this is data to clean up later and is
--     exactly why margin is presented as preliminary, not a headline.)
--   trend - daily buckets for periods <= ~92 days, monthly buckets beyond.
--   by_seller / by_customer - sales.total_cents grouped by profiles.full_name.
--   by_product / by_category - sale_items.line_total_cents (product detail only
--     lives on line items; this total is slightly less than revenue because
--     shipping/tax/order-discount aren't on a product line). Category via the
--     primary product_categories link joined to the products `categories` table.

create or replace function public.sales_report(p_start timestamptz, p_end timestamptz)
returns jsonb language sql stable as $sr$
  with s as (
    select * from sales
    where sold_at >= p_start and sold_at < p_end
      and status not in ('cancelled', 'refunded')
  ),
  costed as (
    select coalesce(sum(total_cents), 0) as rev, coalesce(sum(cogs_cents), 0) as cogs, count(*) as cnt
    from s where cogs_cents is not null and cogs_cents > 0
  ),
  items as (
    select si.*, s.sold_at from sale_items si join s on s.id = si.sale_id
  ),
  prim as (
    select distinct on (pc.product_id) pc.product_id, pc.category_id
    from product_categories pc where pc.is_primary = true
    order by pc.product_id, pc.display_order nulls last
  ),
  span as (select (p_end::date - p_start::date) as days)
  select jsonb_build_object(
    'revenue_cents',  (select coalesce(sum(total_cents), 0) from s),
    'sales_count',    (select count(*) from s),
    'avg_sale_cents', (select case when count(*) > 0 then round(sum(total_cents)::numeric / count(*)) else 0 end from s),
    'costed_revenue_cents', (select rev from costed),
    'cogs_cents',     (select cogs from costed),
    'margin_cents',   (select rev - cogs from costed),
    'costed_sales',   (select cnt from costed),
    'total_sales',    (select count(*) from s),
    'trend', coalesce((
      select jsonb_agg(jsonb_build_object('bucket', b, 'revenue_cents', rev, 'count', cnt) order by b)
      from (
        select case when (select days from span) > 92
                    then to_char(date_trunc('month', sold_at), 'YYYY-MM')
                    else to_char(date_trunc('day',   sold_at), 'YYYY-MM-DD') end as b,
               sum(total_cents) as rev, count(*) as cnt
        from s group by 1
      ) q
    ), '[]'::jsonb),
    'by_seller', coalesce((
      select jsonb_agg(jsonb_build_object('name', nm, 'revenue_cents', rev, 'count', cnt) order by rev desc)
      from (
        select coalesce(p.full_name, '(no seller)') as nm, sum(s.total_cents) as rev, count(*) as cnt
        from s left join profiles p on p.id = s.seller_id
        group by coalesce(p.full_name, '(no seller)')
      ) q
    ), '[]'::jsonb),
    'by_customer', coalesce((
      select jsonb_agg(jsonb_build_object('name', nm, 'revenue_cents', rev, 'count', cnt) order by rev desc)
      from (
        select coalesce(p.full_name, '(walk-in)') as nm, sum(s.total_cents) as rev, count(*) as cnt
        from s left join profiles p on p.id = s.customer_id
        group by coalesce(p.full_name, '(walk-in)')
        order by sum(s.total_cents) desc limit 15
      ) q
    ), '[]'::jsonb),
    'by_product', coalesce((
      select jsonb_agg(jsonb_build_object('name', nm, 'sku', sk, 'units', u, 'revenue_cents', rev) order by rev desc)
      from (
        select coalesce(pr.name, '(unknown)') as nm, pr.sku as sk,
               sum(i.qty) as u, sum(i.line_total_cents) as rev
        from items i left join products pr on pr.id = i.product_id
        group by coalesce(pr.name, '(unknown)'), pr.sku
        order by sum(i.line_total_cents) desc limit 15
      ) q
    ), '[]'::jsonb),
    'by_category', coalesce((
      select jsonb_agg(jsonb_build_object('name', nm, 'units', u, 'revenue_cents', rev) order by rev desc)
      from (
        select coalesce(c.name, 'Uncategorized') as nm,
               sum(i.qty) as u, sum(i.line_total_cents) as rev
        from items i
        left join prim pc on pc.product_id = i.product_id
        left join categories c on c.id = pc.category_id
        group by coalesce(c.name, 'Uncategorized')
        order by sum(i.line_total_cents) desc
      ) q
    ), '[]'::jsonb),
    'line_items_total_cents', (select coalesce(sum(line_total_cents), 0) from items)
  ); $sr$;
