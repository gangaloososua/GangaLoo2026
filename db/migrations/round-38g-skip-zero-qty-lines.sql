-- round-38g-skip-zero-qty-lines.sql
-- Fixes "division by zero" when paying migrated purchase orders.
--
-- Some migrated orders carry an empty leftover line: qty = 0, usd = 0.
-- The supplier-payment math divides each line's cost by its quantity
-- (per-unit landed cost), so a qty = 0 line trips a divide-by-zero and the
-- whole payment aborts.
--
-- Fix: in the two payment routines, the per-line UPDATE now skips lines with
-- qty <= 0 (add `and poi.qty > 0` to the WHERE). An empty line has nothing to
-- allocate and a usd_line_total of 0, so the real lines' allocation is
-- mathematically unchanged -- we simply never divide by zero.
--
-- NOT touched on purpose:
--   * create_purchase_order also divides by qty, but it validates qty > 0 on
--     every line before inserting, so it can never produce a qty = 0 line and
--     cannot hit this error. Left as-is to avoid rewriting a large, critical
--     function for a guard it would never use.
--
-- Both statements are CREATE OR REPLACE (idempotent). Function signatures,
-- LANGUAGE, and (for pay_supplier_for_received) SECURITY DEFINER + search_path
-- are reproduced exactly; only the one WHERE clause changed in each.

-- ============================================================================
-- 1) _allocate_supplier_payment  (live pay flow + inline pay on create)
-- ============================================================================
CREATE OR REPLACE FUNCTION public._allocate_supplier_payment(p_purchase_order_id uuid, p_dop_paid_total numeric, p_exchange_rate numeric, p_official_rate_at_payment numeric, p_supplier_payment_account_id uuid, p_paid_at_dop timestamp with time zone, p_category_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  v_usd_subtotal numeric(12,2);
  v_usd_total    numeric(12,2);
  v_dop_bank_fee numeric(12,2);
  v_supplier_name text;
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
  -- Amount is in PESOS on the PO -> *100 to cents, posted NEGATIVE (expense).
  if p_category_id is not null then
    select s.name
      into v_supplier_name
      from public.purchase_orders po
      join public.suppliers s on s.id = po.supplier_id
      where po.id = p_purchase_order_id;

    perform public.post_transaction(jsonb_build_object(
      'money_account_id',         p_supplier_payment_account_id,
      'category_id',              p_category_id,
      'amount_cents',             -round(p_dop_paid_total * 100),
      'scope',                    'business',
      'occurred_at',              p_paid_at_dop,
      'description',              'Purchase — ' || coalesce(v_supplier_name, ''),
      'source_purchase_order_id', p_purchase_order_id
    ));
  end if;
end;
$function$;

-- ============================================================================
-- 2) pay_supplier_for_received  (pay on received/complete unpaid orders)
--    SECURITY DEFINER + search_path preserved exactly.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.pay_supplier_for_received(p_purchase_order_id uuid, p_dop_paid_total numeric, p_exchange_rate numeric, p_official_rate_at_payment numeric, p_supplier_payment_account_id uuid, p_paid_at_dop timestamp with time zone, p_category_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_usd_subtotal numeric(12,2);
  v_usd_total    numeric(12,2);
  v_dop_bank_fee numeric(12,2);
  v_status       public.purchase_status;
  v_supplier_name text;
begin
  -- Caller must be staff (non-customer).
  if not exists (
    select 1 from public.profiles p
    where p.auth_user_id = auth.uid() and p.role <> 'customer'
  ) then
    raise exception 'not authorized';
  end if;

  if p_dop_paid_total is null or p_dop_paid_total <= 0 then
    raise exception 'dop_paid_total must be > 0 (got %)', p_dop_paid_total;
  end if;
  if p_exchange_rate is null or p_exchange_rate <= 0 then
    raise exception 'exchange_rate must be > 0 (got %)', p_exchange_rate;
  end if;

  select status, usd_subtotal, usd_total
    into v_status, v_usd_subtotal, v_usd_total
    from public.purchase_orders
    where id = p_purchase_order_id;

  if not found then
    raise exception 'purchase order % not found', p_purchase_order_id;
  end if;

  if v_status not in ('received', 'complete') then
    raise exception 'pay_supplier_for_received: order % is %, expected received or complete', p_purchase_order_id, v_status;
  end if;

  if v_usd_subtotal = 0 then
    raise exception 'purchase order % has usd_subtotal = 0; cannot allocate', p_purchase_order_id;
  end if;

  -- Refuse double payment.
  if exists (
    select 1 from public.purchase_orders
    where id = p_purchase_order_id and dop_paid_total is not null
  ) then
    raise exception 'order % already has a recorded payment; use correct flow instead', p_purchase_order_id;
  end if;

  v_dop_bank_fee := p_dop_paid_total - (v_usd_total * p_exchange_rate);

  -- Header: fill payment fields, KEEP existing status.
  update public.purchase_orders
    set dop_paid_total              = p_dop_paid_total,
        exchange_rate               = p_exchange_rate,
        official_rate_at_payment    = p_official_rate_at_payment,
        dop_bank_fee                = v_dop_bank_fee,
        supplier_payment_account_id = p_supplier_payment_account_id,
        paid_at_dop                 = p_paid_at_dop,
        updated_at                  = now()
    where id = p_purchase_order_id;

  -- Items: recompute landed cost (same math as the live pay flow).
  -- Skip empty qty = 0 lines to avoid divide-by-zero.
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

  -- On-hand lots: sync to the new landed cost (sold stock untouched).
  update public.inventory_lots il
    set unit_cost_dop = poi.dop_unit_landed_cost
    from public.purchase_order_items poi
    where il.purchase_order_item_id = poi.id
      and poi.purchase_order_id = p_purchase_order_id
      and coalesce(il.qty_remaining, 0) > 0;

  -- Ledger post (only when a category is supplied).
  if p_category_id is not null then
    select s.name into v_supplier_name
      from public.purchase_orders po
      join public.suppliers s on s.id = po.supplier_id
      where po.id = p_purchase_order_id;

    perform public.post_transaction(jsonb_build_object(
      'money_account_id',         p_supplier_payment_account_id,
      'category_id',              p_category_id,
      'amount_cents',             -round(p_dop_paid_total * 100),
      'scope',                    'business',
      'occurred_at',              p_paid_at_dop,
      'description',              'Purchase — ' || coalesce(v_supplier_name, ''),
      'source_purchase_order_id', p_purchase_order_id
    ));
  end if;
end;
$function$;
