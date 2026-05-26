-- round-38b — recompute_po_transport  (v2, "add on top" model)
--
-- Pushes a purchase order's already-recorded courier/transport (the sum of its
-- courier_payment_allocations) DOWN into each line's per-unit cost — for
-- migrated orders whose allocations were inserted directly, bypassing
-- create_courier_payment() (so "+ Transport" shows "—").
--
-- WHY NOT REBUILD FROM COMPONENTS: investigation showed migrated
-- dop_unit_landed_cost values do NOT equal base + bank + transport (the
-- component fields are inconsistent / payment data is null). So we must NOT
-- recompute landed cost from scratch (that would destroy the trusted migrated
-- figure). Instead we ADD the per-unit transport share on top of the existing
-- landed cost.
--
-- PER-UNIT: dop_unit_landed_cost is per single unit (confirmed). Share is
-- (total transport / total units); we add that to each unit's landed cost and
-- store dop_transport_share = share * qty.
--
-- IDEMPOTENT / SAFE RE-RUN: only processes lines where dop_transport_share IS
-- NULL. A line that already has a share is left untouched, so running twice
-- never double-charges.
--
-- SOLD-STOCK SAFETY: inventory_lots updated ONLY where qty_remaining > 0.
-- Consumed (sold) stock keeps its historical cost; past sale COGS is never
-- rewritten.
--
-- HISTORY: the one-time backfill of 74 migrated orders (round-38b session) was
-- run as direct SQL in the editor (service role), because the staff auth guard
-- below blocks the SQL editor (auth.uid() is null there) and there is no UI
-- button wired to this function. This function is kept as a documented,
-- reusable tool for future single-order transport recomputes (e.g. if wired to
-- a button later). The math here is identical to what that backfill ran.

create or replace function public.recompute_po_transport(p_purchase_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_total_transport_dop numeric;
  v_total_units         numeric;
  v_per_unit_share      numeric;
begin
  -- Caller must be staff (non-customer).
  if not exists (
    select 1 from public.profiles p
    where p.auth_user_id = auth.uid() and p.role <> 'customer'
  ) then
    raise exception 'not authorized';
  end if;

  if not exists (select 1 from public.purchase_orders where id = p_purchase_order_id) then
    raise exception 'purchase order % not found', p_purchase_order_id;
  end if;

  -- Total transport recorded against this order.
  select coalesce(sum(amount_dop), 0)
    into v_total_transport_dop
    from public.courier_payment_allocations
    where purchase_order_id = p_purchase_order_id;

  if v_total_transport_dop = 0 then
    raise exception 'PO % has no transport allocations to spread', p_purchase_order_id;
  end if;

  -- Total ordered units (ALL lines, so the per-unit share matches how
  -- create_courier_payment divides it).
  select coalesce(sum(qty), 0)
    into v_total_units
    from public.purchase_order_items
    where purchase_order_id = p_purchase_order_id;

  if v_total_units = 0 then
    raise exception 'PO % has zero ordered units; cannot allocate transport', p_purchase_order_id;
  end if;

  v_per_unit_share := round(v_total_transport_dop / v_total_units, 4);

  -- ADD the share on top of the existing landed cost. Only lines that have NOT
  -- already had transport applied (dop_transport_share IS NULL).
  update public.purchase_order_items
    set dop_transport_share = round(v_per_unit_share * qty, 4),
        dop_unit_landed_cost = round(coalesce(dop_unit_landed_cost, 0) + v_per_unit_share, 4)
    where purchase_order_id = p_purchase_order_id
      and dop_transport_share is null;

  -- Sync on-hand lots to the new landed cost (sold stock untouched).
  update public.inventory_lots il
    set unit_cost_dop = poi.dop_unit_landed_cost
    from public.purchase_order_items poi
    where il.purchase_order_item_id = poi.id
      and poi.purchase_order_id = p_purchase_order_id
      and coalesce(il.qty_remaining, 0) > 0;
end;
$function$;

grant execute on function public.recompute_po_transport(uuid) to authenticated;
