-- ============================================================================
-- Round 25a: dashboard_overview() - one read-only aggregation function that
-- powers the real-numbers dashboard. Returns a single jsonb bundle so the app
-- makes ONE round-trip instead of a dozen queries.
--
-- Periods: the caller passes the current window [p_cur_start, p_cur_end) and
-- the previous window [p_prev_start, p_prev_end) (e.g. this month vs last
-- month). Period-bound figures (revenue, expenses, sales, gross margin) use
-- these; point-in-time figures (cash, receivables, commissions, inventory)
-- ignore them and reflect "right now".
--
-- Verified data rules baked in (this session):
--  * Revenue  = income-type ledger lines (positive cents).
--  * Expenses = expense-type ledger lines (stored negative; returned positive).
--    Net (cash view) = revenue + expense-lines = revenue - expenses.
--    asset/liability/equity ledger lines are intentionally excluded from P&L.
--  * Gross margin (sales view) = revenue - COGS, ONLY over sales that actually
--    carry a cost; returns the costed/total counts so the UI can show
--    "based on N of M sales" (COGS is mostly missing on legacy sales).
--  * Cash = current money_account balances (cents), split business/private.
--  * Receivables = outstanding (total - paid) on 'confirmed' + 'partially_paid'
--    sales ONLY. 'paid' sales are treated as paid (their legacy paid_cents gaps
--    would otherwise inflate the figure).
--  * Inventory value: inventory_lots.unit_cost_dop is in PESOS, so value is
--    sum(qty_remaining * unit_cost_dop) * 100 to express it in cents like
--    everything else. lots_total/lots_costed expose cost coverage.
--
-- STABLE, read-only. No writes, so no owner gate here; the app calls it behind
-- requireOwner(). All money values in the bundle are in CENTS unless noted.
-- ============================================================================

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
  -- Ledger: current period
  select coalesce(sum(t.amount_cents) filter (where ac.type = 'income'), 0),
         coalesce(sum(t.amount_cents) filter (where ac.type = 'expense'), 0)
    into v_cur_revenue, v_cur_expense
    from transactions t
    join account_categories ac on ac.id = t.category_id
   where t.occurred_at >= p_cur_start and t.occurred_at < p_cur_end;

  -- Ledger: previous period
  select coalesce(sum(t.amount_cents) filter (where ac.type = 'income'), 0),
         coalesce(sum(t.amount_cents) filter (where ac.type = 'expense'), 0)
    into v_prev_revenue, v_prev_expense
    from transactions t
    join account_categories ac on ac.id = t.category_id
   where t.occurred_at >= p_prev_start and t.occurred_at < p_prev_end;

  -- Sales: current period (exclude cancelled/refunded)
  select count(*), coalesce(sum(total_cents), 0)
    into v_cur_sales_cnt, v_cur_sales_tot
    from sales
   where sold_at >= p_cur_start and sold_at < p_cur_end
     and status not in ('cancelled', 'refunded');

  -- Sales: previous period
  select count(*), coalesce(sum(total_cents), 0)
    into v_prev_sales_cnt, v_prev_sales_tot
    from sales
   where sold_at >= p_prev_start and sold_at < p_prev_end
     and status not in ('cancelled', 'refunded');

  -- Gross margin: current period, only sales that carry a cost
  select coalesce(sum(total_cents) filter (where cogs_cents is not null and cogs_cents > 0), 0),
         coalesce(sum(cogs_cents)  filter (where cogs_cents is not null and cogs_cents > 0), 0),
         count(*) filter (where cogs_cents is not null and cogs_cents > 0),
         count(*)
    into v_gm_rev_costed, v_gm_cogs, v_gm_costed_cnt, v_gm_sales_cnt
    from sales
   where sold_at >= p_cur_start and sold_at < p_cur_end
     and status not in ('cancelled', 'refunded');

  -- Cash on hand (point in time)
  select coalesce(sum(balance_cents), 0),
         coalesce(sum(balance_cents) filter (where scope = 'business'), 0),
         coalesce(sum(balance_cents) filter (where scope = 'private'), 0)
    into v_cash_total, v_cash_business, v_cash_private
    from money_accounts
   where is_active is not false;

  -- Receivables (confirmed + partially_paid only)
  select coalesce(sum(greatest(total_cents - coalesce(paid_cents, 0), 0)), 0)
    into v_receivables
    from sales
   where status in ('confirmed', 'partially_paid');

  -- Open commissions (point in time)
  select coalesce(sum(amount_cents), 0)
    into v_open_comm
    from sale_commissions
   where status = 'pending';

  -- Inventory (unit_cost_dop is PESOS -> *100 to cents)
  select coalesce(sum(qty_remaining), 0),
         coalesce(round(sum(qty_remaining * unit_cost_dop) * 100), 0),
         count(*),
         count(*) filter (where unit_cost_dop is not null and unit_cost_dop > 0)
    into v_inv_units, v_inv_value_cents, v_inv_lots, v_inv_lots_costed
    from inventory_lots
   where qty_remaining > 0;

  -- Expenses by category (current period; positive magnitudes, biggest first)
  select coalesce(jsonb_agg(jsonb_build_object('name', name, 'amount_cents', amt) order by amt desc), '[]'::jsonb)
    into v_exp_by_cat
    from (
      select ac.name, -coalesce(sum(t.amount_cents), 0) as amt
        from transactions t
        join account_categories ac on ac.id = t.category_id
       where ac.type = 'expense'
         and t.occurred_at >= p_cur_start and t.occurred_at < p_cur_end
       group by ac.name
      having -coalesce(sum(t.amount_cents), 0) > 0
    ) q;

  -- Stock by warehouse (units + value in cents)
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

  -- Monthly trend: 6 months ending in the current period's month
  select coalesce(jsonb_agg(jsonb_build_object('month', mon, 'revenue_cents', rev, 'expense_cents', exp) order by mon), '[]'::jsonb)
    into v_trend
    from (
      select to_char(date_trunc('month', t.occurred_at), 'YYYY-MM') as mon,
             coalesce(sum(t.amount_cents) filter (where ac.type = 'income'), 0)  as rev,
            -coalesce(sum(t.amount_cents) filter (where ac.type = 'expense'), 0) as exp
        from transactions t
        join account_categories ac on ac.id = t.category_id
       where t.occurred_at >= (date_trunc('month', p_cur_start) - interval '5 months')
         and t.occurred_at <  (date_trunc('month', p_cur_start) + interval '1 month')
       group by 1
    ) q;

  -- Recent sales (latest 8 overall)
  select coalesce(jsonb_agg(jsonb_build_object(
           'invoice', invoice_number,
           'customer', cust,
           'total_cents', total_cents,
           'paid_cents', coalesce(paid_cents, 0),
           'status', status,
           'sold_at', sold_at
         ) order by sold_at desc), '[]'::jsonb)
    into v_recent_sales
    from (
      select s.invoice_number, s.total_cents, s.paid_cents, s.status::text as status, s.sold_at,
             p.full_name as cust
        from sales s
        left join profiles p on p.id = s.customer_id
       order by s.sold_at desc nulls last
       limit 8
    ) q;

  -- Account balances (active accounts, biggest first)
  select coalesce(jsonb_agg(jsonb_build_object(
           'name', name, 'balance_cents', balance_cents,
           'currency', currency, 'scope', scope::text
         ) order by balance_cents desc), '[]'::jsonb)
    into v_accounts
    from money_accounts
   where is_active is not false;

  return jsonb_build_object(
    'current', jsonb_build_object(
      'revenue_cents',  v_cur_revenue,
      'expenses_cents', -v_cur_expense,
      'net_cents',      v_cur_revenue + v_cur_expense,
      'sales_count',    v_cur_sales_cnt,
      'sales_total_cents', v_cur_sales_tot,
      'gross_revenue_costed_cents', v_gm_rev_costed,
      'cogs_cents',     v_gm_cogs,
      'gross_margin_cents', v_gm_rev_costed - v_gm_cogs,
      'gm_costed_sales', v_gm_costed_cnt,
      'gm_total_sales',  v_gm_sales_cnt
    ),
    'previous', jsonb_build_object(
      'revenue_cents',  v_prev_revenue,
      'expenses_cents', -v_prev_expense,
      'net_cents',      v_prev_revenue + v_prev_expense,
      'sales_count',    v_prev_sales_cnt,
      'sales_total_cents', v_prev_sales_tot
    ),
    'cash', jsonb_build_object(
      'total_cents',    v_cash_total,
      'business_cents', v_cash_business,
      'private_cents',  v_cash_private
    ),
    'receivables_cents',     v_receivables,
    'open_commissions_cents', v_open_comm,
    'inventory', jsonb_build_object(
      'units',       v_inv_units,
      'value_cents', v_inv_value_cents,
      'lots_total',  v_inv_lots,
      'lots_costed', v_inv_lots_costed
    ),
    'expenses_by_category', v_exp_by_cat,
    'stock_by_warehouse',   v_stock_by_wh,
    'monthly_trend',        v_trend,
    'recent_sales',         v_recent_sales,
    'accounts',             v_accounts
  );
end;
$function$;
