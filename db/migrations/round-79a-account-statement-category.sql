-- round-79a-account-statement-category.sql
--
-- 2026-06-24. The money-account "Movimientos" statement shows Description + Tipo
-- but not the accounting Category. The Accounting list (lib/transactions.ts)
-- joins account_categories(name, type) and renders "Name (Type)" — we want the
-- same Category in Movimientos. account_statement() builds the rows in SQL and
-- did not carry the category, so it is added here.
--
-- Each ledger row's category comes from transactions.category_id ->
-- account_categories(name, type). Grouped sale-payment rows (collapsed by
-- group_key) take a representative value via min(), same pattern as the other
-- per-group fields; receipts/transfers usually have no category, so those cells
-- are simply blank (matches Accounting, which only labels when a category exists).
--
-- Read-only function (LANGUAGE sql, STABLE); rebuilt verbatim from the live body
-- with only the category join + two new JSON fields added. No signature change,
-- no grant change.

create or replace function public.account_statement(p_account_id uuid)
 returns jsonb
 language sql
 stable
as $function$
  with acct as (
    select id, name, kind, currency,
           coalesce(initial_balance_cents, 0) as opening_cents,
           coalesce(balance_cents, 0)         as stored_balance_cents
    from money_accounts
    where id = p_account_id
  ),
  -- Raw ledger rows for this account, tagged with tipo + the grouping key.
  mov_raw as (
    select t.id, t.occurred_at, t.description, t.amount_cents, t.is_manual,
           sp.receipt_id,
           s.invoice_number,
           ac.name as category_name,             -- round-79a
           ac.type::text as category_type,        -- round-79a
           case
             when t.source_commission_payout_id is not null then 'Comisiones'
             when t.source_courier_payment_id   is not null then 'Courier'
             when t.source_purchase_order_id    is not null then 'Compras'
             when t.source_transfer_id          is not null then 'Transferencias'
             when t.source_sale_payment_id is not null
               or t.source_sale_id is not null              then 'Cobros'
             when t.description ilike 'Transferencia%'       then 'Transferencias'
             else 'Transacciones'
           end as tipo,
           coalesce(sp.receipt_id::text, t.id::text) as group_key
    from transactions t
    left join sale_payments sp     on sp.id = t.source_sale_payment_id
    left join sales s              on s.id  = t.source_sale_id
    left join account_categories ac on ac.id = t.category_id   -- round-79a
    where t.money_account_id = p_account_id
      and coalesce(t.is_initial, false) = false
  ),
  -- Collapse each group into ONE movement.
  mov as (
    select
      min(id::text)                                          as id,
      min(occurred_at)                                       as occurred_at,
      sum(amount_cents)                                      as amount_cents,
      bool_and(is_manual)                                    as is_manual,
      min(tipo)                                              as tipo,
      min(category_name)                                     as category_name,  -- round-79a
      min(category_type)                                     as category_type,  -- round-79a
      count(*)                                               as group_size,
      coalesce(
        jsonb_agg(distinct invoice_number) filter (where invoice_number is not null),
        '[]'::jsonb
      )                                                      as invoices,
      min(description)                                       as description,
      min(occurred_at)                                       as sort_at,
      min(id::text)                                          as sort_id
    from mov_raw
    group by group_key
  ),
  running as (
    select m.*,
           (select opening_cents from acct)
             + sum(m.amount_cents) over (order by m.sort_at, m.sort_id
                 rows between unbounded preceding and current row) as saldo_cents
    from mov m
  ),
  agg as (
    select count(*)                                                       as movement_count,
           count(*) filter (where amount_cents >= 0)                      as in_count,
           coalesce(sum(amount_cents) filter (where amount_cents >= 0), 0) as in_total,
           count(*) filter (where amount_cents < 0)                       as out_count,
           coalesce(sum(amount_cents) filter (where amount_cents < 0), 0)  as out_total,
           coalesce(sum(amount_cents), 0)                                 as net_total
    from mov
  )
  select jsonb_build_object(
    'account', (select jsonb_build_object('id', id, 'name', name, 'kind', kind, 'currency', currency) from acct),
    'opening_cents',          (select opening_cents from acct),
    'stored_balance_cents',   (select stored_balance_cents from acct),
    'computed_balance_cents', (select opening_cents from acct) + (select net_total from agg),
    'movement_count',         (select movement_count from agg),
    'entradas', jsonb_build_object('count', (select in_count from agg),  'total_cents', (select in_total from agg)),
    'salidas',  jsonb_build_object('count', (select out_count from agg), 'total_cents', (select out_total from agg)),
    'movements', coalesce((
       select jsonb_agg(jsonb_build_object(
                'id', id, 'occurred_at', occurred_at, 'description', description,
                'tipo', tipo, 'amount_cents', amount_cents,
                'saldo_cents', saldo_cents, 'is_manual', is_manual,
                'group_size', group_size, 'invoices', invoices,
                'category_name', category_name,   -- round-79a
                'category_type', category_type)   -- round-79a
              order by sort_at desc, sort_id desc)
       from running), '[]'::jsonb)
  ); $function$;
