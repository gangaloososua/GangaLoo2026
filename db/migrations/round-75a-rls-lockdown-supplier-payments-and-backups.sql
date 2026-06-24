-- round-75a-rls-lockdown-supplier-payments-and-backups.sql
--
-- 2026-06-24. Supabase flagged six public tables with Row-Level Security OFF
-- (rls_disabled_in_public). Fix below. Applied live in the Supabase SQL Editor;
-- saved here as the repo record (no code change accompanies this).
--
-- Context:
--   * supplier_payment_allocations / supplier_payment_receipts are the live
--     supplier-payment money trail. They had direct SELECT/INSERT/UPDATE/DELETE
--     grants to `authenticated` (= ANY signed-in user, including storefront
--     `customer` accounts) -> a customer could read/edit them via the auto API.
--     The app NEVER reads these directly (grep of *.ts/*.tsx = 0 matches); all
--     access is through SECURITY DEFINER RPCs (add/remove supplier payment),
--     which bypass RLS and gate on owner/admin. So revoking the grants +
--     enabling RLS closes the hole without affecting the app.
--   * backup_20260525_* are one-off May-25 snapshots that nothing reads.
--     Enabling RLS with no policy makes them fully private (service-role only).
--     Could be DROPped later once confirmed unneeded.

-- 1) Supplier-payment money tables: revoke direct API access, then enable RLS.
revoke all on public.supplier_payment_allocations from anon, authenticated;
revoke all on public.supplier_payment_receipts    from anon, authenticated;

alter table public.supplier_payment_allocations enable row level security;
alter table public.supplier_payment_receipts    enable row level security;

-- 2) May-25 backup snapshots: enable RLS (no policy = private, admin-only).
alter table public.backup_20260525_courier_payment_allocations enable row level security;
alter table public.backup_20260525_inventory_lots              enable row level security;
alter table public.backup_20260525_purchase_order_items        enable row level security;
alter table public.backup_20260525_purchase_orders             enable row level security;

-- Verify (expect 0 rows): no anon/authenticated grants remain on the money tables.
-- select grantee, privilege_type, table_name
-- from information_schema.role_table_grants
-- where table_schema = 'public'
--   and table_name in ('supplier_payment_allocations', 'supplier_payment_receipts')
--   and grantee in ('anon', 'authenticated');
