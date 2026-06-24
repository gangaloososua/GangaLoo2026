-- round-77a-correct-supplier-payment-eur.sql
--
-- 2026-06-24. "Correct payment" could not handle a supplier order that was paid
-- from a EUR account (Bank C24). Round-75a added the EUR branch only inside
-- add_supplier_payment; the CORRECT path runs through the shared helper
-- _allocate_supplier_payment, which had only: USD -> pesos/rate, else -> pesos.
-- So a EUR account fell into the `else` and the typed number was deducted from
-- C24 as if it were euros (the C24 currency-trap). This fixes it the durable way:
-- the EUR branch goes INTO the shared helper, and correct_supplier_payment threads
-- a DOP-per-EUR rate (p_eur_rate) down to it. Mirrors add_supplier_payment's math
-- exactly: the peso figure (EUR x DOP-per-EUR) is p_dop_paid_total, and euros
-- deducted = peso / DOP-per-EUR.
--
-- Both functions are SECURITY INVOKER (prosecdef=false) and granted to
-- (authenticated, postgres). Adding a trailing parameter changes the signature,
-- and DROP removes grants, so each is dropped and recreated with the new 8th
-- parameter, kept INVOKER, and re-granted to exactly (authenticated, postgres).
-- The helper is created BEFORE correct_supplier_payment so body-checking passes.
--
-- Other callers of the helper (add_supplier_payment's finalize, create_purchase_order
-- inline pay, mark_paid_supplier, pay_supplier_for_received, waive_supplier_remainder)
-- call it with 7 positional args; those now resolve to the new 8-arg function with
-- p_eur_rate defaulting to NULL -> unchanged behaviour for DOP/USD. The only change
-- for a non-correct caller is that posting to a EUR account WITH a category and no
-- rate now raises a clear error instead of silently mis-deducting (an improvement;
-- those EUR paths were already wrong before this).
--
-- Rebuilt verbatim from the live pg_get_functiondef bodies; only the marked EUR
-- lines and the new parameter were added.

begin;

-- ---------------------------------------------------------------------------
-- 1) Shared allocator gains an optional DOP-per-EUR rate + a EUR posting branch.
-- ---------------------------------------------------------------------------
drop function if exists public._allocate_supplier_payment(
  uuid, numeric, numeric, numeric, uuid, timestamptz, uuid
);

create function public._allocate_supplier_payment(
  p_purchase_order_id uuid,
  p_dop_paid_total numeric,
  p_exchange_rate numeric,
  p_official_rate_at_payment numeric,
  p_supplier_payment_account_id uuid,
  p_paid_at_dop timestamptz,
  p_category_id uuid default null,
  p_eur_rate numeric default null            -- NEW (round-77a): DOP per EUR
)
returns void
language plpgsql
as $function$
declare
  v_usd_subtotal   numeric(12,2);
  v_usd_total      numeric(12,2);
  v_dop_bank_fee   numeric(12,2);
  v_supplier_name  text;
  v_acct_currency  text;
  v_post_amount    numeric;   -- amount in the ACCOUNT'S currency (pre-cents)
