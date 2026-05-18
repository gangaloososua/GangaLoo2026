-- ============================================================
-- Round 14b.0 - Purchases write surface, schema preparation
--
-- Two independent changes, two BEGIN/COMMIT blocks:
--   1. Add 'cancelled' and 'lost' to purchase_status enum
--   2. Add usd_discount column; regenerate usd_total expression
--
-- Idempotent: every change uses IF NOT EXISTS or its equivalent.
-- Safe to re-run.
--
-- Spec: docs/round-14b-purchases-write.md
-- ============================================================

-- ---- Part 1: enum values -----------------------------------

begin;

alter type public.purchase_status add value if not exists 'cancelled';
alter type public.purchase_status add value if not exists 'lost';

commit;

-- ---- Part 2: usd_discount + regenerated usd_total ----------

begin;

-- Add the discount column. Default 0 means existing rows have
-- usd_total unchanged after we regenerate the expression.
alter table public.purchase_orders
  add column if not exists usd_discount numeric(12,2) not null default 0;

-- The existing usd_total is a generated column. Its expression
-- can't be altered in place; drop and re-add.
alter table public.purchase_orders
  drop column if exists usd_total;

alter table public.purchase_orders
  add column usd_total numeric(12,2)
    generated always as
      (usd_subtotal + usd_shipping + usd_tax - usd_discount)
    stored;

commit;
