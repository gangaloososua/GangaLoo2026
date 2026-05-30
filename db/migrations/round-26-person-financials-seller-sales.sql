-- round-26-person-financials-seller-sales.sql
-- Extends person_financials(uuid) so the SELLER side mirrors the customer side:
-- the invoices a person SOLD (sales.seller_id = person) and the payments
-- collected on those invoices. Previously the seller side only summarized
-- commissions; POS sales with customer = "Walk-in" / seller = <person> were
-- invisible on the person's page. Money in CENTS.
--
-- Keyed on sales.seller_id (the sale's designated seller), NOT derived from
-- commission line items. All EXISTING fields (customer.*, seller.earned_cents,
-- seller.paid_cents, seller.owed_cents, seller.count, seller.commissions) are
-- unchanged. New seller fields:
--   sold_count             non-cancelled invoices sold
--   open_count             confirmed/partially_paid invoices with balance > 0
--   lifetime_sold_cents    sum(total) of non-cancelled invoices sold
--   sold_outstanding_cents sum(outstanding) over open invoices sold
--   collected_cents        sum of all payments banked on invoices she sold
--   payments_count         number of those payments
--   sales[]                the invoices sold (same shape as customer.sales)
--   payments[]             the payments collected (same shape as customer.payments)
--
-- Verified against Delia Thomas (c23c1b44-90e4-4d28-9007-ab7db294c4f7):
--   sold_count 129 / open_count 10 / lifetime_sold 151940260
--   sold_outstanding 11807711 / payments 149 / collected 99228558
-- STABLE, read-only; pages are already gated.

CREATE OR REPLACE FUNCTION public.person_financials(p_profile_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
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
  ),
  seller_sales as (
    select s.id, s.invoice_number, s.sold_at, s.status, s.source,
           s.total_cents, s.paid_cents,
           greatest(s.total_cents - s.paid_cents, 0) as outstanding_cents
    from sales s
    where s.seller_id = p_profile_id
  ),
  seller_payments as (
    select sp.id, sp.sale_id, sp.method, sp.amount_cents, sp.paid_at, sp.reference,
           s.invoice_number
    from sale_payments sp
    join sales s on s.id = sp.sale_id
    where s.seller_id = p_profile_id
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
      -- existing commission fields (unchanged)
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
        from seller_comms), '[]'::jsonb),
      -- NEW: invoices this person sold + payments collected on them
      'sold_count', (select count(*) from seller_sales where status <> 'cancelled'),
      'open_count', (select count(*) from seller_sales
                     where status in ('confirmed','partially_paid') and outstanding_cents > 0),
      'lifetime_sold_cents', (select coalesce(sum(total_cents),0) from seller_sales where status <> 'cancelled'),
      'sold_outstanding_cents', (select coalesce(sum(outstanding_cents),0) from seller_sales
                                 where status in ('confirmed','partially_paid') and outstanding_cents > 0),
      'collected_cents', (select coalesce(sum(amount_cents),0) from seller_payments),
      'payments_count',  (select count(*) from seller_payments),
      'sales', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', id, 'invoice_number', invoice_number, 'sold_at', sold_at,
                 'status', status, 'source', source,
                 'total_cents', total_cents, 'paid_cents', paid_cents,
                 'outstanding_cents', outstanding_cents
               ) order by sold_at desc)
        from seller_sales), '[]'::jsonb),
      'payments', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', id, 'sale_id', sale_id, 'invoice_number', invoice_number,
                 'method', method, 'amount_cents', amount_cents,
                 'paid_at', paid_at, 'reference', reference
               ) order by paid_at desc)
        from seller_payments), '[]'::jsonb)
    )
  ); $function$;

-- Baseline check for Delia Thomas (should reproduce the diagnostic row):
-- select
--   (person_financials('c23c1b44-90e4-4d28-9007-ab7db294c4f7') #>> '{seller,sold_count}')             as sold_count,
--   (person_financials('c23c1b44-90e4-4d28-9007-ab7db294c4f7') #>> '{seller,open_count}')             as open_count,
--   (person_financials('c23c1b44-90e4-4d28-9007-ab7db294c4f7') #>> '{seller,lifetime_sold_cents}')    as lifetime_sold,
--   (person_financials('c23c1b44-90e4-4d28-9007-ab7db294c4f7') #>> '{seller,sold_outstanding_cents}') as sold_outstanding,
--   (person_financials('c23c1b44-90e4-4d28-9007-ab7db294c4f7') #>> '{seller,payments_count}')         as payments_count,
--   (person_financials('c23c1b44-90e4-4d28-9007-ab7db294c4f7') #>> '{seller,collected_cents}')        as collected;
-- expect: 129 / 10 / 151940260 / 11807711 / 149 / 99228558
