-- Round 12.0.a — ROLLBACK
--
-- Reverses round-12-exchange-rates-currency.sql.
--
-- This drops the currency column and the new uniqueness. It does
-- NOT restore any prior unique constraint; rolling back to the
-- exact pre-12 state would require an audit of which constraint
-- existed before the apply. If you genuinely need that, check the
-- migration history and re-create manually.
--
-- Multi-currency rows that exist after the apply will lose their
-- currency designation. If multiple rows share the same (year, month)
-- but differed only by currency, those are now duplicates with no
-- distinguishing column. That data loss is the price of rollback.

BEGIN;

ALTER TABLE public.monthly_exchange_rates
  DROP CONSTRAINT IF EXISTS monthly_exchange_rates_year_month_currency_key;

ALTER TABLE public.monthly_exchange_rates
  DROP COLUMN IF EXISTS currency;

COMMIT;
