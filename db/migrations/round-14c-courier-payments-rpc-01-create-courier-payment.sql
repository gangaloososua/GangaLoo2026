-- ============================================================
-- Round 14c.2.1 — create_courier_payment RPC
--
-- Atomically:
--   1. Insert courier_payments row.
--   2. Insert courier_payment_allocations rows.
--   3. For each affected PO, recompute
--      purchase_order_items.dop_transport_share based on the
--      NEW total of all allocations (this payment + any prior).
--   4. For each affected PO with status in ('received','complete'),
--      rewrite inventory_lots.unit_cost_dop for lots where
--      qty_remaining > 0. Fully-consumed lots keep
--      original cost basis.
--   5. Validate sum-of-allocations == p_amount_dop_total
--      within +/- 0.01.
--
-- RAISES on:
--   - p_allocations empty
--   - sum of allocations <> p_amount_dop_total (>0.01)
--   - p_courier_id not of kind=courier
--   - p_money_account_id not found
--   - any p_allocations[].purchase_order_id not found
--
-- Returns: uuid of new courier_payments row.
-- ============================================================

create or replace function public.create_courier_payment(
  p_courier_id uuid,
  p_paid_at timestamptz,
  p_amount_dop_total numeric,
  p_money_account_id uuid,
  p_description text,
  p_reference text,
  p_allocations jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_new_id uuid;
  v_alloc_sum numeric;
  v_alloc_count int;
  v_courier_kind text;
  v_account_exists boolean;
  v_po record;
  v_total_transport_dop numeric;
  v_total_units numeric;
  v_per_unit_share numeric;
begin
  -- ---- Input validation ---------------------------------------------

  if p_allocations is null or jsonb_array_length(p_allocations) = 0 then
    raise exception 'create_courier_payment: p_allocations is empty';
  end if;

  v_alloc_count := jsonb_array_length(p_allocations);

  select sum((a->>'amount_dop')::numeric)
    into v_alloc_sum
    from jsonb_array_elements(p_allocations) as a;

  if abs(coalesce(v_alloc_sum, 0) - p_amount_dop_total) > 0.01 then
    raise exception 'create_courier_payment: allocation sum % does not match amount_dop_total %',
      v_alloc_sum, p_amount_dop_total;
  end if;

  select kind into v_courier_kind from public.suppliers where id = p_courier_id;
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

  -- Validate every PO id exists.
  perform 1
    from jsonb_array_elements(p_allocations) as a
    left join public.purchase_orders po
      on po.id = (a->>'purchase_order_id')::uuid
    where po.id is null;
  if found then
    raise exception 'create_courier_payment: one or more purchase_order_id values not found';
  end if;

  -- ---- Insert courier_payments row ----------------------------------

  insert into public.courier_payments (
    courier_id, paid_at, amount_dop_total, money_account_id,
    description, reference
  )
  values (
    p_courier_id, p_paid_at, p_amount_dop_total, p_money_account_id,
    p_description, p_reference
  )
  returning id into v_new_id;

  -- ---- Insert allocations -------------------------------------------

  insert into public.courier_payment_allocations (
    courier_payment_id, purchase_order_id, amount_dop
  )
  select
    v_new_id,
    (a->>'purchase_order_id')::uuid,
    (a->>'amount_dop')::numeric
  from jsonb_array_elements(p_allocations) as a;

  -- ---- Recompute affected POs ---------------------------------------

  -- Distinct POs touched by this payment.
  for v_po in
    select distinct (a->>'purchase_order_id')::uuid as po_id
    from jsonb_array_elements(p_allocations) as a
  loop
    -- New total transport for this PO across ALL its courier payments
    -- (the just-inserted ones plus any prior).
    select coalesce(sum(amount_dop), 0)
      into v_total_transport_dop
      from public.courier_payment_allocations
      where purchase_order_id = v_po.po_id;

    -- Total units ordered on this PO (allocation base per spec).
    select coalesce(sum(qty), 0)
      into v_total_units
      from public.purchase_order_items
      where purchase_order_id = v_po.po_id;

    if v_total_units = 0 then
      raise exception 'create_courier_payment: PO % has zero ordered units; cannot allocate transport',
        v_po.po_id;
    end if;

    v_per_unit_share := round(v_total_transport_dop / v_total_units, 4);

    -- Rewrite transport share AND landed cost on every line of this PO.
    -- dop_unit_landed_cost is NOT a generated column (verified at 14c.9.6.s1):
    -- it must be set explicitly. Formula:
    --   landed = coalesce(base,0) + coalesce(bank,0) + per_unit_transport
    update public.purchase_order_items
      set dop_transport_share = round(v_per_unit_share * qty, 4),
          dop_unit_landed_cost = round(
            coalesce(dop_unit_cost_base, 0)
            + coalesce(dop_bank_share, 0)
            + v_per_unit_share,
            4)
      where purchase_order_id = v_po.po_id;

    -- Rewrite inventory_lots.unit_cost_dop for UNCONSUMED qty only,
    -- on lots tied to this PO via the line. Already-consumed lots
    -- keep original cost.
    update public.inventory_lots il
      set unit_cost_dop = poi.dop_unit_landed_cost
      from public.purchase_order_items poi
      where il.purchase_order_item_id = poi.id
        and poi.purchase_order_id = v_po.po_id
        and coalesce(il.qty_remaining, 0) > 0;
  end loop;

  return v_new_id;
end
$func$;

grant execute on function public.create_courier_payment(
  uuid, timestamptz, numeric, uuid, text, text, jsonb
) to authenticated;
