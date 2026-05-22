-- Round 25j (read side) - open invoices for the Recibir Pago screen.
--
-- Read-only. Lists every open invoice (status confirmed or partially_paid with
-- a positive outstanding balance) with invoice #, date, status, total, paid,
-- outstanding, customer name, and seller name. One flat list (not grouped by
-- customer) because some invoices have no customer and one deposit can pay
-- invoices across several customers/sellers. Money in CENTS.

create or replace function public.open_invoices_for_payment()
returns jsonb language sql stable as $oi$
  select coalesce(jsonb_agg(row_to_json(r)::jsonb order by r.sold_at), '[]'::jsonb)
  from (
    select s.id,
           s.invoice_number,
           s.sold_at,
           s.status,
           s.total_cents,
           s.paid_cents,
           (s.total_cents - s.paid_cents) as outstanding_cents,
           cust.full_name as customer_name,
           sell.full_name as seller_name
    from sales s
    left join profiles cust on cust.id = s.customer_id
    left join profiles sell on sell.id = s.seller_id
    where s.status in ('confirmed', 'partially_paid')
      and (s.total_cents - s.paid_cents) > 0
    order by s.sold_at
  ) r;
$oi$;
