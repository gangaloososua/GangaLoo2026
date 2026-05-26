-- round-38c — pay_supplier_for_received
--
-- Records a supplier payment on an order that is ALREADY received or complete
-- (migrated orders that were paid in real life but never had the payment
-- recorded — "Not paid yet" on a Complete order).
--
-- WHY A SEPARATE FUNCTION: the normal pay flow (_allocate_supplier_payment)
-- hard-sets status = 'paid_supplier', which would REGRESS a complete/received
-- order. This version keeps the existing status and additionally syncs on-hand
-- inventory lots to the freshly-computed landed cost.
--
-- MATH: identical to _allocate_supplier_payment —
--   dop_unit_cost_base   = usd_unit_cost * rate
--   dop_bank_share       = ((usd_line/usd_subtotal)*dop_paid - usd_line*rate)/qty
--   dop_unit_landed_cost = base + bank_share + coalesce(dop_transport_share,0)
-- so any transport already spread (round-38b) is preserved.
--
-- SOLD-STOCK SAFETY: inventory_lots updated ONLY where qty_remaining > 0.
-- Consumed (sold) stock keeps its historical cost; past sale COGS untouched.
--
-- GUARD: only allowed for 'received' or 'complete' orders. For 'pending' use
-- the normal mark_paid_supplier; for 'paid_supplier' use correct_supplier_payment.

create or replace function public.pay_supplier_for_received(
  p_purchase_order_id          uuid,
  p_dop_paid_total             numeric,
  p_exchange_rate              numeric,
  p_official_rate_at_payment   numeric,
  p_supplier_payment_account_id uuid,
  p_paid_at_dop                timestamp with time zone,
  p_category_id                uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
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
    where poi.purchase_order_id = p_purchase_order_id;

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

grant execute on function public.pay_supplier_for_received(uuid, numeric, numeric, numeric, uuid, timestamp with time zone, uuid) to authenticated;
