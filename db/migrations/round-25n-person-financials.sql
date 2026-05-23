-- round-25n-person-financials.sql
-- Read-only per-person financials for the People detail view. One fn powers
-- both the customer side (their sales, their payments, what they owe) and the
-- seller side (commissions earned / paid / owed). Money in CENTS.
--
-- customer.owed_cents = sum over the person's confirmed/partially_paid sales
--   of (total_cents - paid_cents) where positive. Ties to receivables_aging
--   (verified: matches the Receivables report baseline).
-- seller.* = sum over the person's non-void sale_commissions; owed = pending,
--   paid = paid. Ties to the dashboard "commissions owed" (verified).
-- Walk-in (no customer) open invoices are intentionally NOT attributed to any
-- person here; they still show in the business-wide Receivables report.
-- STABLE, no own gate (read-only; pages are already gated).

create or replace function public.person_financials(p_profile_id uuid)
returns jsonb language sql stable as $pf$
  with cust_sales as (
    select s.id, s.invoice_number, s.sold_at, s.status, s.source,
           s.total_cents, s.paid_cents,
           greatest(s.total_cents - s.paid_cents, 0) as outstanding_cents
    from sales s
    where s.customer_id = p_profile_id
  ),
  cust_payments as (
    select sp.id, sp.sale_id, sp.method, sp.amount_cents, sp.paid_at, sp.reference,
           s.invoice_number
    from sale_payments sp
    join sales s on s.id = sp.sale_id
    where s.customer_id = p_profile_id
  ),
  seller_comms as (
    select sc.id, sc.earner_role, sc.percent, sc.amount_cents, sc.status,
           s.id as sale_id, s.invoice_number, s.sold_at
    from sale_commissions sc
    join sale_items si on si.id = sc.sale_item_id
    join sales s on s.id = si.sale_id
    where sc.earner_id = p_profile_id and sc.status <> 'void'
  )
  select jsonb_build_object(
    'customer', jsonb_build_object(
      'owed_cents', (select coalesce(sum(outstanding_cents),0) from cust_sales
                     where status in ('confirmed','partially_paid') and outstanding_cents > 0),
      'open_count', (select count(*) from cust_sales
                     where status in ('confirmed','partially_paid') and outstanding_cents > 0),
      'paid_cents', (select coalesce(sum(amount_cents),0) from cust_payments),
      'lifetime_sales_cents', (select coalesce(sum(total_cents),0) from cust_sales where status <> 'cancelled'),
      'sales_count', (select count(*) from cust_sales),
      'sales', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', id, 'invoice_number', invoice_number, 'sold_at', sold_at,
                 'status', status, 'source', source,
                 'total_cents', total_cents, 'paid_cents', paid_cents,
                 'outstanding_cents', outstanding_cents
               ) order by sold_at desc)
        from cust_sales), '[]'::jsonb),
      'payments', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', id, 'sale_id', sale_id, 'invoice_number', invoice_number,
                 'method', method, 'amount_cents', amount_cents,
                 'paid_at', paid_at, 'reference', reference
               ) order by paid_at desc)
        from cust_payments), '[]'::jsonb)
    ),
    'seller', jsonb_build_object(
      'earned_cents', (select coalesce(sum(amount_cents),0) from seller_comms),
      'paid_cents',   (select coalesce(sum(amount_cents),0) from seller_comms where status = 'paid'),
      'owed_cents',   (select coalesce(sum(amount_cents),0) from seller_comms where status = 'pending'),
      'count',        (select count(*) from seller_comms),
      'commissions', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', id, 'sale_id', sale_id, 'invoice_number', invoice_number,
                 'sold_at', sold_at, 'earner_role', earner_role,
                 'percent', percent, 'amount_cents', amount_cents, 'status', status
               ) order by sold_at desc)
        from seller_comms), '[]'::jsonb)
    )
  ); $pf$;
