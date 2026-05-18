-- ============================================================
-- Round 14b.2 - mark_complete
--
-- User-facing RPC: transition a purchase order from
-- received -> complete. The "fully done in the books" state.
--
-- Pure acknowledgment: no allocation math, no inserts, no
-- inputs beyond the order id. Per the spec, "complete" means
-- all ordered units arrived AND all transport is paid -
-- but transport is its own data path (14c), so this function
-- does NOT verify transport. The user takes responsibility
-- for marking an order complete only when they consider the
-- books closed on it.
--
-- Guards:
--   - order exists
--   - status is received (not earlier ladder rungs, not
--     terminal states)
-- ============================================================

create or replace function public.mark_complete(
  p_purchase_order_id uuid
) returns void
language plpgsql
as $func$
declare
  v_status public.purchase_status;
begin
  select status into v_status
    from public.purchase_orders
    where id = p_purchase_order_id;

  if not found then
    raise exception 'purchase order % not found', p_purchase_order_id;
  end if;

  if v_status <> 'received' then
    raise exception 'cannot mark complete: order % is in status %, expected received',
                    p_purchase_order_id, v_status;
  end if;

  update public.purchase_orders
    set status       = 'complete',
        completed_at = now(),
        updated_at   = now()
    where id = p_purchase_order_id;
end;
$func$;