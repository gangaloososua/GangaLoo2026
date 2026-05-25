-- round-33b-public-store-config.sql
-- Fix: the public storefront checkout needs to read delivery fees (and the
-- bank-transfer details) from store_config, but store_config is locked
-- staff-only by RLS (security sweep). An anonymous/customer session reading it
-- directly fails with 42501 (permission denied), crashing the checkout page.
--
-- This adds a NARROW, read-only SECURITY DEFINER function that returns ONLY the
-- delivery fees and bank-transfer fields -- nothing else from store_config --
-- so customers never get blanket read access to the config. The function runs
-- as its owner, which bypasses the table's RLS, exactly like
-- place_storefront_order() already does.

create or replace function public.get_store_public_config()
returns jsonb
language sql
security definer
set search_path to 'public', 'pg_temp'
stable
as $function$
  select jsonb_build_object(
    'delivery_fees',   (select value from store_config where key = 'delivery_fees'),
    'bankName',        (select value from store_config where key = 'bankName'),
    'bankAccount',     (select value from store_config where key = 'bankAccount'),
    'bankAccountName', (select value from store_config where key = 'bankAccountName'),
    'bankAccountType', (select value from store_config where key = 'bankAccountType')
  );
$function$;

comment on function public.get_store_public_config() is
  'Public storefront config: returns ONLY delivery_fees + bank transfer details. '
  'SECURITY DEFINER so anonymous/customer sessions can read these specific '
  'values without direct (RLS-blocked) access to store_config.';

-- Let the storefront (logged out or logged in) call it.
grant execute on function public.get_store_public_config() to anon, authenticated;
