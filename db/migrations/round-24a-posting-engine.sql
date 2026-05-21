-- Round 24a: accounting ledger posting engine
--
-- The foundation of the live accounting module. Two atomic, owner/admin-only
-- primitives that keep the transactions ledger and money_accounts.balance_cents
-- perfectly in sync. Everything else (the manual entry tool, and later the
-- automatic posting from sales / purchases / courier payments / commission
-- payouts) is built on these two functions.
--
-- SIGN CONVENTION: amount_cents is signed. Income/inflow = positive, expense/
-- outflow = negative. The balance update is therefore always simply
-- balance_cents := balance_cents + amount_cents, so there is no separate
-- "direction" flag to get wrong.
--
-- DESIGN NOTE: from Round 24 on, the ledger DRIVES balances going forward
-- (the legacy opening-balance gap is accepted and corrected manually by the
-- owner via the manual entry tool; we deliberately do not try to reconcile
-- the migration-day snapshot in code).

-- post_transaction: insert one ledger row and move the account balance by the
-- same signed amount, atomically. Any source_* link makes it non-manual;
-- with no source it is auto-tagged is_manual = true.
CREATE OR REPLACE FUNCTION public.post_transaction(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_account_id  uuid    := (p_payload->>'money_account_id')::uuid;
  v_category_id uuid    := (p_payload->>'category_id')::uuid;
  v_amount      bigint  := (p_payload->>'amount_cents')::bigint;
  v_scope       account_scope := (p_payload->>'scope')::account_scope;
  v_occurred    timestamptz   := coalesce(nullif(p_payload->>'occurred_at','')::timestamptz, now());
  v_desc        text    := nullif(btrim(p_payload->>'description'), '');

  v_sale            uuid := nullif(p_payload->>'source_sale_id','')::uuid;
  v_sale_payment    uuid := nullif(p_payload->>'source_sale_payment_id','')::uuid;
  v_purchase        uuid := nullif(p_payload->>'source_purchase_order_id','')::uuid;
  v_courier         uuid := nullif(p_payload->>'source_courier_payment_id','')::uuid;
  v_commission      uuid := nullif(p_payload->>'source_commission_payout_id','')::uuid;
  v_transfer        uuid := nullif(p_payload->>'source_transfer_id','')::uuid;

  v_user_id         uuid := auth.uid();
  v_user_role       user_role;
  v_user_profile_id uuid;
  v_is_manual       boolean;
  v_new_id          uuid;
BEGIN
  SELECT id, role INTO v_user_profile_id, v_user_role
    FROM profiles WHERE auth_user_id = v_user_id;
  IF v_user_role IS NULL OR v_user_role NOT IN ('owner','admin') THEN
    RAISE EXCEPTION 'permission denied: only owner/admin can post transactions'
      USING ERRCODE = '42501';
  END IF;

  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'money_account_id is required' USING ERRCODE = '22023';
  END IF;
  IF v_category_id IS NULL THEN
    RAISE EXCEPTION 'category_id is required' USING ERRCODE = '22023';
  END IF;
  IF v_amount IS NULL OR v_amount = 0 THEN
    RAISE EXCEPTION 'amount_cents is required and cannot be zero' USING ERRCODE = '22023';
  END IF;
  IF v_scope IS NULL THEN
    RAISE EXCEPTION 'scope is required' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM money_accounts WHERE id = v_account_id) THEN
    RAISE EXCEPTION 'money_account % not found', v_account_id USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM account_categories WHERE id = v_category_id) THEN
    RAISE EXCEPTION 'account_category % not found', v_category_id USING ERRCODE = '22023';
  END IF;

  v_is_manual := (v_sale IS NULL AND v_sale_payment IS NULL AND v_purchase IS NULL
                  AND v_courier IS NULL AND v_commission IS NULL AND v_transfer IS NULL);

  PERFORM 1 FROM money_accounts WHERE id = v_account_id FOR UPDATE;

  INSERT INTO transactions (
    money_account_id, category_id, amount_cents, scope, occurred_at, description,
    source_sale_id, source_sale_payment_id, source_purchase_order_id,
    source_courier_payment_id, source_commission_payout_id, source_transfer_id,
    is_manual, created_by
  ) VALUES (
    v_account_id, v_category_id, v_amount, v_scope, v_occurred, v_desc,
    v_sale, v_sale_payment, v_purchase,
    v_courier, v_commission, v_transfer,
    v_is_manual, v_user_profile_id
  )
  RETURNING id INTO v_new_id;

  UPDATE money_accounts
    SET balance_cents = balance_cents + v_amount
    WHERE id = v_account_id;

  RETURN jsonb_build_object('ok', true, 'transaction_id', v_new_id, 'amount_cents', v_amount);
END;
$function$;

-- reverse_transaction: undo one ledger row - add back the opposite amount to
-- the account balance, then delete the row. Atomic. Used by "delete" in the
-- manual tool, and by edit (reverse-then-post) so the balance can never drift.
CREATE OR REPLACE FUNCTION public.reverse_transaction(p_transaction_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id   uuid := auth.uid();
  v_user_role user_role;
  v_account   uuid;
  v_amount    bigint;
BEGIN
  SELECT role INTO v_user_role FROM profiles WHERE auth_user_id = v_user_id;
  IF v_user_role IS NULL OR v_user_role NOT IN ('owner','admin') THEN
    RAISE EXCEPTION 'permission denied: only owner/admin can reverse transactions'
      USING ERRCODE = '42501';
  END IF;

  SELECT money_account_id, amount_cents INTO v_account, v_amount
    FROM transactions WHERE id = p_transaction_id FOR UPDATE;
  IF v_account IS NULL THEN
    RAISE EXCEPTION 'transaction % not found', p_transaction_id USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM money_accounts WHERE id = v_account FOR UPDATE;
  UPDATE money_accounts
    SET balance_cents = balance_cents - v_amount
    WHERE id = v_account;

  DELETE FROM transactions WHERE id = p_transaction_id;

  RETURN jsonb_build_object('ok', true, 'reversed_transaction', p_transaction_id, 'amount_cents', v_amount);
END;
$function$;
