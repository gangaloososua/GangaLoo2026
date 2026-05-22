-- Round 25c - Balance Sheet report function.
--
-- Read-only STABLE function backing the Reports > Balance Sheet screen.
-- A point-in-time snapshot ("as of now"), so it takes no arguments and returns
-- one jsonb bundle. All money values are in CENTS.
--
--   Assets      = cash (active money accounts) + inventory (at cost) + receivables
--   Liabilities = supplier bills owed (unpaid complete + pending POs, USD->DOP at
--                 the live rate) + commissions owed (pending payouts)
--   Equity      = assets - liabilities  (derived in the UI)
--
-- Notes / decisions baked in:
--  * Cash is split business/private (money_accounts.scope) so the screen's
--    Business/Everything toggle can adjust the cash line.
--  * Inventory: inventory_lots.unit_cost_dop is PESOS -> *100 to cents.
--  * Receivables: outstanding on sales with status confirmed/partially_paid.
--  * Supplier bills owed: unpaid (dop_paid_total null or 0) complete + pending
--    POs, valued usd_total * live_rate. live_rate = the most recent non-null
--    purchase_orders.exchange_rate (fallback 60). Split into received (complete)
--    vs pending for transparency.
--  * Commissions owed: sale_commissions with status = 'pending'.

create or replace function public.balance_sheet()
returns jsonb language sql stable as $bs$
  with rate as (
    select coalesce((select exchange_rate from purchase_orders
                     where exchange_rate is not null
                     order by paid_at_dop desc nulls last limit 1), 60) as r
  ),
  cash as (
    select
      coalesce(sum(balance_cents), 0)                                  as all_cents,
      coalesce(sum(balance_cents) filter (where scope = 'business'), 0) as business_cents,
      coalesce(sum(balance_cents) filter (where scope = 'private'), 0)  as private_cents
    from money_accounts
    where is_active is not false
  ),
  inv as (
    select coalesce(round(sum(qty_remaining * unit_cost_dop) * 100), 0) as cents
    from inventory_lots where qty_remaining > 0
  ),
  recv as (
    select coalesce(sum(greatest(total_cents - coalesce(paid_cents, 0), 0)), 0) as cents
    from sales where status in ('confirmed', 'partially_paid')
  ),
  sup as (
    select
      coalesce(round(sum(usd_total) filter (where status::text = 'complete') * (select r from rate) * 100), 0) as received_cents,
      coalesce(round(sum(usd_total) filter (where status::text = 'pending')  * (select r from rate) * 100), 0) as pending_cents,
      coalesce(round(sum(usd_total) * (select r from rate) * 100), 0)                                          as total_cents
    from purchase_orders
    where status::text in ('complete', 'pending')
      and (dop_paid_total is null or dop_paid_total = 0)
  ),
  comm as (
    select coalesce(sum(amount_cents), 0) as cents
    from sale_commissions where status = 'pending'
  )
  select jsonb_build_object(
    'live_rate', (select r from rate),
    'cash', jsonb_build_object(
      'all_cents', (select all_cents from cash),
      'business_cents', (select business_cents from cash),
      'private_cents', (select private_cents from cash)
    ),
    'inventory_cents', (select cents from inv),
    'receivables_cents', (select cents from recv),
    'supplier_owed', jsonb_build_object(
      'received_cents', (select received_cents from sup),
      'pending_cents', (select pending_cents from sup),
      'total_cents', (select total_cents from sup)
    ),
    'commissions_owed_cents', (select cents from comm)
  ); $bs$;
