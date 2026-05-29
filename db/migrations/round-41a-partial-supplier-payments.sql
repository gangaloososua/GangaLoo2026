-- ============================================================================
-- Round 41a: Partial supplier payments ("pay an order in parts").
--
-- GOAL (owner's words): keep paying exactly like today (pick account, enter
-- pesos + rate), but allow MULTIPLE payments toward ONE order. While the
-- payments don't yet cover the order's USD total, the order stays 'pending'
-- and the UI shows "Still open — $X left" (in dollars). When the payments add
-- up to the full USD total, the order flips to 'paid_supplier' on its own and
-- its landed cost is locked in using the TOTAL pesos actually spent.
--
-- DESIGN NOTES
--   * Each part-payment posts its OWN ledger line immediately, in the paying
--     account's currency (DOP -> pesos; USD -> pesos/rate, same rule as 40b),
--     so balances are always correct mid-way.
--   * "USD covered" by one payment = pesos / rate. An order is fully paid when
--     SUM(usd_covered) >= usd_total (within half a cent).
--   * Receiving stock already requires status 'paid_supplier', so a partly-paid
--     order (status 'pending') cannot be received yet — landed cost is only
--     computed at finalize, when total pesos is known. No new status added.
--   * Finalize reuses _allocate_supplier_payment with category = NULL, which
--     does the header + per-line landed-cost math but SKIPS the ledger post
--     (each part already posted). Landed-cost conservation holds for any rate:
--     sum(line_landed*qty) = total_dop exactly, so the blended rate is only for
--     reporting. (Same accepted semantics as the 40a batch flow.)
--
-- WHAT'S ADDED
--   purchase_order_payments        - one row per part-payment
--   add_supplier_payment(...)      - record a part-payment (+ auto-finalize)
--   remove_supplier_payment(id)    - undo a part-payment while still 'pending'
--   supplier_payment_summary(po)   - read helper for the UI (covered/remaining)
--
-- WHAT'S CHANGED (guards only; existing behaviour otherwise identical)
--   mark_paid_supplier             - refuses if the order already has part-pmts
--   correct_supplier_payment       - also clears part-pmt rows when correcting
--
-- WHAT'S UNCHANGED
--   _allocate_supplier_payment, pay_supplier_for_received, post_transaction,
--   all existing orders, balances, and stock. Fully additive.
--
-- SAFETY: idempotent (IF NOT EXISTS / CREATE OR REPLACE). All writes go through
-- SECURITY DEFINER, owner/admin-gated RPCs. Test with BEGIN/ROLLBACK first.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Storage: one row per part-payment toward a purchase order
-- ----------------------------------------------------------------------------
create table if not exists public.purchase_order_payments (
  id                        uuid primary key default uuid_generate_v4(),
  purchase_order_id         uuid not null references public.purchase_orders(id) on delete cascade,
  money_account_id          uuid not null references public.money_accounts(id),
  category_id               uuid not null references public.account_categories(id),
  dop_amount_cents          bigint not null check (dop_amount_cents > 0),  -- pesos that left the account
  exchange_rate             numeric not null check (exchange_rate > 0),    -- rate used for THIS payment
  official_rate_at_payment  numeric,
  usd_covered               numeric(14,4) not null check (usd_covered > 0),-- dollars of the order this covers
  transaction_id            uuid references public.transactions(id),        -- the ledger line it posted
  paid_at                   timestamptz not null default now(),
  created_by                uuid references public.profiles(id),
  created_at                timestamptz not null default now()
);

create index if not exists idx_pop_purchase_order
  on public.purchase_order_payments(purchase_order_id);

-- RLS: staff may read; all writes happen only through the SECURITY DEFINER RPCs
-- below (which bypass RLS), so no insert/update/delete policy is exposed.
alter table public.purchase_order_payments enable row level security;

drop policy if exists pop_select_staff on public.purchase_order_payments;
create policy pop_select_staff on public.purchase_order_payments
  for select using (
    exists (select 1 from public.profiles p
            where p.auth_user_id = auth.uid() and p.role <> 'customer')
  );

