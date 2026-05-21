-- Round 23: record_commission_payout RPC
--
-- Records a commission payout to a seller/distributor and marks the
-- named commissions as paid, atomically. Owner/admin only.
--
-- DESIGN NOTE (Path A): this function deliberately does NOT touch
-- money_accounts.balance_cents. In this system, account balances move
-- only via the (still-unbuilt) transactions ledger - see roadmap #24.
-- Courier payments behave the same way (create_courier_payment records
-- the payment but leaves the balance alone). When the accounting module
-- is built, commission payouts get posted to the ledger together with
-- purchases and courier payments, keeping everything consistent and
-- avoiding double-counting. money_account_id is captured here for that
-- future work.
--
-- Mirrors adjust_stock's permission gate and the "lock with
-- PERFORM ... FOR UPDATE, then aggregate separately" pattern (FOR UPDATE
-- cannot be combined with an aggregate).
--
-- Payload shape:
--   {
--     "earner_id":        uuid,
--     "money_account_id": uuid,
--     "commission_ids":   [uuid, ...],   -- the exact lines being paid
--     "period_start":     "YYYY-MM-DD"   -- optional
--     "period_end":       "YYYY-MM-DD"   -- optional
--     "notes":            text           -- optional
--   }

CREATE OR REPLACE FUNCTION public.record_commission_payout(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_earner_id       uuid := (p_payload->>'earner_id')::uuid;
  v_money_account   uuid := (p_payload->>'money_account_id')::uuid;
  v_period_start    date := nullif(p_payload->>'period_start','')::date;
  v_period_end      date := nullif(p_payload->>'period_end','')::date;
  v_notes           text := nullif(btrim(p_payload->>'notes'), '');

  v_user_id         uuid := auth.uid();
  v_user_role       user_role;
  v_user_profile_id uuid;

  v_ids        uuid[];
  v_requested  int;
  v_matched    int;
  v_total      bigint;
  v_account_ok boolean;
  v_payout_id  uuid;
BEGIN
  -- 0. Permission gate (owner/admin only)
  SELECT id, role INTO v_user_profile_id, v_user_role
    FROM profiles WHERE auth_user_id = v_user_id;
  IF v_user_role IS NULL OR v_user_role NOT IN ('owner','admin') THEN
    RAISE EXCEPTION 'permission denied: only owner/admin can record payouts'
      USING ERRCODE = '42501';
  END IF;

  -- 1. Validation
  IF v_earner_id IS NULL THEN
    RAISE EXCEPTION 'earner_id is required' USING ERRCODE = '22023';
  END IF;
  IF v_money_account IS NULL THEN
    RAISE EXCEPTION 'money_account_id is required' USING ERRCODE = '22023';
  END IF;

  SELECT exists(select 1 from money_accounts where id = v_money_account)
    INTO v_account_ok;
  IF NOT v_account_ok THEN
    RAISE EXCEPTION 'money_account % not found', v_money_account USING ERRCODE = '22023';
  END IF;

  -- Distinct commission ids requested.
  SELECT array_agg(DISTINCT (e)::uuid)
    INTO v_ids
    FROM jsonb_array_elements_text(p_payload->'commission_ids') AS e;
  IF v_ids IS NULL OR array_length(v_ids, 1) = 0 THEN
    RAISE EXCEPTION 'commission_ids is required' USING ERRCODE = '22023';
  END IF;
  v_requested := array_length(v_ids, 1);

  -- 2. Lock the target rows (FOR UPDATE can't combine with an aggregate,
  --    so lock first, then sum separately).
  PERFORM 1 FROM sale_commissions
    WHERE id = ANY(v_ids)
      AND earner_id = v_earner_id
      AND status = 'pending'
    FOR UPDATE;

  SELECT count(*), coalesce(sum(amount_cents), 0)
    INTO v_matched, v_total
    FROM sale_commissions
    WHERE id = ANY(v_ids)
      AND earner_id = v_earner_id
      AND status = 'pending';

  -- Every requested id must be a still-pending commission for THIS earner.
  IF v_matched <> v_requested THEN
    RAISE EXCEPTION 'commission set invalid: % of % requested are pending and belong to this earner (some may be already paid, voided, or for someone else)',
      v_matched, v_requested USING ERRCODE = '22023';
  END IF;
  IF v_total <= 0 THEN
    RAISE EXCEPTION 'nothing to pay (total is zero)' USING ERRCODE = '22023';
  END IF;

  -- 3. Create the payout record (balances intentionally untouched).
  INSERT INTO commission_payouts (
    earner_id, total_cents, money_account_id, paid_at,
    period_start, period_end, notes
  ) VALUES (
    v_earner_id, v_total, v_money_account, now(),
    v_period_start, v_period_end, v_notes
  )
  RETURNING id INTO v_payout_id;

  -- 4. Mark those commissions paid and link them to the payout.
  UPDATE sale_commissions
    SET status = 'paid', payout_id = v_payout_id
    WHERE id = ANY(v_ids)
      AND earner_id = v_earner_id
      AND status = 'pending';

  RETURN jsonb_build_object(
    'ok', true,
    'payout_id', v_payout_id,
    'total_cents', v_total,
    'commissions_paid', v_matched
  );
END;
$function$;
