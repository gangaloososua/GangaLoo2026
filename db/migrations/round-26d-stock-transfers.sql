-- round-26d-stock-transfers.sql
-- Two-step warehouse-to-warehouse stock transfer engine.
--
-- initiate_stock_transfer  (owner/admin): consumes the requested quantities
--   FIFO out of the SOURCE warehouse's lots (same order as confirm_pos_sale:
--   received_at, created_at, id), writes negative 'transfer_out' movements,
--   and records a stock_transfers row in status 'in_transit' with one
--   stock_transfer_items row per consumed lot slice (pinning source_lot_id and
--   unit_cost_dop so cost rides along). REJECTS up front if the source lacks
--   enough stock for any line — all-or-nothing, no phantom inventory.
--
-- receive_stock_transfer  (owner/admin OR the destination warehouse's
--   distributor): for each item, creates a lot in the DESTINATION warehouse at
--   the carried unit_cost_dop, writes positive 'transfer_in' movements, and
--   flips the transfer to 'received' (received_at / received_by). Inventory
--   value is unchanged end to end — stock simply moves.
--
-- Money is untouched throughout (a transfer is not a sale). Conventions copied
-- from create_customer_quick (role via auth.uid(), 42501 on denial, SECURITY
-- DEFINER, search_path=public, jsonb return) and confirm_pos_sale (FIFO order,
-- movement signs: out = negative, in = positive).

-- ---------------------------------------------------------------------------
-- initiate_stock_transfer
-- ---------------------------------------------------------------------------
-- p_items: jsonb array of { product_id, qty }  (qty > 0)

create or replace function public.initiate_stock_transfer(
  p_from_warehouse_id uuid,
  p_to_warehouse_id uuid,
  p_items jsonb,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $sti$
declare
  v_me        uuid;
  v_role      user_role;
  v_transfer  uuid;
  v_item      jsonb;
  v_product   uuid;
  v_qty       numeric;
  v_available numeric;
  v_needed    numeric;
  v_lot       record;
  v_take      numeric;
begin
  select id, role into v_me, v_role
  from profiles where auth_user_id = auth.uid();
  if v_role is null or v_role not in ('owner','admin') then
    raise exception 'permission denied: only owner/admin can initiate transfers'
      using errcode = '42501';
  end if;

  if p_from_warehouse_id is null or p_to_warehouse_id is null then
    raise exception 'source and destination warehouses are required' using errcode = '22023';
  end if;
  if p_from_warehouse_id = p_to_warehouse_id then
    raise exception 'source and destination must be different' using errcode = '22023';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'at least one item is required' using errcode = '22023';
  end if;

  -- Pass 1: validate every line has enough stock in the source. Reject the
  -- whole transfer if any line is short (no partial / phantom inventory).
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_product := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'qty')::numeric;
    if v_product is null or v_qty is null or v_qty <= 0 then
      raise exception 'each item needs a product_id and qty > 0' using errcode = '22023';
    end if;
    select coalesce(sum(greatest(qty_remaining, 0)), 0) into v_available
    from inventory_lots
    where product_id = v_product and warehouse_id = p_from_warehouse_id;
    if v_available < v_qty then
      raise exception 'insufficient stock: product % has % in source, need %',
        v_product, v_available, v_qty using errcode = '22023';
    end if;
  end loop;

  -- Create the in_transit transfer header.
  insert into stock_transfers
    (from_warehouse_id, to_warehouse_id, status, initiated_at, initiated_by, notes)
  values
    (p_from_warehouse_id, p_to_warehouse_id, 'in_transit', now(), v_me, nullif(btrim(coalesce(p_notes,'')),''))
  returning id into v_transfer;

  -- Pass 2: consume FIFO and record one item row per lot slice.
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_product := (v_item->>'product_id')::uuid;
    v_needed := (v_item->>'qty')::numeric;

    for v_lot in
      select id, qty_remaining, unit_cost_dop
      from inventory_lots
      where product_id = v_product
        and warehouse_id = p_from_warehouse_id
        and qty_remaining > 0
      order by received_at asc, created_at asc, id asc
    loop
      exit when v_needed <= 0;
      v_take := least(v_needed, greatest(v_lot.qty_remaining, 0));
      if v_take <= 0 then continue; end if;

      update inventory_lots
        set qty_remaining = qty_remaining - v_take
      where id = v_lot.id;

      insert into stock_transfer_items
        (transfer_id, product_id, source_lot_id, qty, unit_cost_dop)
      values
        (v_transfer, v_product, v_lot.id, v_take, v_lot.unit_cost_dop);

      insert into stock_movements
        (product_id, warehouse_id, lot_id, kind, qty_delta, unit_cost_dop, transfer_id, occurred_at, created_by)
      values
        (v_product, p_from_warehouse_id, v_lot.id, 'transfer_out', -v_take, v_lot.unit_cost_dop, v_transfer, now(), v_me);

      v_needed := v_needed - v_take;
    end loop;

    -- Should never happen (pass 1 guaranteed availability), but guard anyway.
    if v_needed > 0 then
      raise exception 'insufficient stock during consume for product %', v_product using errcode = '22023';
    end if;
  end loop;

  return (select to_jsonb(t) from stock_transfers t where t.id = v_transfer);
