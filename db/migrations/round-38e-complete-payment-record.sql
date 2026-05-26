-- round-38e — complete_payment_record
--
-- For HALF-PAID migrated orders: they already have dop_paid_total + exchange_rate
-- (+ dop_bank_fee) from the migration, but are missing paid_at_dop and
-- supplier_payment_account_id — so the app reads them as "Not paid yet"
-- (isPaid rule requires paid_at_dop). This fills ONLY those two missing fields
-- (plus optional official rate), so the order is recognized as paid.
--
-- DOES NOT RECOMPUTE ANYTHING. The amount, exchange rate, bank fee, item landed
-- costs and inventory lots are already in place and correct — we deliberately
-- leave them untouched. This is purely "complete the bookkeeping record".
--
-- GUARD: only for orders that have an amount but no paid date (the half-paid
-- state). Refuses fully-paid orders (paid_at_dop already set) and never-paid
-- orders (no dop_paid_total — those use pay_supplier_for_received).

create or replace function public.complete_payment_record(
  p_purchase_order_id          uuid,
  p_supplier_payment_account_id uuid,
  p_paid_at_dop                timestamp with time zone,
  p_official_rate_at_payment   numeric default null,
  p_category_id                uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_paid_at      timestamp with time zone;
  v_dop_paid     numeric;
  v_account      uuid;
  v_supplier_name text;
begin
  -- Caller must be staff (non-customer).
  if not exists (
    select 1 from public.profiles p
    where p.auth_user_id = auth.uid() and p.role <> 'customer'
  ) then
    raise exception 'not authorized';
  end if;

  if p_supplier_payment_account_id is null then
    raise exception 'an account is required';
  end if;
  if p_paid_at_dop is null then
    raise exception 'a payment date is required';
  end if;

  select paid_at_dop, dop_paid_total, supplier_payment_account_id
    into v_paid_at, v_dop_paid, v_account
    from public.purchase_orders
    where id = p_purchase_order_id;

  if not found then
    raise exception 'purchase order % not found', p_purchase_order_id;
  end if;

  if v_dop_paid is null or v_dop_paid <= 0 then
    raise exception 'order % has no recorded payment amount; use the Pay supplier flow instead', p_purchase_order_id;
  end if;

  if v_paid_at is not null then
    raise exception 'order % already has a complete payment record', p_purchase_order_id;
  end if;

  -- Fill ONLY the missing bookkeeping fields. No cost recompute.
  update public.purchase_orders
    set supplier_payment_account_id = p_supplier_payment_account_id,
        paid_at_dop                 = p_paid_at_dop,
        official_rate_at_payment    = coalesce(p_official_rate_at_payment, official_rate_at_payment),
        updated_at                  = now()
    where id = p_purchase_order_id;

  -- Optional ledger post (only when a category is supplied). Uses the existing
  -- recorded amount. Skipped by default to keep money-account handling separate.
  if p_category_id is not null then
    select s.name into v_supplier_name
      from public.purchase_orders po
      join public.suppliers s on s.id = po.supplier_id
      where po.id = p_purchase_order_id;

    perform public.post_transaction(jsonb_build_object(
      'money_account_id',         p_supplier_payment_account_id,
      'category_id',              p_category_id,
      'amount_cents',             -round(v_dop_paid * 100),
      'scope',                    'business',
      'occurred_at',              p_paid_at_dop,
      'description',              'Purchase — ' || coalesce(v_supplier_name, ''),
      'source_purchase_order_id', p_purchase_order_id
    ));
  end if;
end;
$function$;

grant execute on function public.complete_payment_record(uuid, uuid, timestamp with time zone, numeric, uuid) to authenticated;
