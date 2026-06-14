-- round-72c-get-us-order-for-payment.sql
-- US dropship shop: SECURITY DEFINER reader so public payment actions can read
-- a US order's authoritative amount + status (the us_orders table is locked down).
-- Mirrors get_online_order_for_payment for the DR flow.

create or replace function public.get_us_order_for_payment(p_order_id uuid)
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
    return jsonb_build_object('ok', false);
  end if;

  return jsonb_build_object(
    'ok', true,
    'order_id', v_row.id,
    'status', v_row.status,
    'payment_method', v_row.payment_method,
    'total_usd', v_row.total_usd,
    'customer_name', v_row.customer_name,
    'customer_email', v_row.customer_email
  );
end;
$FN$;

grant execute on function public.get_us_order_for_payment(uuid) to anon, authenticated;
