-- Round 14b.2 - mark_lost
--
-- User-facing RPC: transition a purchase order from
-- received -> lost. Used when some ordered units never
-- arrived (shipping loss, theft, miscount) and the user
-- has decided to write off the missing units rather than
-- wait any longer.
--
-- Auto-detected loss: for each line, loss = ordered - received.
-- The missing units were already implicitly "marked lost" by
-- mark_received not creating lots for them. This RPC closes
-- the books on the order and recomputes cost basis so the
-- surviving units carry the full line cost.
--
-- Cost-basis recomputation per line (where received < ordered):
--   new_unit_cost = old_unit_cost * (ordered / received)
--   - Update purchase_order_items.dop_unit_landed_cost
--   - Update inventory_lots.unit_cost_dop WHERE
--     qty_remaining > 0. Already-consumed lots keep their
--     original cost - booked sale cogs are immutable.
--
-- Edge cases skipped silently:
--   - received = ordered: no loss, nothing to recompute
--   - received = 0: no surviving units to absorb cost,
--     and no lots exist (would divide by zero)
--   - dop_unit_landed_cost is null: can't multiply null
--
-- Guards:
--   - order exists
--   - status is received
-- ============================================================
create or replace function public.mark_lost(
  p_purchase_order_id uuid
) returns void
language plpgsql
as $func$
declare
  v_status   public.purchase_status;
  r          record;
  v_received numeric;
  v_new_cost numeric;
begin
  select status into v_status
    from public.purchase_orders
    where id = p_purchase_order_id;
  if not found then
    raise exception 'purchase order % not found', p_purchase_order_id;
  end if;
  if v_status <> 'received' then
    raise exception 'cannot mark lost: order % is in status %, expected received',
                    p_purchase_order_id, v_status;
  end if;

  for r in
    select id, qty, dop_unit_landed_cost
      from public.purchase_order_items
      where purchase_order_id = p_purchase_order_id
  loop
    select coalesce(sum(qty_received), 0)
      into v_received
      from public.inventory_lots
      where purchase_order_item_id = r.id;

    if v_received = r.qty or v_received = 0 then
      continue;
    end if;
    if r.dop_unit_landed_cost is null then
      continue;
    end if;

    v_new_cost := r.dop_unit_landed_cost * (r.qty / v_received);

    update public.purchase_order_items
      set dop_unit_landed_cost = v_new_cost
      where id = r.id;

    update public.inventory_lots
      set unit_cost_dop = v_new_cost
      where purchase_order_item_id = r.id
        and qty_remaining > 0;
  end loop;

  update public.purchase_orders
    set status       = 'lost',
        completed_at = now(),
        updated_at   = now()
    where id = p_purchase_order_id;
end;
$func$;