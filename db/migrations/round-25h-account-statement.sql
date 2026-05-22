-- Round 25h - Account Statement (Movimientos)
--
-- Read-only function backing the per-account statement modal on the Money
-- Accounts page. Gathers every movement that touches a money account from the
-- transactions ledger, tags each with its tipo (derived from which source_*
-- column is filled), and computes a running SALDO from the account's opening
-- balance (initial_balance_cents). Money in CENTS. amount_cents is signed
-- (income +, expense -); direction is read from the sign.
--
-- TIPO note: migrated money transfers were imported as plain transactions rows
-- with NO source_transfer_id (the link column is empty on every row) but a
-- "Transferencia ..." description. There is no money-transfer table (only
-- stock_transfers / stock_transfer_items, which are inventory, not money). So
-- after the real source-link checks, we fall back to tagging rows whose
-- description starts with "Transferencia" as Transferencias. This heals ~80
-- legacy rows that previously showed as Transacciones.
--
-- computed_balance_cents = opening + net of all movements (the honest current
-- saldo). stored_balance_cents = whatever the account card currently shows;
-- the two can differ (migration drift) and are reconciled by the stage-2
-- set_account_opening control. Excludes the is_initial opening row from the
-- movement list (it's folded into opening_cents instead).

create or replace function public.account_statement(p_account_id uuid)
returns jsonb language sql stable as $as$
  with acct as (
    select id, name, kind, currency,
           coalesce(initial_balance_cents, 0) as opening_cents,
           coalesce(balance_cents, 0)         as stored_balance_cents
    from money_accounts
    where id = p_account_id
  ),
  mov as (
    select t.id, t.occurred_at, t.description, t.amount_cents, t.is_manual,
           case
             when t.source_commission_payout_id is not null then 'Comisiones'
             when t.source_courier_payment_id   is not null then 'Courier'
             when t.source_purchase_order_id    is not null then 'Compras'
             when t.source_transfer_id          is not null then 'Transferencias'
             when t.source_sale_payment_id is not null
               or t.source_sale_id is not null              then 'Cobros'
             when t.description ilike 'Transferencia%'       then 'Transferencias'
             else 'Transacciones'
           end as tipo
    from transactions t
    where t.money_account_id = p_account_id
      and coalesce(t.is_initial, false) = false
  ),
  running as (
    select m.*,
           (select opening_cents from acct)
             + sum(m.amount_cents) over (order by m.occurred_at, m.id
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
                'saldo_cents', saldo_cents, 'is_manual', is_manual)
              order by occurred_at desc, id desc)
       from running), '[]'::jsonb)
  ); $as$;
