-- ============================================================================
-- Round 75a: EUR-aware supplier payments.
--
-- GOAL (owner): pay an AliExpress-style USD-priced purchase order from a EUR
-- bank account (Bank C24). Until now add_supplier_payment only handled DOP and
-- USD paying accounts; a EUR account fell into the "else => pesos" branch and
-- deducted the typed peso number AS euros, which is wrong.
--
-- HOW IT WORKS NOW (no behaviour change for DOP/USD accounts)
--   p_dop_amount    : pesos that this payment represents (single source of truth
--                     for both the product's DOP landed cost AND the USD coverage
--                     that decides when the order flips to paid_supplier).
--   p_exchange_rate : DOP-per-USD  (as today) -> USD covered = pesos / this.
--   p_eur_rate      : NEW, optional. DOP-per-EUR. ONLY used when the paying
--                     account's currency is EUR, to convert the peso figure back
--                     into the euros that actually left the account:
--                         euros_deducted = pesos / p_eur_rate
--                     For DOP/USD accounts it is ignored entirely.
--
-- The dialog computes the peso figure as  (EUR paid) x (DOP-per-EUR)  and sends
-- it as p_dop_amount, so the owner just types EUR paid + the two monthly rates
-- (auto-filled from monthly_exchange_rates). Example:
--   EUR paid 19.38, DOP/EUR 70, DOP/USD 62
--   -> p_dop_amount = 1356.6  (peso landed cost)
--   -> euros deducted = 1356.6 / 70 = 19.38   (exact, leaves C24)
--   -> USD covered    = 1356.6 / 62 = 21.88   (drives paid status)
--
-- WHAT'S CHANGED: only the per-currency deduction branch (added EUR) + one new
-- optional trailing parameter. Signature stays backward compatible because the
-- new parameter has a DEFAULT, so existing callers (DOP/USD) keep working.
--
-- SAFETY: CREATE OR REPLACE, additive parameter. Test with BEGIN/ROLLBACK.
-- ============================================================================