-- ----------------------------------------------------------------------------
-- 2) add_supplier_payment - record ONE part-payment toward a pending order.
--    Posts its own ledger line; auto-finalizes the order when fully covered.
-- ----------------------------------------------------------------------------
create or replace function public.add_supplier_payment(
  p_purchase_order_id         uuid,
  p_dop_amount                numeric,        -- pesos that left the account
  p_exchange_rate             numeric,        -- rate used for this payment
  p_official_rate_at_payment  numeric,
  p_supplier_payment_account_id uuid,
  p_paid_at                   timestamptz default now(),
  p_category_id               uuid default null
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

  -- amount to deduct, in the paying account's own currency (same rule as 40b)
  if v_acct_currency = 'USD' then
    v_post_amount := p_dop_amount / p_exchange_rate;  -- dollar value
  else
    v_post_amount := p_dop_amount;                    -- pesos
  end if;

  -- record the part-payment row
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

-- ----------------------------------------------------------------------------
-- 3) remove_supplier_payment - undo a single part-payment (mistake fix),
--    allowed only while the order is still 'pending' (not yet finalized).
-- ----------------------------------------------------------------------------
create or replace function public.remove_supplier_payment(p_payment_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_role       user_role;
  v_profile_id uuid;
  v_po         uuid;
  v_status     purchase_status;
  v_txn        uuid;
begin
  select id, role into v_profile_id, v_role
    from public.profiles where auth_user_id = auth.uid();
  if v_role is null or v_role not in ('owner','admin') then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  select purchase_order_id, transaction_id into v_po, v_txn
    from public.purchase_order_payments where id = p_payment_id;
  if not found then
    raise exception 'part-payment % not found', p_payment_id;
  end if;

  select status into v_status from public.purchase_orders where id = v_po for update;
  if v_status <> 'pending' then
    raise exception 'cannot remove a part-payment: order % is %, use Correct payment instead',
                    v_po, v_status;
  end if;

  if v_txn is not null then
    perform public.reverse_transaction(v_txn);   -- restores the account balance + deletes the row
  end if;
  delete from public.purchase_order_payments where id = p_payment_id;

  return jsonb_build_object('ok', true, 'purchase_order_id', v_po);
end;
$function$;

-- ----------------------------------------------------------------------------
-- 4) supplier_payment_summary - read helper for the UI ("Still open" math)
-- ----------------------------------------------------------------------------
create or replace function public.supplier_payment_summary(p_purchase_order_id uuid)
 returns jsonb
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select jsonb_build_object(
    'usd_total',       po.usd_total,
    'usd_covered',     coalesce(c.cov, 0),
    'usd_remaining',   greatest(round(coalesce(po.usd_total,0) - coalesce(c.cov, 0), 2), 0),
    'total_dop_cents', coalesce(c.dop_cents, 0),
    'payment_count',   coalesce(c.cnt, 0),
    'fully_paid',      (po.status <> 'pending')
                       or coalesce(c.cov, 0) >= coalesce(po.usd_total, 0) - 0.005
  )
  from public.purchase_orders po
  left join lateral (
    select sum(usd_covered) cov, sum(dop_amount_cents) dop_cents, count(*) cnt
    from public.purchase_order_payments p
    where p.purchase_order_id = po.id
  ) c on true
  where po.id = p_purchase_order_id;
$function$;

-- ----------------------------------------------------------------------------
-- 5) mark_paid_supplier - UNCHANGED behaviour + one new guard:
--    refuse if the order already has part-payments (must finish via parts flow).
-- ----------------------------------------------------------------------------
create or replace function public.mark_paid_supplier(
  p_purchase_order_id uuid,
  p_dop_paid_total numeric,
  p_exchange_rate numeric,
  p_official_rate_at_payment numeric,
  p_supplier_payment_account_id uuid,
  p_paid_at_dop timestamp with time zone DEFAULT now(),
  p_category_id uuid DEFAULT NULL::uuid
)
 returns void
 language plpgsql
as $function$
declare
  v_status public.purchase_status;
