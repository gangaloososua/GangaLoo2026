-- round-73a-account-statement-group-receipts.sql
--
-- Money account "Movimientos" statement: collapse a SPLIT PAYMENT into ONE line.
--
-- Problem: receive_payment() takes one lump (e.g. RD$9,000) and allocates it
-- across several open invoices. It writes ONE payment_receipts row but posts
-- ONE ledger row per invoice (via post_sale_payment_to_ledger). So the money
-- account showed 3 separate movements instead of the single RD$9,000 deposit,
-- making it impossible to match against the real bank deposit.
--
-- Fix (display/report only — NOTHING about how money is posted changes):
-- rebuild the read-only account_statement() so ledger rows that belong to the
-- SAME receipt are grouped into ONE movement. The grouping key is the shared
-- payment_receipts.id, reached via transactions.source_sale_payment_id ->
-- sale_payments.receipt_id. Rows with no receipt (purchases, transfers, manual
-- entries, single sale payments, etc.) are never grouped — their group key is
-- their own transaction id, so they stay exactly as before.
--
-- After grouping, EVERYTHING is computed on the grouped rows so it all agrees:
--   • running SALDO steps once per deposit (by the summed amount)
--   • movement_count counts a split deposit as 1
--   • entradas / salidas totals + counts treat it as 1 movement
--
-- New per-movement fields for the UI:
--   • group_size : how many invoices the deposit covered (1 for normal rows)
--   • invoices   : array of invoice numbers in the deposit (for the expand row)
--
-- Ordering within a group: we keep the EARLIEST (occurred_at, id) of the group
-- as the group's anchor, and sum amounts. Because a split deposit is posted in
-- one receive_payment call, its rows share the same occurred_at, so the saldo
-- is unambiguous.
--
-- Rebuilt from the live body via pg_get_functiondef; only the mov/grouping and
-- the per-row JSON changed. STABLE, read-only.

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
  -- group_key = the shared receipt id when this row is a sale payment that
  -- belongs to a receipt; otherwise the row's own id (so it never groups).
  mov_raw as (
    select t.id, t.occurred_at, t.description, t.amount_cents, t.is_manual,
           sp.receipt_id,
           s.invoice_number,
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
    left join sale_payments sp on sp.id = t.source_sale_payment_id
    left join sales s          on s.id  = t.source_sale_id
    where t.money_account_id = p_account_id
      and coalesce(t.is_initial, false) = false
  ),
  -- Collapse each group into ONE movement.
  mov as (
    select
      min(id::text)                                          as id,        -- stable anchor id
      min(occurred_at)                                       as occurred_at,
      sum(amount_cents)                                      as amount_cents,
      bool_and(is_manual)                                    as is_manual,
      -- one tipo per group (they're identical within a receipt group)
      min(tipo)                                              as tipo,
      count(*)                                               as group_size,
      -- invoice numbers covered (only meaningful for grouped sale payments)
      coalesce(
        jsonb_agg(distinct invoice_number) filter (where invoice_number is not null),
        '[]'::jsonb
      )                                                      as invoices,
      -- for the deposit description, reuse a representative description
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
                'group_size', group_size, 'invoices', invoices)
              order by sort_at desc, sort_id desc)
       from running), '[]'::jsonb)
  ); $function$;
