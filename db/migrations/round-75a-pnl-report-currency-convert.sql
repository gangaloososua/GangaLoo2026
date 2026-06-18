-- round-75a-pnl-report-currency-convert.sql
-- Profit & Loss: convert foreign-currency (EUR/USD) transactions to pesos.
--
-- BUG: pnl_report() summed transactions.amount_cents directly, treating every
-- account as pesos. Income/expense on a EUR or USD money account (e.g. Bank C24
-- in EUR) was counted one-for-one as DOP, so EUR1,126.31 showed as RD$1,126.31.
--
-- FIX: mirror the round-65a balance_sheet() pattern. Join each transaction to
-- its money_account, look up the latest DOP-per-unit rate for that account's
-- currency (monthly_exchange_rates), and multiply before summing. DOP stays 1:1;
-- an unrated currency falls back to 1:1 so nothing vanishes. Applied to BOTH the
-- current and prior windows. Everything else is byte-for-byte the live body, so
-- the jsonb shape is unchanged and no TypeScript edit is needed.
--
-- Rebuilt from the LIVE body via pg_get_functiondef. Applied live in Supabase;
-- this file is the record.

CREATE OR REPLACE FUNCTION public.pnl_report(p_cur_start timestamp with time zone, p_cur_end timestamp with time zone, p_prev_start timestamp with time zone, p_prev_end timestamp with time zone)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  with fx as (
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
  cur as (
    select t.category_id, round(sum(t.amount_cents * v.factor)) as amt
    from transactions t
    left join money_accounts ma on ma.id = t.money_account_id
    cross join lateral (
      select case
               when ma.currency = 'DOP' then 1::numeric
               else coalesce((select rate from fx where fx.currency = ma.currency), 1::numeric)
             end as factor
    ) v
    where t.occurred_at >= p_cur_start and t.occurred_at < p_cur_end
    group by t.category_id
  ),
  prev as (
    select t.category_id, round(sum(t.amount_cents * v.factor)) as amt
    from transactions t
    left join money_accounts ma on ma.id = t.money_account_id
    cross join lateral (
      select case
               when ma.currency = 'DOP' then 1::numeric
               else coalesce((select rate from fx where fx.currency = ma.currency), 1::numeric)
             end as factor
    ) v
    where t.occurred_at >= p_prev_start and t.occurred_at < p_prev_end
    group by t.category_id
  ),
  lines as (
    select
      ac.id,
      ac.name,
      ac.type::text  as ctype,
      ac.scope::text as cscope,
      coalesce(cur.amt, 0)  as current_cents,
      coalesce(prev.amt, 0) as prior_cents
    from account_categories ac
    left join cur  on cur.category_id  = ac.id
    left join prev on prev.category_id = ac.id
    where ac.type::text in ('income', 'expense')
      and (coalesce(cur.amt, 0) <> 0 or coalesce(prev.amt, 0) <> 0)
  )
  select jsonb_build_object(
    'lines', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', id::text,
          'name', name,
          'type', ctype,
          'scope', cscope,
          'current_cents', current_cents,
          'prior_cents', prior_cents
        )
        order by (case when ctype = 'income' then 0 else 1 end),
                 abs(current_cents) desc, name
      )
      from lines
    ), '[]'::jsonb),
    'totals', jsonb_build_object(
      'business', (
        select jsonb_build_object(
          'income_cents',         coalesce(sum(current_cents) filter (where ctype='income'), 0),
          'expense_cents',       -coalesce(sum(current_cents) filter (where ctype='expense'), 0),
          'net_cents',            coalesce(sum(current_cents), 0),
          'prior_income_cents',   coalesce(sum(prior_cents)   filter (where ctype='income'), 0),
          'prior_expense_cents', -coalesce(sum(prior_cents)   filter (where ctype='expense'), 0),
          'prior_net_cents',      coalesce(sum(prior_cents), 0)
        )
        from lines where cscope = 'business'
      ),
      'all', (
        select jsonb_build_object(
          'income_cents',         coalesce(sum(current_cents) filter (where ctype='income'), 0),
          'expense_cents',       -coalesce(sum(current_cents) filter (where ctype='expense'), 0),
          'net_cents',            coalesce(sum(current_cents), 0),
          'prior_income_cents',   coalesce(sum(prior_cents)   filter (where ctype='income'), 0),
          'prior_expense_cents', -coalesce(sum(prior_cents)   filter (where ctype='expense'), 0),
          'prior_net_cents',      coalesce(sum(prior_cents), 0)
        )
        from lines
      )
    )
  );
$function$;
