-- round-40b: currency-aware supplier-payment ledger posting.
--
-- VERIFIED on live data 2026-05-28: correcting the Aliexpress POs from the
-- USD account "Konto Aliexpress GangaLoo" now posts US$63.30 / 60.37 / 46.63
-- (dop_paid / rate) instead of the raw peso totals; account reconciles to
-- US$19.07.
--
-- PROBLEM: _allocate_supplier_payment always posted dop_paid_total (pesos) to
-- the paying money account, regardless of that account's currency. Paying a PO
-- from a USD account therefore deposited the PESO figure into a dollar account
-- (e.g. -3956.25 instead of -63.30), inflating the account ~by the FX rate.
--
-- FIX: post the amount in the PAYING ACCOUNT'S currency.
--   - DOP account  -> post dop_paid_total            (unchanged behaviour)
--   - USD account  -> post dop_paid_total / rate      (the dollar value paid)
-- The PO header + per-line DOP landed costs are unchanged: inventory costing
-- is always in pesos and stays correct. Only the ledger line respects currency.
--
-- This is the SHARED helper, so it fixes BOTH the normal payment path
-- (mark_paid_supplier / pay_supplier_for_received) and correct_supplier_payment.

create or replace function public._allocate_supplier_payment(
  p_purchase_order_id uuid,
  p_dop_paid_total numeric,
  p_exchange_rate numeric,
  p_official_rate_at_payment numeric,
  p_supplier_payment_account_id uuid,
  p_paid_at_dop timestamp with time zone,
  p_category_id uuid default null::uuid
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
    else
      -- DOP (or any non-USD) account: deduct the pesos paid, as before.
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
