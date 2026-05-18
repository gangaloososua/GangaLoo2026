-- Round 12.0.a — currency column on monthly_exchange_rates
--
-- Before this change, monthly_exchange_rates assumed a single
-- conversion (USD->DOP). Round 12 needs multi-currency support
-- for the Money Accounts grand total. This adds a `currency`
-- column, backfills the one existing row as USD, and replaces
-- the implicit (year, month) uniqueness with explicit
-- (year, month, currency).
--
-- Idempotent: re-running is a no-op if the column already exists.

BEGIN;

-- 1. Add currency column with a default so the backfill is automatic.
ALTER TABLE public.monthly_exchange_rates
  ADD COLUMN IF NOT EXISTS currency text;

-- 2. Backfill: any pre-existing row is the USD->DOP rate.
UPDATE public.monthly_exchange_rates
   SET currency = 'USD'
 WHERE currency IS NULL;

-- 3. Lock the column NOT NULL now that every row has a value.
ALTER TABLE public.monthly_exchange_rates
  ALTER COLUMN currency SET NOT NULL;

-- 4. Replace any old single-key uniqueness (year, month) with the
--    new triple uniqueness (year, month, currency).
DO $$
DECLARE
  con_name text;
BEGIN
  FOR con_name IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'public.monthly_exchange_rates'::regclass
       AND contype = 'u'
       AND pg_get_constraintdef(oid) LIKE '%(year, month)%'
       AND pg_get_constraintdef(oid) NOT LIKE '%currency%'
  LOOP
    EXECUTE format('ALTER TABLE public.monthly_exchange_rates DROP CONSTRAINT %I', con_name);
  END LOOP;
END $$;

-- Also drop any unique index that doesn't go through a constraint
-- (Supabase migrations sometimes leave bare indexes around).
DROP INDEX IF EXISTS public.monthly_exchange_rates_year_month_key;

-- Add the new uniqueness.
ALTER TABLE public.monthly_exchange_rates
  DROP CONSTRAINT IF EXISTS monthly_exchange_rates_year_month_currency_key;

ALTER TABLE public.monthly_exchange_rates
  ADD CONSTRAINT monthly_exchange_rates_year_month_currency_key
  UNIQUE (year, month, currency);

COMMIT;
