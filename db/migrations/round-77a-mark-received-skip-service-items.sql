-- round-77a-mark-received-skip-service-items.sql
-- Purpose: receiving a purchase must NOT accrue stock for service items.
--
-- Root cause fixed: mark_received() created an inventory_lots row for every
-- received line regardless of the product's track-inventory switch. Service
-- items (products.is_inventory = false) are correctly SKIPPED at sale time
-- (confirm_pos_sale), so a purchase added stock that a sale never removed ->
-- phantom on-hand that only grew (seen on the Free Fire Diamonds items).
--
-- Change (two spots only; everything else byte-for-byte the live body):
--   1) Lot-insert loop: skip the insert when products.is_inventory = false,
--      so a service line creates no lot and burns no lot_number (no gaps).
--   2) Validation loop: the "no dop_unit_landed_cost -> cannot create lot"
--      guard now applies to TRACKED items only; a service line can't be
--      blocked by a missing cost (it makes no lot anyway).
-- coalesce(is_inventory, true): a NULL switch is treated as "tracked" so
-- nothing silently stops stocking.
--
-- Safe to apply: redefinition only. Touches no existing rows; changes only
-- what happens the NEXT time a purchase is received.
-- Rebuilt from the LIVE body via pg_get_functiondef('public.mark_received(uuid, jsonb)').

create or replace function public.mark_received(p_purchase_order_id uuid, p_receipts jsonb)
returns void
language plpgsql
as $$
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

  -- Per-line validation.
  for r in
    select (rec.value->>'line_id')::uuid    as line_id,
           (rec.value->>'received_qty')::numeric as received_qty
      from jsonb_array_elements(p_receipts) as rec
  loop
    if r.received_qty is null or r.received_qty < 0 then
      raise exception 'received_qty must be >= 0 (line_id %, got %)',
                      r.line_id, r.received_qty;
    end if;

    perform 1
      from public.purchase_order_items
      where id = r.line_id
        and purchase_order_id = p_purchase_order_id;
    if not found then
      raise exception 'line % does not belong to order %',
                      r.line_id, p_purchase_order_id;
    end if;

    if r.received_qty > 0 then
      declare
        v_ordered_qty numeric;
        v_already     numeric;
        v_landed_cost numeric;
        v_tracks      boolean;
      begin
        select poi.qty, poi.dop_unit_landed_cost, pr.is_inventory
          into v_ordered_qty, v_landed_cost, v_tracks
          from public.purchase_order_items poi
          join public.products pr on pr.id = poi.product_id
          where poi.id = r.line_id;

        select coalesce(sum(qty_received), 0)
          into v_already
          from public.inventory_lots
          where purchase_order_item_id = r.line_id;

        if v_already + r.received_qty > v_ordered_qty then
          raise exception 'line %: received_qty % exceeds remaining (% ordered, % already received)',
                          r.line_id, r.received_qty, v_ordered_qty, v_already;
        end if;

        -- Only tracked items need a landed cost (service items create no lot)
        if coalesce(v_tracks, true) and v_landed_cost is null then
          raise exception 'line % has no dop_unit_landed_cost set; cannot create inventory lot',
                          r.line_id;
        end if;
      end;
    end if;
  end loop;

  -- Starting lot_number from current global max over numeric lot_numbers only
  select coalesce(max(lot_number::integer), 0) + 1
    into v_next_lot
    from public.inventory_lots
    where lot_number ~ '^[0-9]+$';

  -- Insert one inventory_lots row per receipt with qty > 0,
  -- but SKIP service items (is_inventory = false) so they never accrue stock.
  v_lot_offset := 0;
  for r in
    select (rec.value->>'line_id')::uuid    as line_id,
           (rec.value->>'received_qty')::numeric as received_qty
      from jsonb_array_elements(p_receipts) as rec
  loop
    if r.received_qty > 0 then
      declare
        v_tracks boolean;
      begin
        select pr.is_inventory
          into v_tracks
          from public.purchase_order_items poi
          join public.products pr on pr.id = poi.product_id
          where poi.id = r.line_id;

        if coalesce(v_tracks, true) then
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
      end;
    end if;
  end loop;

  -- Status flip + first-receive timestamp preservation
  update public.purchase_orders
    set status      = 'received',
        received_at = coalesce(v_received_at, now()),
        updated_at  = now()
    where id = p_purchase_order_id;
end;
$$;
