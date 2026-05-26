-- round-38a — edit_pending_purchase_costs
--
-- Lets staff correct the USD shipping / tax / discount on a PENDING purchase
-- order. usd_total is a generated column
--   (usd_subtotal + usd_shipping + usd_tax - usd_discount)
-- so we only write the three inputs; the total recomputes itself.
--
-- HARD GUARD: only 'pending' orders may be edited. Once an order is paid or
-- received, its money/landed-cost math has already run, so changing the
-- header here is refused (a later, separate flow handles those).

create or replace function public.edit_pending_purchase_costs(
  p_purchase_order_id uuid,
  p_usd_shipping      numeric,
  p_usd_tax           numeric,
  p_usd_discount      numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_status public.purchase_status;
begin
  -- Caller must be staff (non-customer).
  if not exists (
    select 1 from public.profiles p
    where p.auth_user_id = auth.uid() and p.role <> 'customer'
  ) then
    raise exception 'not authorized';
  end if;

  -- Validate amounts.
  if coalesce(p_usd_shipping, 0) < 0
     or coalesce(p_usd_tax, 0) < 0
     or coalesce(p_usd_discount, 0) < 0 then
    raise exception 'shipping, tax and discount must be >= 0';
  end if;

  -- Status guard — pending only.
  select status into v_status
    from public.purchase_orders
    where id = p_purchase_order_id;

  if not found then
    raise exception 'purchase order % not found', p_purchase_order_id;
  end if;

  if v_status <> 'pending' then
    raise exception
      'cannot edit costs: order is in status %, only pending orders can be edited here',
      v_status;
  end if;

  update public.purchase_orders
    set usd_shipping = coalesce(p_usd_shipping, 0),
        usd_tax      = coalesce(p_usd_tax, 0),
        usd_discount = coalesce(p_usd_discount, 0),
        updated_at   = now()
    where id = p_purchase_order_id;
end;
$function$;

grant execute on function public.edit_pending_purchase_costs(uuid, numeric, numeric, numeric) to authenticated;
