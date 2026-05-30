-- round-27-who-owes-me.sql
-- One-view "who owes me" report. Per person, two non-overlapping columns:
--   owes_as_customer_cents = outstanding on OPEN sales where customer_id = person
--   owes_as_seller_cents   = outstanding on OPEN sales where seller_id = person
--                            AND customer_id IS NULL (the Walk-in pay-later
--                            orders where the seller still holds your cash)
-- A sale either has a customer or it doesn't, so the two columns never cover
-- the same invoice -> no double counting. The grand total ties to overall
-- receivables EXCEPT for any open invoice with neither customer nor seller
-- (currently 0; such "nobody" invoices show only in Receivables Aging).
-- OPEN = status in (confirmed, partially_paid) and (total - paid) > 0. Cents.
-- STABLE, read-only; the report page is owner-gated.

CREATE OR REPLACE FUNCTION public.who_owes_me()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  with open_sales as (
    select s.id, s.customer_id, s.seller_id,
           greatest(s.total_cents - s.paid_cents, 0) as outstanding_cents
    from sales s
    where s.status in ('confirmed','partially_paid')
      and (s.total_cents - s.paid_cents) > 0
  ),
  cust as (
    select customer_id as profile_id,
           sum(outstanding_cents) as owes_as_customer_cents
    from open_sales
    where customer_id is not null
    group by customer_id
  ),
  sell as (
    select seller_id as profile_id,
           sum(outstanding_cents) as owes_as_seller_cents
    from open_sales
    where customer_id is null and seller_id is not null
    group by seller_id
  ),
  merged as (
    select coalesce(c.profile_id, s.profile_id)  as profile_id,
           coalesce(c.owes_as_customer_cents, 0)  as owes_as_customer_cents,
           coalesce(s.owes_as_seller_cents, 0)    as owes_as_seller_cents
    from cust c
    full outer join sell s on s.profile_id = c.profile_id
  ),
  rows as (
    select m.profile_id,
           coalesce(p.full_name, 'Unknown')                       as name,
           m.owes_as_customer_cents,
           m.owes_as_seller_cents,
           (m.owes_as_customer_cents + m.owes_as_seller_cents)    as total_cents
    from merged m
    left join profiles p on p.id = m.profile_id
  )
  select jsonb_build_object(
    'total_owed_cents',    (select coalesce(sum(total_cents),0) from rows),
    'customer_owed_cents', (select coalesce(sum(owes_as_customer_cents),0) from rows),
    'seller_owed_cents',   (select coalesce(sum(owes_as_seller_cents),0) from rows),
    'people_count',        (select count(*) from rows),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'profile_id', profile_id,
               'name', name,
               'owes_as_customer_cents', owes_as_customer_cents,
               'owes_as_seller_cents', owes_as_seller_cents,
               'total_cents', total_cents
             ) order by total_cents desc, name asc)
      from rows), '[]'::jsonb)
  ); $function$;

-- Baseline: who_owes_me total must equal the sum of outstanding over every
-- open invoice that has a customer OR a seller (nobody-invoices excluded).
-- select
--   (who_owes_me() #>> '{total_owed_cents}')::bigint    as report_total,
--   (who_owes_me() #>> '{customer_owed_cents}')::bigint as by_customers,
--   (who_owes_me() #>> '{seller_owed_cents}')::bigint   as by_sellers,
--   (select coalesce(sum(greatest(total_cents - paid_cents,0)),0)
--    from sales
--    where status in ('confirmed','partially_paid') and (total_cents - paid_cents) > 0
--      and (customer_id is not null or seller_id is not null))::bigint as direct_sum;
-- report_total should equal by_customers + by_sellers AND equal direct_sum.
