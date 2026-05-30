-- round-43d-online-order-status.sql
-- The thank-you page needs to read an order's status to show "confirmed", but
-- the sales table is locked down (direct reads are denied). This adds a narrow,
-- read-only SECURITY DEFINER function that returns just the status + amount for a
-- given invoice number — same proven pattern as get_online_order_for_payment.
-- Granted to anon so the public thank-you page can call it. Additive/safe.

create or replace function public.get_online_order_status_by_invoice(p_invoice text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
stable
as $function$
declare
  v public.sales%rowtype;
begin
  if coalesce(p_invoice, '') = '' then
    return jsonb_build_object('ok', false);
  end if;

  select * into v from public.sales where invoice_number = p_invoice limit 1;
  if not found then
    return jsonb_build_object('ok', false);
  end if;

  return jsonb_build_object(
    'ok', true,
    'status', v.status,
    'invoice_number', v.invoice_number,
    'amount_cents', coalesce(v.total_cents, 0) + coalesce(v.payment_fee_cents, 0)
  );
end;
$function$;

comment on function public.get_online_order_status_by_invoice(text) is
  'Read-only order status + amount by invoice, for the public thank-you page. '
  'SECURITY DEFINER so it works without direct (locked) sales access.';

grant execute on function public.get_online_order_status_by_invoice(text) to anon, authenticated;

-- ROLLBACK:
--   drop function if exists public.get_online_order_status_by_invoice(text);
