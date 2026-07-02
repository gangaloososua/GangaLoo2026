-- round-82a-settle-zero-supplier-purchase.sql
--
-- Purchases: let a genuinely FREE purchase order (usd_total = 0, no payments)
-- move from 'pending' to 'paid_supplier' without recording a supplier payment.
--
-- Why: the normal payment path (_allocate_supplier_payment) hard-rejects
-- usd_subtotal = 0, and waive_supplier_remainder requires usd_total > 0 AND at
-- least one recorded payment. Neither fits an order that cost nothing but has
-- courier/transport allocated. This function advances the header status only --
-- NO ledger post, NO invented payment. Any allocated transport still lands as
-- the line's dop_unit_landed_cost at receive time (dop_transport_share).
--
-- Tightly guarded so it can only ever touch a genuinely free, unpaid, pending
-- order: owner-only, status must be pending, usd_total must be exactly 0, and
-- there must be zero rows in purchase_order_payments.
--
-- Applied live in Supabase SQL Editor; this file is the repo record.

CREATE OR REPLACE FUNCTION public.settle_zero_supplier_purchase(p_purchase_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role        user_role;
  v_status      purchase_status;
  v_usd_total   numeric(12,2);
  v_pay_count   int;
begin
  -- Owner only (mirrors waive_supplier_remainder).
  select role into v_role
    from public.profiles where auth_user_id = auth.uid();
  if v_role is null or v_role <> 'owner' then
    raise exception 'permission denied: only the owner can settle a zero-cost order'
      using errcode = '42501';
  end if;

  -- Lock the header and read what we need.
  select status, usd_total
    into v_status, v_usd_total
    from public.purchase_orders
    where id = p_purchase_order_id
    for update;
  if not found then
    raise exception 'purchase order % not found', p_purchase_order_id;
  end if;

  -- Guard 1: must be pending.
  if v_status <> 'pending' then
    raise exception 'cannot settle: order % is %, expected pending', p_purchase_order_id, v_status;
  end if;

  -- Guard 2: must be genuinely zero-cost.
  if coalesce(v_usd_total, 0) <> 0 then
    raise exception 'order % has a usd_total of %; use the normal Pay supplier flow', p_purchase_order_id, v_usd_total;
  end if;

  -- Guard 3: no payments should exist on a zero-cost order.
  select count(*) into v_pay_count
    from public.purchase_order_payments
    where purchase_order_id = p_purchase_order_id;
  if v_pay_count <> 0 then
    raise exception 'order % already has payments recorded; not a zero-cost order', p_purchase_order_id;
  end if;

  -- Advance to paid_supplier with NO ledger post and NO invented payment.
  update public.purchase_orders
    set status     = 'paid_supplier',
        updated_at = now()
    where id = p_purchase_order_id;

  return jsonb_build_object(
    'ok',        true,
    'usd_total', v_usd_total,
    'status',    'paid_supplier'
  );
end;
$function$;

grant execute on function public.settle_zero_supplier_purchase(uuid) to authenticated, service_role;
