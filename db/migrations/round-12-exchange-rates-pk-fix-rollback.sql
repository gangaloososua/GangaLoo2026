-- Round 12.0.a-fix — ROLLBACK
--
-- Reverses round-12-exchange-rates-pk-fix.sql by restoring the old
-- (year, month) primary key. If multiple rows now share a (year,
-- month) and differ only by currency, this rollback will fail with
-- a uniqueness violation — that data must be cleaned up first.

BEGIN;

ALTER TABLE public.monthly_exchange_rates
  DROP CONSTRAINT IF EXISTS monthly_exchange_rates_pkey;

ALTER TABLE public.monthly_exchange_rates
  ADD CONSTRAINT monthly_exchange_rates_pkey
  PRIMARY KEY (year, month);

ALTER TABLE public.monthly_exchange_rates
  ADD CONSTRAINT monthly_exchange_rates_year_month_currency_key
  UNIQUE (year, month, currency);

COMMIT;
