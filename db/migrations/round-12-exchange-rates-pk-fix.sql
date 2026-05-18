-- Round 12.0.a-fix — make currency part of the primary key
--
-- The first attempt at adding currency support
-- (round-12-exchange-rates-currency.sql) added the column and a
-- unique (year, month, currency) constraint, but missed that the
-- primary key is still on (year, month). That PK rejects a second
-- row for the same month even if the currency differs — preventing
-- the multi-currency case the migration was meant to enable.
--
-- This migration drops the old PK and creates a new PK on
-- (year, month, currency). The now-redundant (year, month, currency)
-- unique constraint is also dropped.
--
-- Idempotent.

BEGIN;

-- 1. Drop the redundant unique constraint (will be replaced by the PK).
ALTER TABLE public.monthly_exchange_rates
  DROP CONSTRAINT IF EXISTS monthly_exchange_rates_year_month_currency_key;

-- 2. Drop the old (year, month) primary key.
ALTER TABLE public.monthly_exchange_rates
  DROP CONSTRAINT IF EXISTS monthly_exchange_rates_pkey;

-- 3. Create the new (year, month, currency) primary key.
ALTER TABLE public.monthly_exchange_rates
  ADD CONSTRAINT monthly_exchange_rates_pkey
  PRIMARY KEY (year, month, currency);

COMMIT;
