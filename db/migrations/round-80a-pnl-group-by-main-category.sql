-- round-80a-pnl-group-by-main-category.sql
--
-- Reports > Profit & Loss: return ONE line per real category (each sub, plus
-- any main that had money posted directly to it), and carry each line's MAIN
-- category (main_id / main_name) + an is_main flag. This lets the P&L screen
-- group sub-categories under their main category and render a proper
-- hierarchical statement (bold main subtotal + indented subs), and lets the
-- donut/waterfall charts group by main.
--
-- READ / REPORT ONLY. This function computes how expenses & income are grouped
-- for DISPLAY; it never posts, moves, or reverses money. The FX conversion,
-- the two total blocks (business / all), the Business-vs-Everything split, and
-- the vs-prior math are UNCHANGED from the prior version. Totals do not move.
--
-- What changed vs the prior body:
--   * `lines` now also selects coalesce(parent_id, id) as main_id,
--     coalesce(pm.name, name) as main_name (via a self-join to the parent),
--     and (parent_id is null) as is_main.
--   * The emitted per-line jsonb gained main_id / main_name / is_main.
-- Everything else (cur/prev CTEs grouping by t.category_id, the fx CTE, both
-- totals blocks) is reproduced verbatim.
--
-- Applied live in Supabase SQL Editor; this file is the repo record.

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
      coalesce(ac.parent_id, ac.id) as main_id,
      coalesce(pm.name, ac.name)    as main_name,
      (ac.parent_id is null)        as is_main,
      coalesce(cur.amt, 0)  as current_cents,
      coalesce(prev.amt, 0) as prior_cents
    from account_categories ac
    left join account_categories pm on pm.id = ac.parent_id
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
          'main_id', main_id::text,
          'main_name', main_name,
          'is_main', is_main,
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
