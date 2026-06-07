-- Round 65a - Balance Sheet: convert foreign-currency cash to pesos.
--
-- Bug fixed: the cash block summed every money_accounts.balance_cents together
-- regardless of the account's currency, so EUR and USD account balances were
-- counted one-for-one as pesos. This rebuilds ONLY the cash block to convert
-- each account to DOP first, using the latest monthly_exchange_rates row per
-- currency (DOP counts as-is at 1:1; a currency with no rate falls back to 1:1,
-- i.e. the old behaviour, so nothing silently vanishes).
--
-- Everything else is unchanged: inventory (peso cost), receivables (pesos),
-- supplier bills (already USD->DOP at the live PO rate) and commissions (pesos).
-- The output gains a `cash_rates` object {eur, usd} so the screen can show the
-- rates that were applied. All money values stay in CENTS.
--
-- Conversion math: balance_cents is cents OF THAT CURRENCY; rate is DOP per 1
-- unit; so DOP cents = round(balance_cents * rate). For DOP, rate = 1.

create or replace function public.balance_sheet()
returns jsonb language sql stable as $bs$
  with rate as (
    select coalesce((select exchange_rate from purchase_orders
                     where exchange_rate is not null
                     order by paid_at_dop desc nulls last limit 1), 60) as r
  ),
  fx as (
    -- latest DOP-per-unit rate for each currency
    select currency, rate
    from (
      select currency, rate,
             row_number() over (partition by currency
                                order by year desc, month desc, created_at desc) as rn
      from monthly_exchange_rates
    ) t
    where rn = 1
  ),
  cash as (
    select
      coalesce(round(sum(ma.balance_cents * v.factor)), 0)                                  as all_cents,
      coalesce(round(sum(ma.balance_cents * v.factor) filter (where ma.scope = 'business')), 0) as business_cents,
      coalesce(round(sum(ma.balance_cents * v.factor) filter (where ma.scope = 'private')), 0)  as private_cents
    from money_accounts ma
    cross join lateral (
      select case
               when ma.currency = 'DOP' then 1::numeric
               else coalesce((select rate from fx where fx.currency = ma.currency), 1::numeric)
             end as factor
    ) v
    where ma.is_active is not false
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
    'commissions_owed_cents', (select cents from comm),
    'cash_rates', jsonb_build_object(
      'eur', (select rate from fx where currency = 'EUR'),
      'usd', (select rate from fx where currency = 'USD')
    )
  ); $bs$;
