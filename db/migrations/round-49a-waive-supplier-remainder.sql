-- Round 49a: Waive the remaining balance on a partly-paid purchase order.
-- Owner-only. Forgives the uncovered USD sliver and finalizes using the pesos
-- actually paid, via the same path as a fully-covered order (no invented
-- payment, no extra ledger line). Test with BEGIN/ROLLBACK first.

create or replace function public.waive_supplier_remainder(
  p_purchase_order_id uuid
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_role          user_role;
  v_profile_id    uuid;
  v_status        purchase_status;
  v_usd_total     numeric(12,2);
  v_usd_covered   numeric(14,4);
  v_usd_remaining numeric(14,4);
  v_total_dop     numeric(14,2);
  v_blended_rate  numeric(14,6);
  v_pay_count     int;
  v_account_id    uuid;
  v_official_rate numeric;
  v_paid_at       timestamptz;
begin
  select id, role into v_profile_id, v_role
    from public.profiles where auth_user_id = auth.uid();
  if v_role is null or v_role <> 'owner' then
    raise exception 'permission denied: only the owner can waive a remaining balance'
      using errcode = '42501';
  end if;

  select status, usd_total
    into v_status, v_usd_total
    from public.purchase_orders
    where id = p_purchase_order_id
    for update;
  if not found then
    raise exception 'purchase order % not found', p_purchase_order_id;
  end if;
  if v_status <> 'pending' then
    raise exception 'cannot waive: order % is %, expected pending', p_purchase_order_id, v_status;
  end if;
  if coalesce(v_usd_total, 0) <= 0 then
    raise exception 'order % has no usd_total; nothing to settle', p_purchase_order_id;
  end if;

  select count(*),
         coalesce(sum(usd_covered), 0),
         coalesce(sum(dop_amount_cents), 0) / 100.0
    into v_pay_count, v_usd_covered, v_total_dop
    from public.purchase_order_payments
    where purchase_order_id = p_purchase_order_id;
  if v_pay_count = 0 then
    raise exception 'cannot waive: order % has no payments recorded yet', p_purchase_order_id;
  end if;

  v_usd_remaining := round(v_usd_total - v_usd_covered, 2);
  if v_usd_remaining <= 0.005 then
    raise exception 'nothing to waive: order % is already fully covered', p_purchase_order_id;
  end if;

  select money_account_id, official_rate_at_payment, paid_at
    into v_account_id, v_official_rate, v_paid_at
    from public.purchase_order_payments
    where purchase_order_id = p_purchase_order_id
    order by paid_at desc, created_at desc
    limit 1;

  v_blended_rate := round(v_total_dop / v_usd_total, 6);

  perform public._allocate_supplier_payment(
    p_purchase_order_id,
    v_total_dop,
    v_blended_rate,
    v_official_rate,
    v_account_id,
    coalesce(v_paid_at, now()),
    null
  );

  return jsonb_build_object(
    'ok',          true,
    'usd_total',   v_usd_total,
    'usd_covered', v_usd_covered,
    'usd_waived',  v_usd_remaining,
    'total_dop',   v_total_dop,
    'status',      'paid_supplier'
  );
end;
$function$;

grant execute on function public.waive_supplier_remainder(uuid) to authenticated;