create or replace function public.add_supplier_payment(
  p_purchase_order_id           uuid,
  p_dop_amount                  numeric,        -- pesos this payment represents
  p_exchange_rate               numeric,        -- DOP-per-USD (covers the order)
  p_official_rate_at_payment    numeric,
  p_supplier_payment_account_id uuid,
  p_paid_at                     timestamptz default now(),
  p_category_id                 uuid default null,
  p_eur_rate                    numeric default null   -- NEW: DOP-per-EUR (EUR accounts only)
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_role            user_role;
  v_profile_id      uuid;
  v_status          purchase_status;
  v_usd_total       numeric(12,2);
  v_acct_currency   text;
  v_supplier_name   text;
  v_usd_this        numeric(14,4);
  v_usd_existing    numeric(14,4);
  v_usd_total_cov   numeric(14,4);
  v_usd_remaining   numeric(14,4);
  v_post_amount     numeric;
  v_txn             jsonb;
  v_txn_id          uuid;
  v_payment_id      uuid;
  v_total_dop       numeric(14,2);
  v_blended_rate    numeric(14,6);
  v_fully_paid      boolean;
begin
  -- owner/admin gate
  select id, role into v_profile_id, v_role
    from public.profiles where auth_user_id = auth.uid();
  if v_role is null or v_role not in ('owner','admin') then
    raise exception 'permission denied: only owner/admin can record supplier payments'
      using errcode = '42501';
  end if;

  -- input validation
  if p_dop_amount is null or p_dop_amount <= 0 then
    raise exception 'payment amount (pesos) must be > 0 (got %)', p_dop_amount;
  end if;
  if p_exchange_rate is null or p_exchange_rate <= 0 then
    raise exception 'exchange_rate must be > 0 (got %)', p_exchange_rate;
  end if;
  if p_category_id is null then
    raise exception 'category_id is required to record a supplier payment';
  end if;

  -- lock the order; partial payments are only accepted while pending
  select status, usd_total
    into v_status, v_usd_total
    from public.purchase_orders
    where id = p_purchase_order_id
    for update;
  if not found then
    raise exception 'purchase order % not found', p_purchase_order_id;
  end if;
  if v_status <> 'pending' then
    raise exception 'cannot add payment: order % is %, part-payments are only accepted while pending',
                    p_purchase_order_id, v_status;
  end if;
  if coalesce(v_usd_total, 0) <= 0 then
    raise exception 'purchase order % has no usd_total; cannot accept a payment', p_purchase_order_id;
  end if;

  -- dollars this payment covers, and the running totals
  v_usd_this := round(p_dop_amount / p_exchange_rate, 4);
  select coalesce(sum(usd_covered), 0) into v_usd_existing
    from public.purchase_order_payments
    where purchase_order_id = p_purchase_order_id;
  v_usd_total_cov := v_usd_existing + v_usd_this;
  v_usd_remaining := round(v_usd_total - v_usd_total_cov, 2);
  v_fully_paid    := v_usd_total_cov >= v_usd_total - 0.005;

  -- supplier name (for the ledger description) + paying account currency
  select s.name into v_supplier_name
    from public.purchase_orders po
    join public.suppliers s on s.id = po.supplier_id
    where po.id = p_purchase_order_id;

  select upper(coalesce(currency, 'DOP')) into v_acct_currency
    from public.money_accounts
    where id = p_supplier_payment_account_id;
  if not found then
    raise exception 'money account % not found', p_supplier_payment_account_id;
  end if;

  -- amount to deduct, in the paying account's own currency
  if v_acct_currency = 'USD' then
    v_post_amount := p_dop_amount / p_exchange_rate;        -- dollar value
  elsif v_acct_currency = 'EUR' then
    if p_eur_rate is null or p_eur_rate <= 0 then
      raise exception 'a DOP-per-EUR rate is required to pay from a EUR account (got %)', p_eur_rate;
    end if;
    v_post_amount := p_dop_amount / p_eur_rate;             -- euro value that left the account
  else
    v_post_amount := p_dop_amount;                          -- pesos
  end if;

  -- record the part-payment row (dop_amount_cents stays the peso figure -> landed cost)
  insert into public.purchase_order_payments(
    purchase_order_id, money_account_id, category_id,
    dop_amount_cents, exchange_rate, official_rate_at_payment,
    usd_covered, paid_at, created_by
  ) values (
    p_purchase_order_id, p_supplier_payment_account_id, p_category_id,
    round(p_dop_amount * 100), p_exchange_rate, p_official_rate_at_payment,
    v_usd_this, p_paid_at, v_profile_id
  ) returning id into v_payment_id;

  -- post this part-payment to the live ledger, linked to the order
  -- (amount_cents is in the paying account's OWN currency: pesos / dollars / euros)
  v_txn := public.post_transaction(jsonb_build_object(
    'money_account_id',         p_supplier_payment_account_id,
    'category_id',              p_category_id,
    'amount_cents',             -round(v_post_amount * 100),
    'scope',                    'business',
    'occurred_at',              p_paid_at,
    'description',              'Purchase (part) — ' || coalesce(v_supplier_name, ''),
    'source_purchase_order_id', p_purchase_order_id
  ));
  v_txn_id := (v_txn->>'transaction_id')::uuid;

  update public.purchase_order_payments
    set transaction_id = v_txn_id
    where id = v_payment_id;

  -- finalize when the dollar total is covered
  if v_fully_paid then
    select coalesce(sum(dop_amount_cents), 0) / 100.0 into v_total_dop
      from public.purchase_order_payments
      where purchase_order_id = p_purchase_order_id;
    v_blended_rate := round(v_total_dop / v_usd_total, 6);

    -- header + per-line landed cost + status -> paid_supplier, NO ledger post
    perform public._allocate_supplier_payment(
      p_purchase_order_id,
      v_total_dop,
      v_blended_rate,
      p_official_rate_at_payment,
      p_supplier_payment_account_id,
      p_paid_at,
      null                       -- category NULL => skip ledger post (already posted per part)
    );
  end if;

  return jsonb_build_object(
    'ok',               true,
    'payment_id',       v_payment_id,
    'transaction_id',   v_txn_id,
    'usd_covered_total',v_usd_total_cov,
    'usd_remaining',    greatest(v_usd_remaining, 0),
    'fully_paid',       v_fully_paid
  );
end;
$function$;

-- ============================================================================
-- End round 75a.
-- ============================================================================
