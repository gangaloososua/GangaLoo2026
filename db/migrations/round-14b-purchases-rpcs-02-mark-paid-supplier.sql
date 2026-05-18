-- ============================================================
-- Round 14b.2 - mark_paid_supplier
--
-- User-facing RPC: transition a purchase order from 'pending'
-- to 'paid_supplier' by recording a supplier payment.
--
-- Thin wrapper around _allocate_supplier_payment with:
--   - status guard (must be 'pending')
--   - input validation (amounts > 0)
--   - paid_at_dop defaults to now()
--
-- The actual allocation math lives in the helper. This RPC
-- adds the user-facing contract: refuse to re-pay an
-- already-paid order. Editing a wrong payment is a separate
-- (future) RPC, not this one.
--
-- Out of scope: editing an existing payment. That belongs to
-- a future edit_supplier_payment RPC that reuses the same
-- _allocate_supplier_payment helper.
-- ============================================================

create or replace function public.mark_paid_supplier(
  p_purchase_order_id           uuid,
  p_dop_paid_total              numeric,
  p_exchange_rate               numeric,
  p_official_rate_at_payment    numeric,
  p_supplier_payment_account_id uuid,
  p_paid_at_dop                 timestamptz default now()
) returns void
language plpgsql
as $func$
declare
  v_status public.purchase_status;
begin
  -- Input validation
  if p_dop_paid_total is null or p_dop_paid_total <= 0 then
    raise exception 'dop_paid_total must be > 0 (got %)', p_dop_paid_total;
  end if;
  if p_exchange_rate is null or p_exchange_rate <= 0 then
    raise exception 'exchange_rate must be > 0 (got %)', p_exchange_rate;
  end if;

  -- Status guard - must be pending
  select status into v_status
    from public.purchase_orders
    where id = p_purchase_order_id;

  if not found then
    raise exception 'purchase order % not found', p_purchase_order_id;
  end if;

  if v_status <> 'pending' then
    raise exception 'cannot mark paid: order % is in status %, expected pending',
                    p_purchase_order_id, v_status;
  end if;

  -- Delegate to the shared allocation helper
  perform public._allocate_supplier_payment(
    p_purchase_order_id,
    p_dop_paid_total,
    p_exchange_rate,
    p_official_rate_at_payment,
    p_supplier_payment_account_id,
    p_paid_at_dop
  );
end;
$func$;