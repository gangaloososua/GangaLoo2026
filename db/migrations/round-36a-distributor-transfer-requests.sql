-- round-36a-distributor-transfer-requests.sql
-- Adds the "request" + "approve / decline" steps in FRONT of the existing
-- stock-transfer pipeline. The existing initiate/ship logic and the existing
-- receive_stock_transfer logic are NOT touched.
--
-- stock_transfers.status (free text) gains three new values:
--   'requested'  - parked request, no stock has moved
--   'rejected'   - owner/admin declined the request (no stock moved)
--   'cancelled'  - the requesting distributor withdrew it (no stock moved)
-- The existing values 'in_transit' and 'received' keep their exact meaning.
--
-- Flow:
--   request_stock_transfer  -> creates a 'requested' transfer (no stock moves)
--   approve_stock_transfer  -> ships approved items (stock OUT of source,
--                              status -> 'in_transit'); reuses the same FIFO
--                              stock-out logic as initiate_stock_transfer
--   receive_stock_transfer  -> UNCHANGED existing function adds stock at the
--                              destination and sets status -> 'received'

begin;

-- 1) New header columns to record the REQUEST, kept separate from the ship
--    (initiated_*) and the receive (received_*) so each stage is auditable.
alter table public.stock_transfers
  add column if not exists requested_by uuid references public.profiles(id),
  add column if not exists requested_at timestamptz,
  add column if not exists status_note  text;

-- 2) Companion table: what the distributor ASKED for, before anything ships.
--    Kept separate from stock_transfer_items, which records the ACTUAL
--    lot-by-lot stock that ships at approval time.
create table if not exists public.stock_transfer_requested_items (
  id          uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references public.stock_transfers(id) on delete cascade,
  product_id  uuid not null,
  qty         numeric not null check (qty > 0),
  created_at  timestamptz not null default now()
);

create index if not exists stock_transfer_requested_items_transfer_idx
  on public.stock_transfer_requested_items (transfer_id);

-- All access flows through the SECURITY DEFINER functions below (same pattern
-- as store_config). RLS on, no direct client policies.
alter table public.stock_transfer_requested_items enable row level security;

-- 3) request_stock_transfer: a distributor (or owner/admin) parks a request.
--    NO stock moves. A non-owner/admin caller must be the distributor assigned
--    to one of the two warehouses involved (their own warehouse on one side).
create or replace function public.request_stock_transfer(
  p_from_warehouse_id uuid,
  p_to_warehouse_id   uuid,
  p_items             jsonb,
  p_notes             text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_me        uuid;
  v_role      user_role;
  v_transfer  uuid;
  v_item      jsonb;
  v_product   uuid;
  v_qty       numeric;
  v_owns_side boolean;
begin
  select id, role into v_me, v_role
  from profiles where auth_user_id = auth.uid();
  if v_me is null then
    raise exception 'permission denied' using errcode = '42501';
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

  -- Permission: owner/admin may request any direction. Anyone else must be the
  -- distributor assigned to one of the two warehouses involved.
  if v_role not in ('owner','admin') then
    v_owns_side := exists (
      select 1 from warehouses w
      where w.distributor_id = v_me
        and w.id in (p_from_warehouse_id, p_to_warehouse_id)
    );
    if not v_owns_side then
      raise exception 'permission denied: you can only request transfers involving your own warehouse'
        using errcode = '42501';
    end if;
  end if;

  -- Validate the shape of every requested line.
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_product := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'qty')::numeric;
    if v_product is null or v_qty is null or v_qty <= 0 then
      raise exception 'each item needs a product_id and qty > 0' using errcode = '22023';
    end if;
  end loop;

  -- Create the parked request header (no stock moves).
  insert into stock_transfers
    (from_warehouse_id, to_warehouse_id, status, requested_at, requested_by, notes)
  values
    (p_from_warehouse_id, p_to_warehouse_id, 'requested', now(), v_me,
     nullif(btrim(coalesce(p_notes,'')),''))
  returning id into v_transfer;

  -- Store the requested lines.
  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into stock_transfer_requested_items (transfer_id, product_id, qty)
    values (v_transfer, (v_item->>'product_id')::uuid, (v_item->>'qty')::numeric);
  end loop;

  return (select to_jsonb(t) from stock_transfers t where t.id = v_transfer);
end;
$function$;

