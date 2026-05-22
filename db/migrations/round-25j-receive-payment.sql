-- Round 25j - Recibir Pago (multi-invoice payment receiver)
--
-- Owner-gated WRITE function. Takes one deposit (account, method, date,
-- reference) and a JSON array of allocations [{sale_id, amount_cents}], and
-- atomically:
--   1. creates ONE payment_receipts row for the whole deposit,
--   2. for each allocation: inserts a sale_payments row carrying receipt_id,
--      posts it to the ledger via post_sale_payment_to_ledger (category
--      "Shop Sales", business scope, account credited once per allocation),
--      and recomputes that sale's paid_cents + status,
--   3. returns {receipt_id, deposit_cents, invoices_paid}.
--
-- The deposit equals the sum of allocations (the screen enforces "allocated =
-- received" before calling). Booking matches confirm_pos_sale exactly so a
-- later payment is indistinguishable from a POS payment in the books. This
-- also closes the gap where the per-invoice recordPayment path never posted
-- payments to the account ledger.
--
-- Money in CENTS. SECURITY DEFINER + explicit owner check (mirrors
-- set_account_opening). post_sale_payment_to_ledger has no gate of its own by
-- design (it's only ever called from inside an already-gated sale function),
-- so the owner check here is what protects it.

create or replace function public.receive_payment(
  p_money_account_id uuid,
  p_method text,
  p_received_at timestamptz,
  p_reference text,
  p_allocations jsonb   -- array of { "sale_id": uuid, "amount_cents": int }
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $rp$
declare
  v_user_profile_id uuid;
  v_is_owner boolean;
  v_shop_sales_category_id constant uuid := '870f61ba-ac8c-47bf-9ed0-52e935a78136';
  v_total_alloc bigint := 0;
  v_deposit bigint;
  v_customer_id uuid;
  v_receipt_id uuid;
  v_alloc jsonb;
  v_sale_id uuid;
  v_amount bigint;
  v_sale record;
  v_pay_id uuid;
  v_new_paid bigint;
  v_new_status text;
  v_count int := 0;
begin
  select p.id,
         exists (select 1 from profiles where auth_user_id = auth.uid() and role = 'owner')
    into v_user_profile_id, v_is_owner
  from profiles p
  where p.auth_user_id = auth.uid();

  if not coalesce(v_is_owner, false) then
    raise exception 'not authorized';
  end if;

  if p_money_account_id is null then raise exception 'money account is required'; end if;
  if p_allocations is null or jsonb_array_length(p_allocations) = 0 then
    raise exception 'no allocations provided';
  end if;

  for v_alloc in select * from jsonb_array_elements(p_allocations) loop
    v_amount := (v_alloc->>'amount_cents')::bigint;
    if v_amount is null or v_amount <= 0 then
      raise exception 'each allocation amount must be greater than zero';
    end if;
    v_total_alloc := v_total_alloc + v_amount;
  end loop;
  v_deposit := v_total_alloc;

  select customer_id into v_customer_id
  from sales
  where id = ((p_allocations->0)->>'sale_id')::uuid;

  insert into payment_receipts (customer_id, money_account_id, method, amount_cents, received_at, reference)
  values (v_customer_id, p_money_account_id, p_method::payment_method, v_deposit,
          coalesce(p_received_at, now()), nullif(btrim(p_reference), ''))
  returning id into v_receipt_id;

  for v_alloc in select * from jsonb_array_elements(p_allocations) loop
    v_sale_id := (v_alloc->>'sale_id')::uuid;
    v_amount  := (v_alloc->>'amount_cents')::bigint;

    select id, status, total_cents, paid_cents, paid_at, invoice_number
      into v_sale
    from sales where id = v_sale_id for update;

    if not found then raise exception 'sale % not found', v_sale_id; end if;
    if v_sale.status not in ('confirmed', 'partially_paid', 'paid') then
      raise exception 'sale % is %, cannot receive payment', v_sale.invoice_number, v_sale.status;
    end if;

    insert into sale_payments (sale_id, method, amount_cents, money_account_id, paid_at, reference, receipt_id)
    values (v_sale_id, p_method::payment_method, v_amount, p_money_account_id,
            coalesce(p_received_at, now()), nullif(btrim(p_reference), ''), v_receipt_id)
    returning id into v_pay_id;

    perform public.post_sale_payment_to_ledger(
      p_money_account_id,
      v_shop_sales_category_id,
      v_amount,
      'business'::account_scope,
      coalesce(p_received_at, now()),
      'Pago recibido ' || coalesce(v_sale.invoice_number, ''),
      v_sale_id,
      v_pay_id,
      v_user_profile_id
    );

    select coalesce(sum(amount_cents), 0) into v_new_paid
    from sale_payments where sale_id = v_sale_id;

    if v_new_paid >= v_sale.total_cents then
      v_new_status := 'paid';
    elsif v_new_paid > 0 then
      v_new_status := 'partially_paid';
    else
      v_new_status := 'confirmed';
    end if;

    update sales
      set paid_cents = v_new_paid,
          status = v_new_status::sale_status,
          paid_at = case when v_new_status = 'paid' then coalesce(v_sale.paid_at, coalesce(p_received_at, now())) else null end
      where id = v_sale_id;

    v_count := v_count + 1;
  end loop;

  return jsonb_build_object(
    'receipt_id', v_receipt_id,
    'deposit_cents', v_deposit,
    'invoices_paid', v_count
  );
end; $rp$;
