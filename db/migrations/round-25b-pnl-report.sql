-- Round 25b - Profit & Loss report function.
--
-- Read-only STABLE function backing the Reports > Profit & Loss screen.
-- Given a current window [p_cur_start, p_cur_end) and the comparison window
-- before it [p_prev_start, p_prev_end), returns one jsonb bundle:
--
--   { "lines":  [ { id, name, type, scope, current_cents, prior_cents }, ... ],
--     "totals": { "business": {...}, "all": {...} } }
--
-- Mirrors dashboard_overview's ledger logic so the numbers reconcile to the
-- peso: income categories store positive amounts, expense categories store
-- negative; net = income + expense (signed). Per-line current_cents/prior_cents
-- keep their natural ledger sign. The TOTALS blocks expose expense as a
-- positive magnitude (negated) for display, and carry two scopes - 'business'
-- (scope = 'business' only) and 'all' (every scope) - so the screen's
-- Business/Everything toggle is a pure client switch with no refetch.
--
-- Only categories of type income/expense that had activity in either window
-- appear in `lines`. Dated by transactions.occurred_at.

create or replace function public.pnl_report(
  p_cur_start  timestamptz,
  p_cur_end    timestamptz,
  p_prev_start timestamptz,
  p_prev_end   timestamptz
)
returns jsonb
language sql
stable
as $$
  with cur as (
    select t.category_id, sum(t.amount_cents) as amt
    from transactions t
    where t.occurred_at >= p_cur_start and t.occurred_at < p_cur_end
    group by t.category_id
  ),
  prev as (
    select t.category_id, sum(t.amount_cents) as amt
    from transactions t
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
$$;
