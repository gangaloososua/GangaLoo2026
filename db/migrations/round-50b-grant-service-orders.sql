-- round-50b-grant-service-orders.sql
-- Fix: the server-side admin client (service_role key) was getting
-- "permission denied for table service_orders". round-50a revoked the table
-- from anon/authenticated and relied on Supabase's automatic grant to
-- service_role, which did not apply to this table. Grant it explicitly.
--
-- This does NOT loosen anything for the public:
--   * service_role bypasses RLS and is only ever used server-side (secret key).
--   * anon and authenticated remain revoked + blocked by RLS (no policies).
--   * customers still reach their data only through the two SECURITY DEFINER
--     functions granted in round-50a.

grant all on table public.service_orders to service_role;
