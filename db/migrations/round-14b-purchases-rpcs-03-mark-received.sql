-- ============================================================
-- Round 14b.2 - mark_received
--
-- User-facing RPC: record receipt of goods against a purchase
-- order, full or partial.
--
-- Input: array of {line_id, received_qty}. Each element with
-- received_qty > 0 produces one inventory_lots row. Elements
-- with received_qty = 0 are silently skipped (used to mark
-- "nothing received for this line on this call" without
-- creating empty lot rows).
--
-- Re-entrant: same order can be received multiple times.
-- Each call creates NEW lots. Status starts as paid_supplier
-- on first call, stays at received on subsequent calls.
-- received_at is set on first call only (preserves the
-- original receipt timestamp).
--
-- Lot numbers: max(existing numeric lot_numbers) + 1,
-- sequential within this call. Legacy non-numeric lot_numbers
-- ("LOT-1903", "1751abc") are ignored when computing max.
-- Pure SELECT-MAX, no row lock; the spec accepts the race
-- for one-owner usage.
--
-- Validation (all checked BEFORE any writes):
--   - p_receipts is non-empty array
--   - at least one receipt has received_qty > 0
--   - order exists, status is paid_supplier or received
--   - every line_id belongs to this order
--   - every received_qty >= 0
--   - no overshoot: existing-received + this-call <= ordered
--   - every line being received has dop_unit_landed_cost
--     set (required by inventory_lots.unit_cost_dop NOT NULL)
-- ============================================================

create or replace function public.mark_received(
  p_purchase_order_id uuid,
  p_receipts          jsonb
) returns void
language plpgsql
as $func$
declare
  v_status       public.purchase_status;
  v_warehouse_id uuid;
  v_received_at  timestamptz;
  v_any_positive boolean;
  v_next_lot     integer;
  v_lot_offset   integer;
  r              record;
begin
  -- Basic shape validation on the jsonb input
  if p_receipts is null or jsonb_typeof(p_receipts) <> 'array' then
    raise exception 'p_receipts must be a jsonb array';
  end if;
  if jsonb_array_length(p_receipts) = 0 then
    raise exception 'p_receipts must not be empty';
  end if;

  -- At least one receipt must be positive
  select bool_or((value->>'received_qty')::numeric > 0)
    into v_any_positive
    from jsonb_array_elements(p_receipts);
  if not coalesce(v_any_positive, false) then
    raise exception 'p_receipts must contain at least one received_qty > 0';
  end if;

  -- Order lookup + status guard
  select status, warehouse_id, received_at
    into v_status, v_warehouse_id, v_received_at
    from public.purchase_orders
    where id = p_purchase_order_id;

  if not found then
    raise exception 'purchase order % not found', p_purchase_order_id;
  end if;
  if v_status not in ('paid_supplier', 'received') then
    raise exception 'cannot mark received: order % is in status %, expected paid_supplier or received',
                    p_purchase_order_id, v_status;
  end if;

  -- Per-line validation. Loops through receipts and checks each one
  -- against the corresponding purchase_order_items row.
  for r in
    select (rec.value->>'line_id')::uuid    as line_id,
           (rec.value->>'received_qty')::numeric as received_qty
      from jsonb_array_elements(p_receipts) as rec
  loop
    if r.received_qty is null or r.received_qty < 0 then
      raise exception 'received_qty must be >= 0 (line_id %, got %)',
                      r.line_id, r.received_qty;
    end if;

    -- Verify line belongs to this order + grab its qty and cost
    perform 1
      from public.purchase_order_items
      where id = r.line_id
        and purchase_order_id = p_purchase_order_id;
    if not found then
      raise exception 'line % does not belong to order %',
                      r.line_id, p_purchase_order_id;
    end if;

    -- Overshoot check: existing receipts + this call <= ordered
    if r.received_qty > 0 then
      declare
        v_ordered_qty numeric;
        v_already     numeric;
        v_landed_cost numeric;
      begin
        select qty, dop_unit_landed_cost
          into v_ordered_qty, v_landed_cost
          from public.purchase_order_items
          where id = r.line_id;

        select coalesce(sum(qty_received), 0)
          into v_already
          from public.inventory_lots
          where purchase_order_item_id = r.line_id;

        if v_already + r.received_qty > v_ordered_qty then
          raise exception 'line %: received_qty % exceeds remaining (% ordered, % already received)',
                          r.line_id, r.received_qty, v_ordered_qty, v_already;
        end if;

        if v_landed_cost is null then
          raise exception 'line % has no dop_unit_landed_cost set; cannot create inventory lot',
                          r.line_id;
        end if;
      end;
    end if;
  end loop;

  -- All validations passed. Compute starting lot_number from
  -- the current global max over numeric lot_numbers only.
  select coalesce(max(lot_number::integer), 0) + 1
    into v_next_lot
    from public.inventory_lots
    where lot_number ~ '^[0-9]+$';

  -- Insert one inventory_lots row per receipt with qty > 0,
  -- assigning lot_numbers sequentially.
  v_lot_offset := 0;
  for r in
    select (rec.value->>'line_id')::uuid    as line_id,
           (rec.value->>'received_qty')::numeric as received_qty
      from jsonb_array_elements(p_receipts) as rec
  loop
    if r.received_qty > 0 then
      insert into public.inventory_lots (
        product_id,
        warehouse_id,
        purchase_order_item_id,
        lot_number,
        qty_received,
        qty_remaining,
        unit_cost_dop,
        received_at
      )
      select
        poi.product_id,
        v_warehouse_id,
        r.line_id,
        (v_next_lot + v_lot_offset)::text,
        r.received_qty,
        r.received_qty,
        poi.dop_unit_landed_cost,
        now()
      from public.purchase_order_items poi
      where poi.id = r.line_id;

      v_lot_offset := v_lot_offset + 1;
    end if;
  end loop;

  -- Status flip + first-receive timestamp preservation
  update public.purchase_orders
    set status      = 'received',
        received_at = coalesce(v_received_at, now()),
        updated_at  = now()
    where id = p_purchase_order_id;
end;
$func$;