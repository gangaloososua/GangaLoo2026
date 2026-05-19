-- Round 15.1 — Online Orders schema additions
--
-- Adds two timestamp columns to public.sales for tracking the online-
-- order fulfillment lifecycle. Both nullable, both set by RPCs in 15.2:
--   dispatched_at  — set by mark_dispatched (delivery method only)
--   delivered_at   — set by mark_delivered (any fulfillment method)
--
-- Idempotent: IF NOT EXISTS guards both adds.
-- No backfill: all existing online sales remain NULL on these columns;
-- the 8 migrated rows are pre-delivered (tracking_status='delivered'
-- or 'pending') but we don't have historical timestamps for them.

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS dispatched_at timestamptz;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS delivered_at  timestamptz;