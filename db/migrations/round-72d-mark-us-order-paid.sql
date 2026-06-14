-- round-72d-mark-us-order-paid.sql
-- US dropship shop: mark a US order paid (called by Stripe webhook / PayPal return).
-- Idempotent. NOT granted to anon/authenticated — service-role only.

create or replace function public.mark_us_order_paid(
  p_order_id uuid,
  p_method   text,
  p_ref      text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $FN$
declare
  v_row public.us_orders%rowtype;
begin
  select * into v_row from public.us_orders where id = p_order_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;

  if v_row.status = 'paid' then
    return jsonb_build_object('ok', true, 'already', true, 'order_id', v_row.id);
  end if;

  update public.us_orders
     set status         = 'paid',
         paid_at        = now(),
         payment_method = coalesce(nullif(trim(p_method), ''), payment_method),
         payment_ref    = coalesce(nullif(trim(p_ref), ''), payment_ref),
         timeline       = timeline || jsonb_build_array(
                            jsonb_build_object('label','paid','ts', now(), 'method', p_method)
                          )
   where id = p_order_id;

  return jsonb_build_object('ok', true, 'already', false, 'order_id', p_order_id);
end;
$FN$;

revoke all on function public.mark_us_order_paid(uuid, text, text) from public, anon, authenticated;
grant execute on function public.mark_us_order_paid(uuid, text, text) to service_role;
