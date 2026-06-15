-- round-73a-us-order-ledger-columns.sql
-- Phase 4: link US orders to the accounting ledger. Additive only.
-- Mirrors round-54a (payroll advance ledger sync).

alter table public.transactions
  add column if not exists source_us_order_id uuid;
create index if not exists idx_transactions_us_order
  on public.transactions (source_us_order_id);

alter table public.us_orders
  add column if not exists income_transaction_id   uuid,
  add column if not exists supplier_transaction_id  uuid;