-- 4) approve_stock_transfer: owner/admin approves some or all of a request.
--    This is the SHIP step. It reuses the exact FIFO stock-out logic from
--    initiate_stock_transfer, then flips the request to 'in_transit'.
--    Partial approval = pass fewer lines / smaller quantities in p_items.
create or replace function public.approve_stock_transfer(
  p_transfer_id uuid,
  p_items       jsonb,
  p_note        text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_me        uuid;
  v_role      user_role;
  v_t         record;
  v_item      jsonb;
  v_product   uuid;
  v_qty       numeric;
  v_requested numeric;
  v_available numeric;
  v_needed    numeric;
  v_lot       record;
  v_take      numeric;
begin
  select id, role into v_me, v_role
  from profiles where auth_user_id = auth.uid();
  if v_role is null or v_role not in ('owner','admin') then
    raise exception 'permission denied: only owner/admin can approve transfers'
      using errcode = '42501';
  end if;

  select * into v_t from stock_transfers where id = p_transfer_id;
  if not found then
    raise exception 'transfer not found' using errcode = '22023';
  end if;
  if v_t.status <> 'requested' then
    raise exception 'transfer is % and can no longer be approved', v_t.status using errcode = '22023';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'approve at least one item, or decline the request instead' using errcode = '22023';
  end if;

  -- Pass 1: validate each approved line is within what was requested AND has
  -- enough stock in the source. Reject the whole approval if any line fails.
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_product := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'qty')::numeric;
    if v_product is null or v_qty is null or v_qty <= 0 then
      raise exception 'each approved item needs a product_id and qty > 0' using errcode = '22023';
    end if;

    select coalesce(sum(qty), 0) into v_requested
    from stock_transfer_requested_items
    where transfer_id = p_transfer_id and product_id = v_product;
    if v_requested <= 0 then
      raise exception 'product % was not part of this request', v_product using errcode = '22023';
    end if;
    if v_qty > v_requested then
      raise exception 'approved qty % exceeds requested % for product %', v_qty, v_requested, v_product
        using errcode = '22023';
    end if;

    select coalesce(sum(greatest(qty_remaining, 0)), 0) into v_available
    from inventory_lots
    where product_id = v_product and warehouse_id = v_t.from_warehouse_id;
    if v_available < v_qty then
      raise exception 'insufficient stock: product % has % in source, need %',
        v_product, v_available, v_qty using errcode = '22023';
    end if;
  end loop;

  -- Pass 2: consume FIFO and record one item row per lot slice (mirrors
  -- initiate_stock_transfer exactly).
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_product := (v_item->>'product_id')::uuid;
    v_needed := (v_item->>'qty')::numeric;

    for v_lot in
      select id, qty_remaining, unit_cost_dop
      from inventory_lots
      where product_id = v_product
        and warehouse_id = v_t.from_warehouse_id
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
        (p_transfer_id, v_product, v_lot.id, v_take, v_lot.unit_cost_dop);

      insert into stock_movements
        (product_id, warehouse_id, lot_id, kind, qty_delta, unit_cost_dop, transfer_id, occurred_at, created_by)
      values
        (v_product, v_t.from_warehouse_id, v_lot.id, 'transfer_out', -v_take, v_lot.unit_cost_dop, p_transfer_id, now(), v_me);

      v_needed := v_needed - v_take;
    end loop;

    -- Should never happen (pass 1 guaranteed availability), but guard anyway.
    if v_needed > 0 then
      raise exception 'insufficient stock during consume for product %', v_product using errcode = '22023';
    end if;
  end loop;

  -- Flip to in_transit (the ship moment) and record who approved.
  update stock_transfers
     set status       = 'in_transit',
         initiated_at = now(),
         initiated_by = v_me,
         status_note  = nullif(btrim(coalesce(p_note,'')),'')
   where id = p_transfer_id;

  return (select to_jsonb(t) from stock_transfers t where t.id = p_transfer_id);
end;
$function$;

-- 5) decline_stock_transfer: owner/admin declines, OR the requesting
--    distributor withdraws their own request. NO stock moves. Status must
--    still be 'requested'.
create or replace function public.decline_stock_transfer(
  p_transfer_id uuid,
  p_reason      text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_me   uuid;
  v_role user_role;
  v_t    record;
  v_new  text;
begin
  select id, role into v_me, v_role
  from profiles where auth_user_id = auth.uid();
  if v_me is null then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  select * into v_t from stock_transfers where id = p_transfer_id;
  if not found then
    raise exception 'transfer not found' using errcode = '22023';
  end if;
  if v_t.status <> 'requested' then
    raise exception 'transfer is % and can no longer be declined', v_t.status using errcode = '22023';
  end if;

  -- owner/admin -> 'rejected'; the requester withdrawing -> 'cancelled'.
  if v_role in ('owner','admin') then
    v_new := 'rejected';
  elsif v_t.requested_by = v_me then
    v_new := 'cancelled';
  else
    raise exception 'permission denied: only owner/admin or the requester can decline'
      using errcode = '42501';
  end if;

  update stock_transfers
     set status      = v_new,
         status_note = nullif(btrim(coalesce(p_reason,'')),'')
   where id = p_transfer_id;

  return (select to_jsonb(t) from stock_transfers t where t.id = p_transfer_id);
end;
$function$;

grant execute on function public.request_stock_transfer(uuid, uuid, jsonb, text) to authenticated;
grant execute on function public.approve_stock_transfer(uuid, jsonb, text) to authenticated;
grant execute on function public.decline_stock_transfer(uuid, text) to authenticated;

commit;
