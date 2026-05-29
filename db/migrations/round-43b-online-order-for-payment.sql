-- round-43b-online-order-for-payment.sql
-- ONLINE CARD PAYMENTS — read helper.
--
-- The `sales` table is locked down (no direct read for storefront keys), so the
-- "create Stripe checkout" step can't read the order's amount with an outside key
-- — it hits "permission denied for table sales". This adds a narrow, read-only
-- SECURITY DEFINER function (runs as its owner, so it CAN read sales) that returns
-- ONLY what's needed to open a payment: the amount due, invoice, status, and
-- method. Same proven pattern as place_storefront_order / get_store_public_config.
--
-- Granted to anon + authenticated so the storefront (logged in or not) can call it.
-- Purely additive; safe to run.

create or replace function public.get_online_order_for_payment(p_sale_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
stable
as $function$
declare
  v public.sales%rowtype;
begin
  if p_sale_id is null then
    return jsonb_build_object('ok', false, 'error', 'no sale id');
  end if;

  select * into v from public.sales where id = p_sale_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not found');
  end if;

  return jsonb_build_object(
    'ok', true,
    'invoice_number', v.invoice_number,
    'status', v.status,
    'payment_method', v.payment_method,
    'amount_cents', coalesce(v.total_cents, 0) + coalesce(v.payment_fee_cents, 0)
  );
end;
$function$;

comment on function public.get_online_order_for_payment(uuid) is
  'Read-only: returns amount due + invoice/status/method for an online order, so '
  'the storefront can open a Stripe/PayPal checkout without direct (locked) access '
  'to the sales table or a service-role key.';

grant execute on function public.get_online_order_for_payment(uuid) to anon, authenticated;

-- ROLLBACK:
--   drop function if exists public.get_online_order_for_payment(uuid);
