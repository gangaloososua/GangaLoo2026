-- =====================================================================
-- Round 11.10 - Row Level Security (RLS)
-- =====================================================================
-- Companion to docs/rbac.md. Mirrors the RBAC matrix at the DB layer.
--
-- Apply via Supabase SQL editor. Wrapped in a single transaction so a
-- syntax error mid-script rolls the whole thing back.
--
-- All sections are idempotent: helper uses CREATE OR REPLACE, RLS
-- enable is a no-op if already on, policies are DROP IF EXISTS first.
--
-- IMPORTANT: lib/supabase/admin.ts uses the service-role key, which
-- bypasses RLS entirely. RLS therefore defends against:
--   (a) direct client queries from a future storefront or mobile app
--   (b) accidental use of the ssr/anon client where admin was meant
--   (c) future API surface area outside this codebase
-- It does NOT defend against bugs inside this codebase's server
-- actions. Those rely on require* guards in lib/auth/guard.ts.
--
-- Rollback: see round-11-rls-rollback.sql.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- Section 1. Helper function: auth_role()
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.auth_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role::text FROM profiles WHERE auth_user_id = auth.uid()
$$;

GRANT EXECUTE ON FUNCTION public.auth_role() TO authenticated;

-- ---------------------------------------------------------------------
-- Section 2. profiles
-- ---------------------------------------------------------------------

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_self_read ON profiles;
CREATE POLICY profiles_self_read ON profiles
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

DROP POLICY IF EXISTS profiles_owner_read_all ON profiles;
CREATE POLICY profiles_owner_read_all ON profiles
  FOR SELECT TO authenticated
  USING (auth_role() IN ('owner','admin'));

DROP POLICY IF EXISTS profiles_seller_read_customers ON profiles;
CREATE POLICY profiles_seller_read_customers ON profiles
  FOR SELECT TO authenticated
  USING (
    auth_role() IN ('seller','distributor')
    AND role = 'customer'
  );

DROP POLICY IF EXISTS profiles_owner_insert ON profiles;
CREATE POLICY profiles_owner_insert ON profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth_role() IN ('owner','admin'));

DROP POLICY IF EXISTS profiles_owner_update ON profiles;
CREATE POLICY profiles_owner_update ON profiles
  FOR UPDATE TO authenticated
  USING (auth_role() IN ('owner','admin'))
  WITH CHECK (auth_role() IN ('owner','admin'));

DROP POLICY IF EXISTS profiles_owner_delete ON profiles;
CREATE POLICY profiles_owner_delete ON profiles
  FOR DELETE TO authenticated
  USING (auth_role() IN ('owner','admin'));

-- ---------------------------------------------------------------------
-- Section 3. Sales chain (sales + 4 child tables)
-- ---------------------------------------------------------------------
-- FK structure:
--   sales(id) <- sale_items(sale_id)         <- sale_lot_consumption(sale_item_id)
--                                            <- sale_commissions(sale_item_id)
--             <- sale_payments(sale_id)
--
-- Writes (INSERT/UPDATE/DELETE): owner only. POS writes go through
-- confirm_pos_sale which is SECURITY DEFINER and bypasses RLS, so
-- sellers can still ring up sales. Direct ssr-client writes from
-- non-owner code paths are blocked, which is the intended behaviour.
--
-- Reads (SELECT): owner all. Seller/distributor scoped to rows whose
-- root sales row has seller_id matching caller's profile id (resolved
-- via profiles.auth_user_id = auth.uid()). sale_lot_consumption and
-- sale_commissions take a two-hop join: child -> sale_items -> sales.
-- ---------------------------------------------------------------------

-- sales --------------------------------------------------------------

ALTER TABLE sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sales_owner_all ON sales;
CREATE POLICY sales_owner_all ON sales
  FOR ALL TO authenticated
  USING (auth_role() IN ('owner','admin'))
  WITH CHECK (auth_role() IN ('owner','admin'));

DROP POLICY IF EXISTS sales_seller_read_own ON sales;
CREATE POLICY sales_seller_read_own ON sales
  FOR SELECT TO authenticated
  USING (
    auth_role() IN ('seller','distributor')
    AND seller_id IN (
      SELECT id FROM profiles WHERE auth_user_id = auth.uid()
    )
  );

-- sale_items (one-hop: sale_items.sale_id -> sales.id) ---------------

ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sale_items_owner_all ON sale_items;
CREATE POLICY sale_items_owner_all ON sale_items
  FOR ALL TO authenticated
  USING (auth_role() IN ('owner','admin'))
  WITH CHECK (auth_role() IN ('owner','admin'));