begin
  -- Pull the header values we need for the math
  select usd_subtotal, usd_total
    into v_usd_subtotal, v_usd_total
    from public.purchase_orders
    where id = p_purchase_order_id;

  if not found then
    raise exception 'purchase order % not found', p_purchase_order_id;
  end if;

  if v_usd_subtotal = 0 then
    raise exception 'purchase order % has usd_subtotal = 0; cannot allocate', p_purchase_order_id;
  end if;

  -- Derived: bank fee = what bank charged minus naive prediction
  v_dop_bank_fee := p_dop_paid_total - (v_usd_total * p_exchange_rate);

  -- Update header
  update public.purchase_orders
    set dop_paid_total              = p_dop_paid_total,
        exchange_rate               = p_exchange_rate,
        official_rate_at_payment    = p_official_rate_at_payment,
        dop_bank_fee                = v_dop_bank_fee,
        supplier_payment_account_id = p_supplier_payment_account_id,
        paid_at_dop                 = p_paid_at_dop,
        status                      = 'paid_supplier',
        updated_at                  = now()
    where id = p_purchase_order_id;

  -- Update each line's DOP allocation (skip empty qty = 0 lines)
  update public.purchase_order_items poi
    set dop_unit_cost_base   = poi.usd_unit_cost * p_exchange_rate,
        dop_bank_share       = (
          (poi.usd_line_total / v_usd_subtotal) * p_dop_paid_total
          - poi.usd_line_total * p_exchange_rate
        ) / poi.qty,
        dop_unit_landed_cost = (poi.usd_unit_cost * p_exchange_rate)
                             + (
                                 (poi.usd_line_total / v_usd_subtotal) * p_dop_paid_total
                                 - poi.usd_line_total * p_exchange_rate
                               ) / poi.qty
                             + coalesce(poi.dop_transport_share, 0)
    where poi.purchase_order_id = p_purchase_order_id
      and poi.qty > 0;

  -- ---- post the supplier payment to the live ledger ----
  -- Only when a category was supplied (keeps every existing path/back-compat).
  -- Posted NEGATIVE (expense), in the PAYING ACCOUNT'S currency.
  if p_category_id is not null then
    select s.name
      into v_supplier_name
      from public.purchase_orders po
      join public.suppliers s on s.id = po.supplier_id
      where po.id = p_purchase_order_id;

    -- Resolve the paying account's currency to decide what to post.
    select upper(coalesce(currency, 'DOP'))
      into v_acct_currency
      from public.money_accounts
      where id = p_supplier_payment_account_id;

    if v_acct_currency = 'USD' then
      -- Dollar account: deduct the DOLLAR value actually paid.
      -- (dop_paid_total / rate). Guarded: rate must be > 0.
      if p_exchange_rate is null or p_exchange_rate <= 0 then
        raise exception 'exchange_rate must be > 0 to post to a USD account (got %)', p_exchange_rate;
      end if;
      v_post_amount := p_dop_paid_total / p_exchange_rate;
    elsif v_acct_currency = 'EUR' then
      -- NEW (round-77a): Euro account. The peso figure is p_dop_paid_total
      -- (EUR x DOP-per-EUR), so euros that left the account = peso / DOP-per-EUR.
      if p_eur_rate is null or p_eur_rate <= 0 then
        raise exception 'a DOP-per-EUR rate is required to post to a EUR account (got %)', p_eur_rate;
      end if;
      v_post_amount := p_dop_paid_total / p_eur_rate;
    else
      -- DOP (or any non-USD/EUR) account: deduct the pesos paid, as before.
      v_post_amount := p_dop_paid_total;
    end if;

    perform public.post_transaction(jsonb_build_object(
      'money_account_id',         p_supplier_payment_account_id,
      'category_id',              p_category_id,
      'amount_cents',             -round(v_post_amount * 100),
      'scope',                    'business',
      'occurred_at',              p_paid_at_dop,
      'description',              'Purchase — ' || coalesce(v_supplier_name, ''),
      'source_purchase_order_id', p_purchase_order_id
    ));
  end if;
end;
$function$;

grant execute on function public._allocate_supplier_payment(
  uuid, numeric, numeric, numeric, uuid, timestamptz, uuid, numeric
) to authenticated, postgres;

-- ---------------------------------------------------------------------------
-- 2) correct_supplier_payment gains the same optional rate and forwards it.
-- ---------------------------------------------------------------------------
drop function if exists public.correct_supplier_payment(
  uuid, numeric, numeric, numeric, uuid, timestamptz, uuid
);

create function public.correct_supplier_payment(
  p_purchase_order_id uuid,
  p_dop_paid_total numeric,
  p_exchange_rate numeric,
  p_official_rate_at_payment numeric,
  p_supplier_payment_account_id uuid,
  p_paid_at_dop timestamptz default now(),
  p_category_id uuid default null,
  p_eur_rate numeric default null            -- NEW (round-77a): DOP per EUR
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
  -- round-77a: forward the DOP-per-EUR rate so a EUR account deducts euros, not pesos.
  perform public._allocate_supplier_payment(
    p_purchase_order_id,
    p_dop_paid_total,
    p_exchange_rate,
    p_official_rate_at_payment,
    p_supplier_payment_account_id,
    p_paid_at_dop,
    p_category_id,
    p_eur_rate
  );
end;
$function$;

grant execute on function public.correct_supplier_payment(
  uuid, numeric, numeric, numeric, uuid, timestamptz, uuid, numeric
) to authenticated, postgres;

commit;
