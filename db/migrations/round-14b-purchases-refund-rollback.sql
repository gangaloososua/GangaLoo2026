-- ============================================================
-- Round 14b.0.refund - ROLLBACK
--
-- Reverses round-14b-purchases-refund.sql by dropping the
-- three refund columns from purchase_orders.
--
-- Drop order does not matter (no inter-column dependencies).
-- IF EXISTS makes the rollback idempotent and safe to re-run.
--
-- This rollback is destructive: if any rows have non-null
-- values in these columns at rollback time, that refund data
-- is lost. Refusing-to-drop guard would belong here if that
-- ever becomes a concern; for now we accept the risk because
-- 14b.2 (markCancelled) is not yet written, so no refunds
-- can possibly exist.
-- ============================================================

begin;

alter table public.purchase_orders
  drop column if exists refund_account_id,
  drop column if exists refund_at_dop,
  drop column if exists dop_refund_total;

commit;