DROP POLICY IF EXISTS sale_items_seller_read_own ON sale_items;
CREATE POLICY sale_items_seller_read_own ON sale_items
  FOR SELECT TO authenticated
  USING (
    auth_role() IN ('seller','distributor')
    AND sale_id IN (
      SELECT s.id FROM sales s
      JOIN profiles p ON p.id = s.seller_id
      WHERE p.auth_user_id = auth.uid()
    )
  );

-- sale_payments (one-hop: sale_payments.sale_id -> sales.id) ---------

ALTER TABLE sale_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sale_payments_owner_all ON sale_payments;
CREATE POLICY sale_payments_owner_all ON sale_payments
  FOR ALL TO authenticated
  USING (auth_role() IN ('owner','admin'))
  WITH CHECK (auth_role() IN ('owner','admin'));

DROP POLICY IF EXISTS sale_payments_seller_read_own ON sale_payments;
CREATE POLICY sale_payments_seller_read_own ON sale_payments
  FOR SELECT TO authenticated
  USING (
    auth_role() IN ('seller','distributor')
    AND sale_id IN (
      SELECT s.id FROM sales s
      JOIN profiles p ON p.id = s.seller_id
      WHERE p.auth_user_id = auth.uid()
    )
  );

-- sale_lot_consumption (two-hop: -> sale_items -> sales) -------------

ALTER TABLE sale_lot_consumption ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sale_lot_consumption_owner_all ON sale_lot_consumption;
CREATE POLICY sale_lot_consumption_owner_all ON sale_lot_consumption
  FOR ALL TO authenticated
  USING (auth_role() IN ('owner','admin'))
  WITH CHECK (auth_role() IN ('owner','admin'));

DROP POLICY IF EXISTS sale_lot_consumption_seller_read_own ON sale_lot_consumption;
CREATE POLICY sale_lot_consumption_seller_read_own ON sale_lot_consumption
  FOR SELECT TO authenticated
  USING (
    auth_role() IN ('seller','distributor')
    AND sale_item_id IN (
      SELECT si.id
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      JOIN profiles p ON p.id = s.seller_id
      WHERE p.auth_user_id = auth.uid()
    )
  );

-- sale_commissions (two-hop: -> sale_items -> sales) -----------------

ALTER TABLE sale_commissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sale_commissions_owner_all ON sale_commissions;
CREATE POLICY sale_commissions_owner_all ON sale_commissions
  FOR ALL TO authenticated
  USING (auth_role() IN ('owner','admin'))
  WITH CHECK (auth_role() IN ('owner','admin'));

