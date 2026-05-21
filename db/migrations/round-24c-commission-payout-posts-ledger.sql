-- Round 24c: commission payouts post to the ledger (Stage 2, event 1)
--
-- Extends record_commission_payout so that, in addition to creating the
-- commission_payouts row and flipping the named commissions to paid, it now
-- ALSO posts a commission EXPENSE to the ledger via post_transaction - which
-- moves the money account balance too. This is the first of the automatic
-- syncing events for the live accounting module (#24).
--
-- The expense category is chosen by the user in the Record payment dialog
-- (new required p_payload key 'category_id'); a payout is always an expense.
-- The posted transaction is linked via source_commission_payout_id, so it
-- shows as a non-manual ("AUTO") entry in the ledger.
--
-- Account balances: from here on the ledger DRIVES balances (post_transaction
-- updates balance_cents). The legacy opening-balance gap is accepted and
-- corrected manually by the owner.

CREATE OR REPLACE FUNCTION public.record_commission_payout(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_earner_id       uuid := (p_payload->>'earner_id')::uuid;
  v_money_account   uuid := (p_payload->>'money_account_id')::uuid;
  v_category_id     uuid := (p_payload->>'category_id')::uuid;
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
  v_earner_name text;
  v_post        jsonb;
BEGIN
  SELECT id, role INTO v_user_profile_id, v_user_role
    FROM profiles WHERE auth_user_id = v_user_id;
  IF v_user_role IS NULL OR v_user_role NOT IN ('owner','admin') THEN
    RAISE EXCEPTION 'permission denied: only owner/admin can record payouts'
      USING ERRCODE = '42501';
  END IF;

  IF v_earner_id IS NULL THEN
    RAISE EXCEPTION 'earner_id is required' USING ERRCODE = '22023';
  END IF;
  IF v_money_account IS NULL THEN
    RAISE EXCEPTION 'money_account_id is required' USING ERRCODE = '22023';
  END IF;
  IF v_category_id IS NULL THEN
    RAISE EXCEPTION 'category_id is required (pick a commission expense category)' USING ERRCODE = '22023';
  END IF;

  SELECT exists(select 1 from money_accounts where id = v_money_account)
    INTO v_account_ok;
  IF NOT v_account_ok THEN
    RAISE EXCEPTION 'money_account % not found', v_money_account USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(DISTINCT (e)::uuid)
    INTO v_ids
    FROM jsonb_array_elements_text(p_payload->'commission_ids') AS e;
  IF v_ids IS NULL OR array_length(v_ids, 1) = 0 THEN
    RAISE EXCEPTION 'commission_ids is required' USING ERRCODE = '22023';
  END IF;
  v_requested := array_length(v_ids, 1);

  PERFORM 1 FROM sale_commissions
    WHERE id = ANY(v_ids) AND earner_id = v_earner_id AND status = 'pending'
    FOR UPDATE;

  SELECT count(*), coalesce(sum(amount_cents), 0)
    INTO v_matched, v_total
    FROM sale_commissions
    WHERE id = ANY(v_ids) AND earner_id = v_earner_id AND status = 'pending';

  IF v_matched <> v_requested THEN
    RAISE EXCEPTION 'commission set invalid: % of % requested are pending and belong to this earner (some may be already paid, voided, or for someone else)',
      v_matched, v_requested USING ERRCODE = '22023';
  END IF;
  IF v_total <= 0 THEN
    RAISE EXCEPTION 'nothing to pay (total is zero)' USING ERRCODE = '22023';
  END IF;

  INSERT INTO commission_payouts (
    earner_id, total_cents, money_account_id, paid_at,
    period_start, period_end, notes
  ) VALUES (
    v_earner_id, v_total, v_money_account, now(),
    v_period_start, v_period_end, v_notes
  )
  RETURNING id INTO v_payout_id;

  UPDATE sale_commissions
    SET status = 'paid', payout_id = v_payout_id
    WHERE id = ANY(v_ids) AND earner_id = v_earner_id AND status = 'pending';

  -- Post the expense to the ledger (negative) via the shared engine, which
  -- also moves the account balance. Linked to the payout -> tagged AUTO.
  SELECT full_name INTO v_earner_name FROM profiles WHERE id = v_earner_id;

  SELECT public.post_transaction(jsonb_build_object(
    'money_account_id',            v_money_account,
    'category_id',                 v_category_id,
    'amount_cents',                -v_total,
    'scope',                       'business',
    'description',                 'Commission payout — ' || coalesce(v_earner_name, ''),
    'source_commission_payout_id', v_payout_id
  )) INTO v_post;

  RETURN jsonb_build_object(
    'ok', true,
    'payout_id', v_payout_id,
    'total_cents', v_total,
    'commissions_paid', v_matched,
    'transaction_id', v_post->>'transaction_id'
  );
END;
$function$;
