-- =====================================================================
-- Round 11.10 - RLS rollback
-- =====================================================================
-- Disables RLS on every table the apply migration touched, drops every
-- policy, and drops the auth_role() helper. Wrapped in a transaction
-- so a partial failure rolls back.
--
-- Apply via Supabase SQL editor. Idempotent: re-running on an already
-- rolled-back DB is a no-op.
--
-- Pairs with: round-11-rls.sql
-- =====================================================================

BEGIN;

-- Section 6. Finance / config ----------------------------------------

ALTER TABLE suppliers DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS suppliers_owner_all ON suppliers;

ALTER TABLE payment_receipts DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payment_receipts_owner_all ON payment_receipts;

ALTER TABLE courier_payment_allocations DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS courier_payment_allocations_owner_all ON courier_payment_allocations;

ALTER TABLE courier_payments DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS courier_payments_owner_all ON courier_payments;

ALTER TABLE commission_payouts DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS commission_payouts_owner_all ON commission_payouts;

ALTER TABLE transactions DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS transactions_owner_all ON transactions;

ALTER TABLE money_accounts DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS money_accounts_owner_all ON money_accounts;

ALTER TABLE monthly_exchange_rates DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS monthly_exchange_rates_owner_all ON monthly_exchange_rates;

ALTER TABLE store_config DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS store_config_owner_all ON store_config;

-- Section 5. Purchases -----------------------------------------------

ALTER TABLE purchase_order_items DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS purchase_order_items_owner_all ON purchase_order_items;

ALTER TABLE purchase_orders DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS purchase_orders_owner_all ON purchase_orders;

-- Section 4. Inventory -----------------------------------------------

ALTER TABLE stock_movements DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stock_movements_owner_all ON stock_movements;
DROP POLICY IF EXISTS stock_movements_admin_roles_read ON stock_movements;

ALTER TABLE inventory_lots DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inventory_lots_owner_all ON inventory_lots;
DROP POLICY IF EXISTS inventory_lots_admin_roles_read ON inventory_lots;

-- Section 3. Sales chain ---------------------------------------------

ALTER TABLE sale_commissions DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sale_commissions_owner_all ON sale_commissions;
DROP POLICY IF EXISTS sale_commissions_seller_read_own ON sale_commissions;

ALTER TABLE sale_lot_consumption DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sale_lot_consumption_owner_all ON sale_lot_consumption;
DROP POLICY IF EXISTS sale_lot_consumption_seller_read_own ON sale_lot_consumption;

ALTER TABLE sale_payments DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sale_payments_owner_all ON sale_payments;
DROP POLICY IF EXISTS sale_payments_seller_read_own ON sale_payments;

ALTER TABLE sale_items DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sale_items_owner_all ON sale_items;
DROP POLICY IF EXISTS sale_items_seller_read_own ON sale_items;

ALTER TABLE sales DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sales_owner_all ON sales;
DROP POLICY IF EXISTS sales_seller_read_own ON sales;

-- Section 2. profiles ------------------------------------------------

ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS profiles_self_read ON profiles;
DROP POLICY IF EXISTS profiles_owner_read_all ON profiles;
DROP POLICY IF EXISTS profiles_seller_read_customers ON profiles;
DROP POLICY IF EXISTS profiles_owner_insert ON profiles;
DROP POLICY IF EXISTS profiles_owner_update ON profiles;
DROP POLICY IF EXISTS profiles_owner_delete ON profiles;

-- Section 1. Helper function -----------------------------------------

DROP FUNCTION IF EXISTS public.auth_role();

COMMIT;
