-- Round 15.2.3a — relax sale_payments CHECK constraint
--
-- The original CHECK (amount_cents > 0) prevented mark_cancelled_online
-- from writing compensating negative payment rows, which is the
-- documented behaviour per the round-15 spec (section 5). Relax to
-- amount_cents <> 0 to permit compensations while still preventing
-- zero-amount payments (which would be meaningless).
--
-- All existing rows continue to satisfy the new constraint: every
-- non-cancelled sale_payment was inserted under the prior >0 rule,
-- so all are still positive.
--
-- Callers other than mark_cancelled_online (POS confirm,
-- create_online_order, future modules) have no reason to insert
-- negative amounts; their RPCs and form layers continue to gate the
-- value at the source.

ALTER TABLE public.sale_payments
  DROP CONSTRAINT IF EXISTS sale_payments_amount_cents_check;

ALTER TABLE public.sale_payments
  ADD CONSTRAINT sale_payments_amount_cents_check
  CHECK (amount_cents <> 0);