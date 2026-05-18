-- ============================================================
-- Round 14b.2 - mark_cancelled
--
-- User-facing RPC: terminal transition to cancelled. Two flows:
--
--   1. From pending: nothing paid, nothing to refund. Pure
--      status flip + completed_at. All three refund inputs
--      must be null.
--
--   2. From paid_supplier: money was paid. Refund details
--      are OPTIONAL but bundled: all three or none.
--      - all three null: supplier kept the money (rare but
--        legal - "they ghosted, no refund coming")
--      - all three set: refund was received. Records the
--        amount, when, and into which money account.
--
-- "completed_at" is overloaded per spec: cancelled and lost
-- piggyback on this column because they're terminal states
-- without their own timestamp. derivedStatus in TS will
-- correctly compute "received" or "paid_supplier" from the
-- ladder timestamps and flag mismatch - that's the audit
-- panel doing its job, not a bug.
--
-- Refund amount > 0 (if provided) but NOT capped at
-- dop_paid_total: currency drift can legitimately produce
-- a higher DOP refund than original DOP payment.
-- ============================================================

create or replace function public.mark_cancelled(
  p_purchase_order_id  uuid,
  p_dop_refund_total   numeric     default null,
  p_refund_at_dop      timestamptz default null,
  p_refund_account_id  uuid        default null
) returns void
language plpgsql
as $func$
declare
  v_status         public.purchase_status;
  v_refund_count   integer;
begin
  -- Status lookup + cancellable check
  select status into v_status
    from public.purchase_orders
    where id = p_purchase_order_id;

  if not found then
    raise exception 'purchase order % not found', p_purchase_order_id;
  end if;

  if v_status not in ('pending', 'paid_supplier') then
    raise exception 'cannot cancel: order % is in status %, expected pending or paid_supplier',
                    p_purchase_order_id, v_status;
  end if;

  -- "All three or none" rule for refund inputs
  v_refund_count :=
    (case when p_dop_refund_total  is not null then 1 else 0 end)
  + (case when p_refund_at_dop     is not null then 1 else 0 end)
  + (case when p_refund_account_id is not null then 1 else 0 end);

  if v_refund_count not in (0, 3) then
    raise exception 'refund inputs must be all-null or all-set (got % of 3)', v_refund_count;
  end if;

  -- Refund-on-pending refused
  if v_refund_count = 3 and v_status = 'pending' then
    raise exception 'cannot record refund: order % is in status pending, no payment was made',
                    p_purchase_order_id;
  end if;

  -- Refund amount validation
  if p_dop_refund_total is not null and p_dop_refund_total <= 0 then
    raise exception 'dop_refund_total must be > 0 (got %)', p_dop_refund_total;
  end if;

  -- Status flip + optional refund record. Done in one UPDATE so
  -- partial writes are impossible.
  update public.purchase_orders
    set status            = 'cancelled',
        completed_at      = now(),
        dop_refund_total  = p_dop_refund_total,
        refund_at_dop     = p_refund_at_dop,
        refund_account_id = p_refund_account_id,
        updated_at        = now()
    where id = p_purchase_order_id;
end;
$func$;