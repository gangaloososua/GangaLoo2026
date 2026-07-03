-- round-83a-dashboard-overview-fx.sql
--
-- Dashboard: convert USD/EUR ledger amounts to DOP before summing.
--
-- Bug: dashboard_overview() summed transactions.amount_cents directly, with no
-- join to money_accounts and no FX conversion. A USD account row (e.g. the
-- Aliexpress cashback, 190985 = $1,909.85) was counted as RD$1,909.85 instead
-- of ~RD$118,888 (x62.25). Revenue, expenses, net, expenses-by-category, and
-- the 6-month trend were all affected; cash/receivables/inventory/accounts were
-- already correct (they read stored balances/costs, not multi-currency sums).
--
-- Fix mirrors pnl_report (round-25b): add an FX factor per row via a lateral
-- join to money_accounts + the latest monthly_exchange_rates rate for that
-- currency (DOP = 1), and multiply amount_cents by it. Uses the LATEST rate per
-- currency (not the transaction month), matching pnl_report so the two reports
-- agree. Note: round(...) wraps sum(...) filter(...) - the FILTER must sit on
-- the aggregate, not on round(), or Postgres errors "round is not an aggregate".
--
-- Nothing else changed: sales, gross margin, cash, receivables, commissions,
-- inventory, stock-by-warehouse, recent sales, accounts, and the returned
-- bundle shape are byte-for-byte the round-25a version. STABLE, read-only.
--
-- Applied live in Supabase SQL Editor; this file is the repo record.

CREATE OR REPLACE FUNCTION public.dashboard_overview(
  p_cur_start  timestamptz,
  p_cur_end    timestamptz,
  p_prev_start timestamptz,
  p_prev_end   timestamptz
)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  v_cur_revenue   bigint; v_cur_expense   bigint;   -- expense stored negative
  v_prev_revenue  bigint; v_prev_expense  bigint;
  v_cur_sales_cnt int;    v_cur_sales_tot bigint;
  v_prev_sales_cnt int;   v_prev_sales_tot bigint;
  v_gm_rev_costed bigint; v_gm_cogs bigint; v_gm_costed_cnt int; v_gm_sales_cnt int;
  v_cash_total bigint; v_cash_business bigint; v_cash_private bigint;
  v_receivables bigint; v_open_comm bigint;
  v_inv_units numeric; v_inv_value_cents bigint; v_inv_lots int; v_inv_lots_costed int;
  v_exp_by_cat jsonb; v_stock_by_wh jsonb; v_trend jsonb; v_recent_sales jsonb; v_accounts jsonb;
