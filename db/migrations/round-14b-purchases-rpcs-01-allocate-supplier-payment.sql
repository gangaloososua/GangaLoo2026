-- ============================================================
-- Round 14b.0.rpcs - _allocate_supplier_payment
--
-- Shared internal helper used by:
--   - mark_paid_supplier (transition pending -> paid_supplier)
--   - create_purchase_order (when called with inline payment)
--
-- Atomic update of:
--   1. purchase_orders header: payment fields + status flip
--   2. purchase_order_items: per-line DOP cost allocation
--
-- Math (see chat for derivation against the old-system
-- screenshot):
--   header.dop_bank_fee     = dop_paid_total - usd_total * rate
--   line.dop_unit_cost_base = usd_unit_cost * rate
--   line.dop_bank_share     = ((usd_line_total / usd_subtotal)
--                              * dop_paid_total
--                              - usd_line_total * rate) / qty
--   line.dop_unit_landed_cost = base + bank_share
--                                + COALESCE(transport_share, 0)
--
-- Distribution denominator is usd_subtotal (sum of line
-- totals), NOT usd_total - shipping/tax/discount are header
-- adjustments that shift the total DOP paid, but the
-- proportional share across lines is by raw line USD value.
-- This matches the old-system behaviour verified against
-- LOT-1929 / a two-line Aliafee order.
--
-- dop_bank_share can be NEGATIVE if the bank charged less
-- DOP than the naive (usd_total * rate) predicts. Rare but
-- legal. No clamp.
--
-- Transport share is left untouched. dop_unit_landed_cost
-- uses the current dop_transport_share value (null treated
-- as 0). If transport is added later via 14c, the landed
-- cost recomputes there.
--
-- Idempotent if called twice with same inputs: results
-- identical. Idempotent if called twice with DIFFERENT
-- inputs: second call overwrites first - the function does
-- NOT check the current status, so it can be used to fix a
-- bad payment entry without a separate "edit payment" path.
-- Application is expected to gate by status (only allow
-- from pending) but the helper itself is permissive.
-- ============================================================

create or replace function public._allocate_supplier_payment(
  p_purchase_order_id          uuid,
  p_dop_paid_total             numeric,
  p_exchange_rate              numeric,
  p_official_rate_at_payment   numeric,
  p_supplier_payment_account_id uuid,
  p_paid_at_dop                timestamptz
) returns void
language plpgsql
as $func$
declare
  v_usd_subtotal numeric(12,2);
  v_usd_total    numeric(12,2);
  v_dop_bank_fee numeric(12,2);
begin
  -- Pull the header values we need for the math
  select usd_subtotal, usd_total
    into v_usd_subtotal, v_usd_total
    from public.purchase_orders
    where id = p_purchase_order_id;

  if not found then
    raise exception 'purchase order % not found', p_purchase_order_id;
  end if;

  if v_usd_subtotal = 0 then
    raise exception 'purchase order % has usd_subtotal = 0; cannot allocate', p_purchase_order_id;
  end if;

  -- Derived: bank fee = what bank charged minus naive prediction
  v_dop_bank_fee := p_dop_paid_total - (v_usd_total * p_exchange_rate);

  -- Update header
  update public.purchase_orders
    set dop_paid_total              = p_dop_paid_total,
        exchange_rate               = p_exchange_rate,
        official_rate_at_payment    = p_official_rate_at_payment,
        dop_bank_fee                = v_dop_bank_fee,
        supplier_payment_account_id = p_supplier_payment_account_id,
        paid_at_dop                 = p_paid_at_dop,
        status                      = 'paid_supplier',
        updated_at                  = now()
    where id = p_purchase_order_id;

  -- Update each line's DOP allocation
  update public.purchase_order_items poi
    set dop_unit_cost_base   = poi.usd_unit_cost * p_exchange_rate,
        dop_bank_share       = (
          (poi.usd_line_total / v_usd_subtotal) * p_dop_paid_total
          - poi.usd_line_total * p_exchange_rate
        ) / poi.qty,
        dop_unit_landed_cost = (poi.usd_unit_cost * p_exchange_rate)
                             + (
                                 (poi.usd_line_total / v_usd_subtotal) * p_dop_paid_total
                                 - poi.usd_line_total * p_exchange_rate
                               ) / poi.qty
                             + coalesce(poi.dop_transport_share, 0)
    where poi.purchase_order_id = p_purchase_order_id;
end;
$func$;