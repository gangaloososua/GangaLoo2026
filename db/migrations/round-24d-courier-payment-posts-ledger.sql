-- Round 24d: courier payments post to the ledger (Stage 2, event 2)
--
-- Extends create_courier_payment so that, in addition to recording the
-- courier_payments row, its allocations, and recomputing affected POs'
-- transport shares + landed costs (UNCHANGED from the prior version), it now
-- ALSO posts a courier EXPENSE to the ledger via post_transaction - which
-- moves the money account balance too.
--
-- New parameter p_category_id (the expense category, chosen in the courier
-- payment form). A courier payment is always an expense. The amount is stored
-- in pesos (numeric) on courier_payments, so it is converted to cents
-- (* 100) for the ledger, posted negative, dated to p_paid_at, and linked via
-- source_courier_payment_id so it shows as a non-manual ("AUTO") entry.
--
-- NOTE: the 7-arg version was DROPped and recreated with the 8th arg
-- (p_category_id, default null). The PO-recompute block is byte-for-byte the
-- same as before; only the category validation and the trailing ledger post
-- are new.

DROP FUNCTION IF EXISTS public.create_courier_payment(uuid, timestamp with time zone, numeric, uuid, text, text, jsonb);

CREATE OR REPLACE FUNCTION public.create_courier_payment(
  p_courier_id uuid,
  p_paid_at timestamp with time zone,
  p_amount_dop_total numeric,
  p_money_account_id uuid,
  p_description text,
  p_reference text,
  p_allocations jsonb,
  p_category_id uuid default null
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_new_id uuid;
  v_alloc_sum numeric;
  v_alloc_count int;
  v_courier_kind text;
  v_courier_name text;
  v_account_exists boolean;
  v_po record;
  v_total_transport_dop numeric;
  v_total_units numeric;
  v_per_unit_share numeric;
  v_post jsonb;
begin
  if p_allocations is null or jsonb_array_length(p_allocations) = 0 then
    raise exception 'create_courier_payment: p_allocations is empty';
  end if;

  if p_category_id is null then
    raise exception 'create_courier_payment: p_category_id is required (pick a courier expense category)';
  end if;

  v_alloc_count := jsonb_array_length(p_allocations);

  select sum((a->>'amount_dop')::numeric)
    into v_alloc_sum
    from jsonb_array_elements(p_allocations) as a;

  if abs(coalesce(v_alloc_sum, 0) - p_amount_dop_total) > 0.01 then
    raise exception 'create_courier_payment: allocation sum % does not match amount_dop_total %',
      v_alloc_sum, p_amount_dop_total;
  end if;

  select kind, name into v_courier_kind, v_courier_name
    from public.suppliers where id = p_courier_id;
  if v_courier_kind is null then
    raise exception 'create_courier_payment: courier % not found', p_courier_id;
  end if;
  if v_courier_kind <> 'courier' then
    raise exception 'create_courier_payment: supplier % is kind=%, must be courier',
      p_courier_id, v_courier_kind;
  end if;

  select exists(select 1 from public.money_accounts where id = p_money_account_id)
    into v_account_exists;
  if not v_account_exists then
    raise exception 'create_courier_payment: money_account % not found', p_money_account_id;
  end if;

  perform 1
    from jsonb_array_elements(p_allocations) as a
    left join public.purchase_orders po
      on po.id = (a->>'purchase_order_id')::uuid
    where po.id is null;
  if found then
    raise exception 'create_courier_payment: one or more purchase_order_id values not found';
  end if;

  insert into public.courier_payments (
    courier_id, paid_at, amount_dop_total, money_account_id,
    description, reference
  )
  values (
    p_courier_id, p_paid_at, p_amount_dop_total, p_money_account_id,
    p_description, p_reference
  )
  returning id into v_new_id;

  insert into public.courier_payment_allocations (
    courier_payment_id, purchase_order_id, amount_dop
  )
  select
    v_new_id,
    (a->>'purchase_order_id')::uuid,
    (a->>'amount_dop')::numeric
  from jsonb_array_elements(p_allocations) as a;

  for v_po in
    select distinct (a->>'purchase_order_id')::uuid as po_id
    from jsonb_array_elements(p_allocations) as a
  loop
    select coalesce(sum(amount_dop), 0)
      into v_total_transport_dop
      from public.courier_payment_allocations
      where purchase_order_id = v_po.po_id;

    select coalesce(sum(qty), 0)
      into v_total_units
      from public.purchase_order_items
      where purchase_order_id = v_po.po_id;

    if v_total_units = 0 then
      raise exception 'create_courier_payment: PO % has zero ordered units; cannot allocate transport',
        v_po.po_id;
    end if;

    v_per_unit_share := round(v_total_transport_dop / v_total_units, 4);

    update public.purchase_order_items
      set dop_transport_share = round(v_per_unit_share * qty, 4),
          dop_unit_landed_cost = round(
            coalesce(dop_unit_cost_base, 0)
            + coalesce(dop_bank_share, 0)
            + v_per_unit_share,
            4)
      where purchase_order_id = v_po.po_id;

    update public.inventory_lots il
      set unit_cost_dop = poi.dop_unit_landed_cost
      from public.purchase_order_items poi
      where il.purchase_order_item_id = poi.id
        and poi.purchase_order_id = v_po.po_id
        and coalesce(il.qty_remaining, 0) > 0;
  end loop;

  -- Post the courier expense to the ledger (negative, cents, dated to paid_at,
  -- linked -> AUTO). Moves the account balance via the shared posting engine.
  select public.post_transaction(jsonb_build_object(
    'money_account_id',          p_money_account_id,
    'category_id',               p_category_id,
    'amount_cents',              -round(p_amount_dop_total * 100),
    'scope',                     'business',
    'occurred_at',               p_paid_at,
    'description',               'Courier payment — ' || coalesce(v_courier_name, ''),
    'source_courier_payment_id', v_new_id
  )) into v_post;

  return v_new_id;
end
$function$;