begin
  select coalesce(round(sum(t.amount_cents * fx.factor) filter (where ac.type = 'income')), 0),
         coalesce(round(sum(t.amount_cents * fx.factor) filter (where ac.type = 'expense')), 0)
    into v_cur_revenue, v_cur_expense
    from transactions t
    join account_categories ac on ac.id = t.category_id
    left join money_accounts ma on ma.id = t.money_account_id
    cross join lateral (
      select case when ma.currency = 'DOP' then 1::numeric
             else coalesce((select r.rate from monthly_exchange_rates r
               where r.currency = ma.currency
               order by r.year desc, r.month desc, r.created_at desc limit 1), 1::numeric) end as factor
    ) fx
   where t.occurred_at >= p_cur_start and t.occurred_at < p_cur_end;
  select coalesce(round(sum(t.amount_cents * fx.factor) filter (where ac.type = 'income')), 0),
         coalesce(round(sum(t.amount_cents * fx.factor) filter (where ac.type = 'expense')), 0)
    into v_prev_revenue, v_prev_expense
    from transactions t
    join account_categories ac on ac.id = t.category_id
    left join money_accounts ma on ma.id = t.money_account_id
    cross join lateral (
      select case when ma.currency = 'DOP' then 1::numeric
             else coalesce((select r.rate from monthly_exchange_rates r
               where r.currency = ma.currency
               order by r.year desc, r.month desc, r.created_at desc limit 1), 1::numeric) end as factor
    ) fx
   where t.occurred_at >= p_prev_start and t.occurred_at < p_prev_end;
  select count(*), coalesce(sum(total_cents), 0)
    into v_cur_sales_cnt, v_cur_sales_tot
    from sales
   where sold_at >= p_cur_start and sold_at < p_cur_end and status not in ('cancelled', 'refunded');
  select count(*), coalesce(sum(total_cents), 0)
    into v_prev_sales_cnt, v_prev_sales_tot
    from sales
   where sold_at >= p_prev_start and sold_at < p_prev_end and status not in ('cancelled', 'refunded');
  select coalesce(sum(total_cents) filter (where cogs_cents is not null and cogs_cents > 0), 0),
         coalesce(sum(cogs_cents)  filter (where cogs_cents is not null and cogs_cents > 0), 0),
         count(*) filter (where cogs_cents is not null and cogs_cents > 0),
         count(*)
    into v_gm_rev_costed, v_gm_cogs, v_gm_costed_cnt, v_gm_sales_cnt
    from sales
   where sold_at >= p_cur_start and sold_at < p_cur_end and status not in ('cancelled', 'refunded');
  select coalesce(sum(balance_cents), 0),
         coalesce(sum(balance_cents) filter (where scope = 'business'), 0),
         coalesce(sum(balance_cents) filter (where scope = 'private'), 0)
    into v_cash_total, v_cash_business, v_cash_private
    from money_accounts where is_active is not false;
  select coalesce(sum(greatest(total_cents - coalesce(paid_cents, 0), 0)), 0)
    into v_receivables
    from sales where status in ('confirmed', 'partially_paid');
  select coalesce(sum(amount_cents), 0) into v_open_comm
    from sale_commissions where status = 'pending';
  select coalesce(sum(qty_remaining), 0),
         coalesce(round(sum(qty_remaining * unit_cost_dop) * 100), 0),
         count(*),
         count(*) filter (where unit_cost_dop is not null and unit_cost_dop > 0)
    into v_inv_units, v_inv_value_cents, v_inv_lots, v_inv_lots_costed
    from inventory_lots where qty_remaining > 0;
  select coalesce(jsonb_agg(jsonb_build_object('name', name, 'amount_cents', amt) order by amt desc), '[]'::jsonb)
    into v_exp_by_cat
    from (
      select ac.name, -coalesce(round(sum(t.amount_cents * fx.factor)), 0) as amt
        from transactions t
        join account_categories ac on ac.id = t.category_id
        left join money_accounts ma on ma.id = t.money_account_id
        cross join lateral (
          select case when ma.currency = 'DOP' then 1::numeric
                 else coalesce((select r.rate from monthly_exchange_rates r
                   where r.currency = ma.currency
                   order by r.year desc, r.month desc, r.created_at desc limit 1), 1::numeric) end as factor
        ) fx
       where ac.type = 'expense' and t.occurred_at >= p_cur_start and t.occurred_at < p_cur_end
       group by ac.name
      having -coalesce(round(sum(t.amount_cents * fx.factor)), 0) > 0
    ) q;
  select coalesce(jsonb_agg(jsonb_build_object('warehouse', wname, 'units', units, 'value_cents', val) order by val desc), '[]'::jsonb)
    into v_stock_by_wh
    from (
      select coalesce(w.name, '(unknown)') as wname,
             coalesce(sum(il.qty_remaining), 0) as units,
             coalesce(round(sum(il.qty_remaining * il.unit_cost_dop) * 100), 0) as val
        from inventory_lots il
        left join warehouses w on w.id = il.warehouse_id
       where il.qty_remaining > 0
       group by coalesce(w.name, '(unknown)')
    ) q;
  select coalesce(jsonb_agg(jsonb_build_object('month', mon, 'revenue_cents', rev, 'expense_cents', exp) order by mon), '[]'::jsonb)
    into v_trend
    from (
      select to_char(date_trunc('month', t.occurred_at), 'YYYY-MM') as mon,
             coalesce(round(sum(t.amount_cents * fx.factor) filter (where ac.type = 'income')), 0)  as rev,
            -coalesce(round(sum(t.amount_cents * fx.factor) filter (where ac.type = 'expense')), 0) as exp
        from transactions t
        join account_categories ac on ac.id = t.category_id
        left join money_accounts ma on ma.id = t.money_account_id
        cross join lateral (
          select case when ma.currency = 'DOP' then 1::numeric
                 else coalesce((select r.rate from monthly_exchange_rates r
                   where r.currency = ma.currency
                   order by r.year desc, r.month desc, r.created_at desc limit 1), 1::numeric) end as factor
        ) fx
       where t.occurred_at >= (date_trunc('month', p_cur_start) - interval '5 months')
         and t.occurred_at <  (date_trunc('month', p_cur_start) + interval '1 month')
       group by 1
    ) q;
  select coalesce(jsonb_agg(jsonb_build_object(
           'invoice', invoice_number, 'customer', cust, 'total_cents', total_cents,
           'paid_cents', coalesce(paid_cents, 0), 'status', status, 'sold_at', sold_at
         ) order by sold_at desc), '[]'::jsonb)
    into v_recent_sales
    from (
      select s.invoice_number, s.total_cents, s.paid_cents, s.status::text as status, s.sold_at,
             p.full_name as cust
        from sales s left join profiles p on p.id = s.customer_id
       order by s.sold_at desc nulls last limit 8
    ) q;
  select coalesce(jsonb_agg(jsonb_build_object(
           'name', name, 'balance_cents', balance_cents, 'currency', currency, 'scope', scope::text
         ) order by balance_cents desc), '[]'::jsonb)
    into v_accounts
    from money_accounts where is_active is not false;
  return jsonb_build_object(
    'current', jsonb_build_object(
      'revenue_cents', v_cur_revenue, 'expenses_cents', -v_cur_expense,
      'net_cents', v_cur_revenue + v_cur_expense, 'sales_count', v_cur_sales_cnt,
      'sales_total_cents', v_cur_sales_tot, 'gross_revenue_costed_cents', v_gm_rev_costed,
      'cogs_cents', v_gm_cogs, 'gross_margin_cents', v_gm_rev_costed - v_gm_cogs,
      'gm_costed_sales', v_gm_costed_cnt, 'gm_total_sales', v_gm_sales_cnt
    ),
    'previous', jsonb_build_object(
      'revenue_cents', v_prev_revenue, 'expenses_cents', -v_prev_expense,
      'net_cents', v_prev_revenue + v_prev_expense, 'sales_count', v_prev_sales_cnt,
      'sales_total_cents', v_prev_sales_tot
    ),
    'cash', jsonb_build_object(
      'total_cents', v_cash_total, 'business_cents', v_cash_business, 'private_cents', v_cash_private
    ),
    'receivables_cents', v_receivables, 'open_commissions_cents', v_open_comm,
    'inventory', jsonb_build_object(
      'units', v_inv_units, 'value_cents', v_inv_value_cents,
      'lots_total', v_inv_lots, 'lots_costed', v_inv_lots_costed
    ),
    'expenses_by_category', v_exp_by_cat, 'stock_by_warehouse', v_stock_by_wh,
    'monthly_trend', v_trend, 'recent_sales', v_recent_sales, 'accounts', v_accounts
  );
end;
$function$;
