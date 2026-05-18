-- ============================================================
-- Round 14b.0 - Fix: view dependency on usd_total
--
-- The original migration (round-14b-purchases-write.sql) part 1
-- (enum values) committed successfully. Part 2 (usd_discount +
-- regenerated usd_total) failed because v_purchase_order_economics
-- depends on usd_total and Postgres refused the drop.
--
-- This migration completes the part-2 work by dropping the view
-- first, doing the column surgery, then recreating the view with
-- usd_discount surfaced.
--
-- Single BEGIN/COMMIT: all-or-nothing.
--
-- Spec: docs/round-14b-purchases-write.md
-- ============================================================
begin;

-- Drop the dependent view. We will recreate it at the end.
drop view if exists public.v_purchase_order_economics;

-- Add the discount column. Default 0 means existing rows have
-- usd_total unchanged after we regenerate the expression.
alter table public.purchase_orders
  add column if not exists usd_discount numeric(12,2) not null default 0;

-- The existing usd_total is a generated column. Its expression
-- can't be altered in place; drop and re-add with the new formula.
alter table public.purchase_orders
  drop column if exists usd_total;

alter table public.purchase_orders
  add column usd_total numeric(12,2)
    generated always as
      (usd_subtotal + usd_shipping + usd_tax - usd_discount)
    stored;

-- Recreate the view. Same body as before, plus usd_discount in
-- the SELECT list so the new column is exposed alongside the
-- other USD fields.
create view public.v_purchase_order_economics as
  SELECT po.id,
    po.supplier_id,
    po.warehouse_id,
    po.status,
    po.ordered_at,
    po.expected_at,
    po.paid_at_dop,
    po.received_at,
    po.completed_at,
    po.usd_subtotal,
    po.usd_shipping,
    po.usd_tax,
    po.usd_discount,
    po.usd_total,
    po.dop_paid_total,
    po.exchange_rate,
    po.dop_bank_fee,
    po.official_rate_at_payment,
    po.supplier_payment_account_id,
    po.notes,
    po.legacy_id,
    po.created_at,
    po.updated_at,
    pot.dop_transport_total,
    COALESCE(po.dop_paid_total, 0::numeric) + pot.dop_transport_total AS dop_real_total,
        CASE
            WHEN po.received_at IS NULL THEN 'awaiting_goods'::text
            WHEN po.paid_at_dop IS NULL THEN 'awaiting_supplier_payment'::text
            WHEN pot.dop_transport_total = 0::numeric THEN 'awaiting_courier'::text
            ELSE 'complete'::text
        END AS derived_status
   FROM purchase_orders po
     JOIN v_purchase_order_transport pot ON pot.purchase_order_id = po.id;

commit;