DROP POLICY IF EXISTS sale_commissions_seller_read_own ON sale_commissions;
CREATE POLICY sale_commissions_seller_read_own ON sale_commissions
  FOR SELECT TO authenticated
  USING (
    auth_role() IN ('seller','distributor')
    AND sale_item_id IN (
      SELECT si.id
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      JOIN profiles p ON p.id = s.seller_id
      WHERE p.auth_user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------
-- Section 4. Inventory (inventory_lots, stock_movements)
-- ---------------------------------------------------------------------
-- Writes: owner only. confirm_pos_sale is SECURITY DEFINER and writes
-- to inventory_lots / stock_movements internally; it bypasses RLS.
--
-- Reads: owner all, plus seller/distributor read (per spec, sellers
-- can view stock movements and inventory but cannot create them).
-- ---------------------------------------------------------------------

ALTER TABLE inventory_lots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inventory_lots_owner_all ON inventory_lots;
CREATE POLICY inventory_lots_owner_all ON inventory_lots
  FOR ALL TO authenticated
  USING (auth_role() IN ('owner','admin'))
  WITH CHECK (auth_role() IN ('owner','admin'));

DROP POLICY IF EXISTS inventory_lots_admin_roles_read ON inventory_lots;
CREATE POLICY inventory_lots_admin_roles_read ON inventory_lots
  FOR SELECT TO authenticated
  USING (auth_role() IN ('owner','admin','seller','distributor'));

ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stock_movements_owner_all ON stock_movements;
CREATE POLICY stock_movements_owner_all ON stock_movements
  FOR ALL TO authenticated
  USING (auth_role() IN ('owner','admin'))
  WITH CHECK (auth_role() IN ('owner','admin'));

DROP POLICY IF EXISTS stock_movements_admin_roles_read ON stock_movements;
CREATE POLICY stock_movements_admin_roles_read ON stock_movements
  FOR SELECT TO authenticated
  USING (auth_role() IN ('owner','admin','seller','distributor'));

-- ---------------------------------------------------------------------
-- Section 5. Purchases (purchase_orders, purchase_order_items)
-- ---------------------------------------------------------------------
-- Owner-only across the board per RBAC spec. Sellers and distributors
-- have no UI for purchases and no need to read them at the DB layer.
-- ---------------------------------------------------------------------

ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS purchase_orders_owner_all ON purchase_orders;
CREATE POLICY purchase_orders_owner_all ON purchase_orders
  FOR ALL TO authenticated
  USING (auth_role() IN ('owner','admin'))
  WITH CHECK (auth_role() IN ('owner','admin'));

ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS purchase_order_items_owner_all ON purchase_order_items;
CREATE POLICY purchase_order_items_owner_all ON purchase_order_items
  FOR ALL TO authenticated
  USING (auth_role() IN ('owner','admin'))
  WITH CHECK (auth_role() IN ('owner','admin'));

-- ---------------------------------------------------------------------
-- Section 6. Finance / config (9 tables, all owner-only)
-- ---------------------------------------------------------------------
-- store_config, monthly_exchange_rates: settings tables, owner-only.
-- money_accounts, transactions: cash drawer / ledger, owner-only.
-- commission_payouts: seller payouts, owner-only.
-- courier_payments, courier_payment_allocations: purchase-side
--   shipping cost tracking, owner-only.
-- payment_receipts: payment proof attachments, owner-only.
-- suppliers: People > Suppliers tab is owner-only per RBAC spec.
-- ---------------------------------------------------------------------

ALTER TABLE store_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS store_config_owner_all ON store_config;
CREATE POLICY store_config_owner_all ON store_config
  FOR ALL TO authenticated
  USING (auth_role() IN ('owner','admin'))
  WITH CHECK (auth_role() IN ('owner','admin'));

ALTER TABLE monthly_exchange_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS monthly_exchange_rates_owner_all ON monthly_exchange_rates;
CREATE POLICY monthly_exchange_rates_owner_all ON monthly_exchange_rates
  FOR ALL TO authenticated
  USING (auth_role() IN ('owner','admin'))
  WITH CHECK (auth_role() IN ('owner','admin'));

ALTER TABLE money_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS money_accounts_owner_all ON money_accounts;
CREATE POLICY money_accounts_owner_all ON money_accounts
  FOR ALL TO authenticated
  USING (auth_role() IN ('owner','admin'))
  WITH CHECK (auth_role() IN ('owner','admin'));

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS transactions_owner_all ON transactions;
CREATE POLICY transactions_owner_all ON transactions
  FOR ALL TO authenticated
  USING (auth_role() IN ('owner','admin'))
  WITH CHECK (auth_role() IN ('owner','admin'));

ALTER TABLE commission_payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS commission_payouts_owner_all ON commission_payouts;
CREATE POLICY commission_payouts_owner_all ON commission_payouts
  FOR ALL TO authenticated
  USING (auth_role() IN ('owner','admin'))
  WITH CHECK (auth_role() IN ('owner','admin'));

ALTER TABLE courier_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS courier_payments_owner_all ON courier_payments;
CREATE POLICY courier_payments_owner_all ON courier_payments
  FOR ALL TO authenticated
  USING (auth_role() IN ('owner','admin'))
  WITH CHECK (auth_role() IN ('owner','admin'));

ALTER TABLE courier_payment_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS courier_payment_allocations_owner_all ON courier_payment_allocations;
CREATE POLICY courier_payment_allocations_owner_all ON courier_payment_allocations
  FOR ALL TO authenticated
  USING (auth_role() IN ('owner','admin'))
  WITH CHECK (auth_role() IN ('owner','admin'));

ALTER TABLE payment_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_receipts_owner_all ON payment_receipts;
CREATE POLICY payment_receipts_owner_all ON payment_receipts
  FOR ALL TO authenticated
  USING (auth_role() IN ('owner','admin'))
  WITH CHECK (auth_role() IN ('owner','admin'));

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS suppliers_owner_all ON suppliers;
CREATE POLICY suppliers_owner_all ON suppliers
  FOR ALL TO authenticated
  USING (auth_role() IN ('owner','admin'))
  WITH CHECK (auth_role() IN ('owner','admin'));

COMMIT;