end;
$sti$;

-- ---------------------------------------------------------------------------
-- receive_stock_transfer
-- ---------------------------------------------------------------------------

create or replace function public.receive_stock_transfer(
  p_transfer_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $srt$
declare
  v_me        uuid;
  v_role      user_role;
  v_t         record;
  v_is_dist   boolean;
  v_item      record;
  v_new_lot   uuid;
  v_lotnum    text;
begin
  select id, role into v_me, v_role
  from profiles where auth_user_id = auth.uid();
  if v_role is null then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  select * into v_t from stock_transfers where id = p_transfer_id;
  if not found then
    raise exception 'transfer not found' using errcode = '22023';
  end if;
  if v_t.status <> 'in_transit' then
    raise exception 'transfer is already %', v_t.status using errcode = '22023';
  end if;

  -- Allowed: owner/admin, OR the distributor who runs the destination warehouse.
  v_is_dist := exists (
    select 1 from warehouses w
    where w.id = v_t.to_warehouse_id and w.distributor_id = v_me
  );
  if v_role not in ('owner','admin') and not v_is_dist then
    raise exception 'permission denied: only owner/admin or the destination distributor can receive'
      using errcode = '42501';
  end if;

  -- Create destination lots at the carried cost + transfer_in movements.
  for v_item in
    select id, product_id, qty, unit_cost_dop
    from stock_transfer_items
    where transfer_id = p_transfer_id
  loop
    v_lotnum := 'XFER-' || left(p_transfer_id::text, 8) || '-' || left(v_item.id::text, 8);

    insert into inventory_lots
      (product_id, warehouse_id, lot_number, qty_received, qty_remaining, unit_cost_dop, received_at)
    values
      (v_item.product_id, v_t.to_warehouse_id, v_lotnum, v_item.qty, v_item.qty,
       coalesce(v_item.unit_cost_dop, 0), now())
    returning id into v_new_lot;

    insert into stock_movements
      (product_id, warehouse_id, lot_id, kind, qty_delta, unit_cost_dop, transfer_id, occurred_at, created_by)
    values
      (v_item.product_id, v_t.to_warehouse_id, v_new_lot, 'transfer_in', v_item.qty,
       coalesce(v_item.unit_cost_dop, 0), p_transfer_id, now(), v_me);
  end loop;

  update stock_transfers
     set status = 'received', received_at = now(), received_by = v_me
   where id = p_transfer_id;

  return (select to_jsonb(t) from stock_transfers t where t.id = p_transfer_id);
end;
$srt$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant execute on function public.initiate_stock_transfer(uuid, uuid, jsonb, text) to authenticated;
grant execute on function public.receive_stock_transfer(uuid) to authenticated;