begin
  if p_dop_paid_total is null or p_dop_paid_total <= 0 then
    raise exception 'dop_paid_total must be > 0 (got %)', p_dop_paid_total;
  end if;
  if p_exchange_rate is null or p_exchange_rate <= 0 then
    raise exception 'exchange_rate must be > 0 (got %)', p_exchange_rate;
  end if;

  select status into v_status
    from public.purchase_orders
    where id = p_purchase_order_id;
  if not found then
    raise exception 'purchase order % not found', p_purchase_order_id;
  end if;
  if v_status <> 'pending' then
    raise exception 'cannot mark paid: order % is in status %, expected pending',
                    p_purchase_order_id, v_status;
  end if;

  -- NEW guard: don't allow a one-shot full payment on an order that already has
  -- part-payments recorded (that would double-pay). Finish it via the parts flow.
  if exists (select 1 from public.purchase_order_payments
             where purchase_order_id = p_purchase_order_id) then
    raise exception 'order % already has part-payments; finish it through the parts flow',
                    p_purchase_order_id;
  end if;

  perform public._allocate_supplier_payment(
    p_purchase_order_id,
    p_dop_paid_total,
    p_exchange_rate,
    p_official_rate_at_payment,
    p_supplier_payment_account_id,
    p_paid_at_dop,
    p_category_id
  );
end;
$function$;

-- ----------------------------------------------------------------------------
-- 6) correct_supplier_payment - UNCHANGED behaviour + clears any part-payment
--    rows for the order (their ledger lines are reversed by the loop already).
--    Correcting collapses a multi-part order back to a single corrected payment.
-- ----------------------------------------------------------------------------
create or replace function public.correct_supplier_payment(
  p_purchase_order_id uuid,
  p_dop_paid_total numeric,
  p_exchange_rate numeric,
  p_official_rate_at_payment numeric,
  p_supplier_payment_account_id uuid,
  p_paid_at_dop timestamp with time zone DEFAULT now(),
  p_category_id uuid DEFAULT NULL::uuid
)
 returns void
 language plpgsql
as $function$
declare
  v_status    public.purchase_status;
  v_lot_count int;
  v_txn       record;
begin
  if p_dop_paid_total is null or p_dop_paid_total <= 0 then
    raise exception 'dop_paid_total must be > 0 (got %)', p_dop_paid_total;
  end if;
  if p_exchange_rate is null or p_exchange_rate <= 0 then
    raise exception 'exchange_rate must be > 0 (got %)', p_exchange_rate;
  end if;

  select status into v_status
    from public.purchase_orders
    where id = p_purchase_order_id;
  if not found then
    raise exception 'purchase order % not found', p_purchase_order_id;
  end if;
  if v_status <> 'paid_supplier' then
    raise exception 'cannot correct payment: order % is in status %, expected paid_supplier',
                    p_purchase_order_id, v_status;
  end if;

  select count(*) into v_lot_count
    from public.inventory_lots il
    join public.purchase_order_items poi on poi.id = il.purchase_order_item_id
    where poi.purchase_order_id = p_purchase_order_id;
  if v_lot_count > 0 then
    raise exception
      'cannot correct payment: % inventory lot(s) already received for order %; corrections are only allowed before any stock is received',
      v_lot_count, p_purchase_order_id;
  end if;

  -- Reverse every purchase-linked ledger line for this order (covers both the
  -- old single-payment line AND any part-payment lines).
  for v_txn in
    select id
      from public.transactions
      where source_purchase_order_id = p_purchase_order_id
  loop
    perform public.reverse_transaction(v_txn.id);
  end loop;

  -- NEW: drop the part-payment rows (their ledger lines were just reversed).
  delete from public.purchase_order_payments
    where purchase_order_id = p_purchase_order_id;

  -- Re-run the allocation with the corrected single payment (posts one fresh line).
  perform public._allocate_supplier_payment(
    p_purchase_order_id,
    p_dop_paid_total,
    p_exchange_rate,
    p_official_rate_at_payment,
    p_supplier_payment_account_id,
    p_paid_at_dop,
    p_category_id
  );
end;
$function$;

-- ============================================================================
-- End round 41a.
-- ============================================================================
