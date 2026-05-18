-- ============================================================
-- Round 14b.0.refund - Refund tracking on purchase orders
--
-- markCancelled action (in 14b.2) needs to optionally record
-- a refund: how much came back, when, and into which money
-- account. Three nullable columns on purchase_orders.
--
-- Nullable by design: cancel-from-pending has no refund (no
-- money was paid in the first place). Cancel-from-paid_supplier
-- with a refund fills all three. Application enforces the
-- "all three or none" rule.
--
-- View v_purchase_order_economics intentionally NOT updated.
-- Refund-aware reporting will amend it in a later round when
-- the need surfaces, rather than speculatively now.
--
-- Spec: docs/round-14b-purchases-write.md (Q3 amendment in chat)
-- ============================================================

begin;

alter table public.purchase_orders
  add column if not exists dop_refund_total numeric(12,2) null,
  add column if not exists refund_at_dop timestamptz null,
  add column if not exists refund_account_id uuid null
    references public.money_accounts(id);

commit;