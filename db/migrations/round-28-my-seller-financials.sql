-- round-28-my-seller-financials.sql
-- Self-service seller view. Returns the SIGNED-IN seller's own invoices-sold,
-- payments collected on them, and commission totals. Takes NO arguments: it
-- resolves the caller from auth.uid(), so a seller can only ever see their own
-- data. SECURITY DEFINER so it doesn't depend on per-table RLS (though
-- sales/sale_payments seller-read policies would also permit these reads).
-- Money in CENTS. Keyed on sales.seller_id (sold) and sale_commissions.earner_id
-- (commissions), matching person_financials.
--
-- Returns { ok:false, reason } when the caller has no profile or isn't a
-- seller/distributor, so the page can render a friendly message instead of
-- erroring.

CREATE OR REPLACE FUNCTION public.my_seller_financials()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
declare
  v_profile_id uuid;
  v_role       text;
  v_name       text;
  result       jsonb;
begin
  select id, role, full_name
    into v_profile_id, v_role, v_name
  from profiles
  where auth_user_id = auth.uid()
  limit 1;

  if v_profile_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_profile');
  end if;

  if v_role not in ('seller', 'distributor') then
    return jsonb_build_object('ok', false, 'reason', 'not_seller');
  end if;

  with seller_sales as (
    select s.id, s.invoice_number, s.sold_at, s.status, s.source,
           s.total_cents, s.paid_cents,
           greatest(s.total_cents - s.paid_cents, 0) as outstanding_cents
    from sales s
    where s.seller_id = v_profile_id
  ),
  seller_payments as (
    select sp.id, sp.sale_id, sp.method, sp.amount_cents, sp.paid_at, sp.reference,
           s.invoice_number
    from sale_payments sp
    join sales s on s.id = sp.sale_id
    where s.seller_id = v_profile_id
  ),
  seller_comms as (
    select sc.id, sc.earner_role, sc.percent, sc.amount_cents, sc.status,
           s.id as sale_id, s.invoice_number, s.sold_at
    from sale_commissions sc
    join sale_items si on si.id = sc.sale_item_id
    join sales s on s.id = si.sale_id
    where sc.earner_id = v_profile_id and sc.status <> 'void'
  )
  select jsonb_build_object(
    'ok', true,
    'profile_id', v_profile_id,
    'name', v_name,
    -- invoices sold
    'sold_count', (select count(*) from seller_sales where status <> 'cancelled'),
    'open_count', (select count(*) from seller_sales
                   where status in ('confirmed','partially_paid') and outstanding_cents > 0),
    'lifetime_sold_cents', (select coalesce(sum(total_cents),0) from seller_sales where status <> 'cancelled'),
    'sold_outstanding_cents', (select coalesce(sum(outstanding_cents),0) from seller_sales
                               where status in ('confirmed','partially_paid') and outstanding_cents > 0),
    -- payments collected
    'collected_cents', (select coalesce(sum(amount_cents),0) from seller_payments),
    'payments_count',  (select count(*) from seller_payments),
    -- commissions
    'earned_cents',          (select coalesce(sum(amount_cents),0) from seller_comms),
    'commission_paid_cents', (select coalesce(sum(amount_cents),0) from seller_comms where status = 'paid'),
    'commission_owed_cents', (select coalesce(sum(amount_cents),0) from seller_comms where status = 'pending'),
    'commission_count',      (select count(*) from seller_comms),
    -- lists
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
      from seller_payments), '[]'::jsonb),
    'commissions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', id, 'sale_id', sale_id, 'invoice_number', invoice_number,
               'sold_at', sold_at, 'earner_role', earner_role,
               'percent', percent, 'amount_cents', amount_cents, 'status', status
             ) order by sold_at desc)
      from seller_comms), '[]'::jsonb)
  ) into result;

  return result;
end;
$function$;

revoke all on function public.my_seller_financials() from public;
grant execute on function public.my_seller_financials() to authenticated;

-- OWNER VERIFICATION (the function itself needs a seller's JWT; auth.uid() is
-- null in the SQL editor). This read-only block reproduces the same math for a
-- given seller so you can confirm the numbers without logging in as them.
-- For Delia (c23c1b44-90e4-4d28-9007-ab7db294c4f7) expect 129 / 151940260 /
-- 149 / 99228558 — same as the person page.
-- with ss as (
--   select greatest(total_cents-paid_cents,0) oc, status, total_cents
--   from sales where seller_id='c23c1b44-90e4-4d28-9007-ab7db294c4f7')
-- select
--   (select count(*) from ss where status<>'cancelled')                              as sold_count,
--   (select coalesce(sum(total_cents),0) from ss where status<>'cancelled')          as lifetime_sold,
--   (select count(*) from sale_payments sp join sales s on s.id=sp.sale_id
--      where s.seller_id='c23c1b44-90e4-4d28-9007-ab7db294c4f7')                      as payments_count,
--   (select coalesce(sum(sp.amount_cents),0) from sale_payments sp join sales s on s.id=sp.sale_id
--      where s.seller_id='c23c1b44-90e4-4d28-9007-ab7db294c4f7')                      as collected;
