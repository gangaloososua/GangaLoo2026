-- Round 25f - Receivables aging report function.
--
-- Read-only STABLE function backing the Reports > Receivables Aging screen.
-- Point-in-time snapshot ("as of now") of open receivables, so no arguments.
-- All money values are in CENTS.
--
-- Open = sales with status confirmed or partially_paid and a positive
-- outstanding balance (total_cents - paid_cents). Age = days from confirmed_at
-- to current_date, bucketed Current / 1-30 / 31-60 / 61-90 / 90+. (DECISION:
-- aged from confirmed_at rather than sold_at - both are fully populated; the
-- owner chose confirmed date as the clock start.)
--
-- Returns: total_outstanding_cents, open_count, buckets (always all five labels
-- in order, zero-filled), and invoices (each open sale, most overdue first).

create or replace function public.receivables_aging()
returns jsonb language sql stable as $ra$
  with open_sales as (
    select
      s.id,
      s.invoice_number,
      coalesce(p.full_name, '(walk-in)') as customer,
      s.confirmed_at,
      s.sold_at,
      greatest(s.total_cents - coalesce(s.paid_cents, 0), 0) as outstanding_cents,
      greatest((current_date - s.confirmed_at::date), 0)     as days_overdue
    from sales s
    left join profiles p on p.id = s.customer_id
    where s.status in ('confirmed', 'partially_paid')
      and greatest(s.total_cents - coalesce(s.paid_cents, 0), 0) > 0
  ),
  bucketed as (
    select *,
      case
        when days_overdue <= 0  then 'Current'
        when days_overdue <= 30 then '1-30'
        when days_overdue <= 60 then '31-60'
        when days_overdue <= 90 then '61-90'
        else '90+'
      end as bucket
    from open_sales
  )
  select jsonb_build_object(
    'total_outstanding_cents', (select coalesce(sum(outstanding_cents), 0) from bucketed),
    'open_count',              (select count(*) from bucketed),
    'buckets', (
      select jsonb_agg(jsonb_build_object('bucket', b, 'amount_cents', amt, 'count', cnt)
                       order by sortk)
      from (
        select lbl as b,
               coalesce(sum(x.outstanding_cents), 0) as amt,
               count(x.*) as cnt,
               sortk
        from (values ('Current',0),('1-30',1),('31-60',2),('61-90',3),('90+',4)) as buckets(lbl, sortk)
        left join bucketed x on x.bucket = buckets.lbl
        group by lbl, sortk
      ) q
    ),
    'invoices', coalesce((
      select jsonb_agg(jsonb_build_object(
               'invoice', invoice_number,
               'customer', customer,
               'confirmed_at', confirmed_at,
               'days_overdue', days_overdue,
               'bucket', bucket,
               'outstanding_cents', outstanding_cents
             ) order by days_overdue desc, outstanding_cents desc)
      from bucketed
    ), '[]'::jsonb)
  ); $ra$;
