-- round-43a-online-payments-finalize.sql
-- ONLINE CARD PAYMENTS — Step 1 of the Stripe build (PayPal reuses this later).
--
-- WHAT THIS DOES:
--   * Adds ONE new table  `online_payments`  — records each confirmed online
--     card payment (Stripe now, PayPal later).
--   * Adds ONE new function `finalize_online_payment(...)` — when the payment
--     provider confirms a payment, it marks the matching order PAID.
--   * "MARK PAID ONLY" mode (your choice): it does NOT post to money_accounts /
--     transactions. The books-reconciliation step is deferred to before go-live.
--   * IDEMPOTENT: a provider can send the same confirmation many times (webhooks
--     retry). The UNIQUE (provider, provider_ref) key means an order is only ever
--     marked paid ONCE, no matter how many times the message arrives.
--
-- SAFETY: this migration is PURELY ADDITIVE. It creates a brand-new table and a
-- brand-new function and changes NOTHING that already exists. Nothing calls the
-- function yet, so applying it cannot affect any current order, balance, stock,
-- or behaviour. Safe to run as-is in the Supabase SQL editor (plain DDL — no JWT
-- claim needed). The real end-to-end proof comes later, with a Stripe TEST card.

-- 1) Record of each confirmed online payment --------------------------------
create table if not exists public.online_payments (
  id            uuid primary key default gen_random_uuid(),
  sale_id       uuid not null references public.sales(id) on delete cascade,
  provider      text not null check (provider in ('stripe', 'paypal')),
  provider_ref  text not null,                               -- Stripe session/payment id, PayPal capture id
  amount_cents  integer not null check (amount_cents >= 0),  -- what the provider reported (pesos, in cents)
  currency      text not null default 'DOP',
  status        text not null default 'paid' check (status in ('paid', 'refunded', 'failed')),
  raw_event     jsonb,                                       -- raw confirmation payload, kept for audit
  created_at    timestamptz not null default now(),
  paid_at       timestamptz,
  unique (provider, provider_ref)                            -- idempotency key
);

comment on table public.online_payments is
  'One row per confirmed online card payment (Stripe/PayPal). Idempotency key = '
  '(provider, provider_ref). "Mark Paid only" mode: does NOT post to money_accounts.';

-- RLS: staff may read; ALL writes go through finalize_online_payment() only
-- (same discipline as purchase_order_payments in round-41a).
alter table public.online_payments enable row level security;

create policy online_payments_select_staff on public.online_payments
  for select using (
    exists (
      select 1 from public.profiles p
       where p.auth_user_id = auth.uid() and p.role <> 'customer'
    )
  );

-- 2) Finalize: mark the order paid when the provider confirms ----------------
create or replace function public.finalize_online_payment(
  p_provider     text,
  p_provider_ref text,
  p_sale_id      uuid,
  p_amount_cents integer,
  p_raw          jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_existing  public.online_payments%rowtype;
  v_sale      public.sales%rowtype;
  v_expected  integer;
begin
  if p_provider not in ('stripe', 'paypal') then
    raise exception 'finalize_online_payment: bad provider %', p_provider;
  end if;
  if coalesce(p_provider_ref, '') = '' then
    raise exception 'finalize_online_payment: provider_ref required';
  end if;

  -- IDEMPOTENT: if this exact provider payment is already recorded, do nothing.
  select * into v_existing
    from public.online_payments
   where provider = p_provider and provider_ref = p_provider_ref;
  if found then
    return jsonb_build_object(
      'ok', true, 'already_processed', true,
      'sale_id', v_existing.sale_id, 'payment_id', v_existing.id
    );
  end if;

  -- Load the order.
  select * into v_sale from public.sales where id = p_sale_id;
  if not found then
    raise exception 'finalize_online_payment: sale % not found', p_sale_id;
  end if;

  -- Amount the customer owed = order total + the card surcharge.
  v_expected := coalesce(v_sale.total_cents, 0) + coalesce(v_sale.payment_fee_cents, 0);

  -- Safety: the provider must have collected ~the expected amount
  -- (allow a 1-peso rounding tolerance). Mismatch = record + stop, never mark paid.
  if abs(coalesce(p_amount_cents, 0) - v_expected) > 100 then
    insert into public.online_payments
      (sale_id, provider, provider_ref, amount_cents, currency, status, raw_event, paid_at)
    values
      (p_sale_id, p_provider, p_provider_ref, coalesce(p_amount_cents, 0), 'DOP', 'failed', p_raw, null);
    raise exception 'finalize_online_payment: amount mismatch (got %, expected %)',
      p_amount_cents, v_expected;
  end if;

  -- Record the payment.
  insert into public.online_payments
    (sale_id, provider, provider_ref, amount_cents, currency, status, raw_event, paid_at)
  values
    (p_sale_id, p_provider, p_provider_ref, coalesce(p_amount_cents, v_expected), 'DOP', 'paid', p_raw, now());

  -- Mark the order PAID (no money_accounts posting in this mode).
  -- Only advance an order that hasn't already been settled or cancelled.
  if v_sale.status in ('draft', 'confirmed', 'partially_paid') then
    update public.sales
       set status     = 'paid',
           paid_cents  = v_expected,
           paid_at     = now()
     where id = p_sale_id;
  end if;

  return jsonb_build_object(
    'ok', true, 'already_processed', false,
    'sale_id', p_sale_id, 'invoice_number', v_sale.invoice_number,
    'amount_cents', v_expected, 'status', 'paid'
  );
end;
$function$;

comment on function public.finalize_online_payment(text, text, uuid, integer, jsonb) is
  'Marks an online order PAID when Stripe/PayPal confirms. Idempotent on '
  '(provider, provider_ref). "Mark Paid only": does NOT post to money_accounts.';

-- Only the server (using the Supabase SERVICE key, e.g. the payment webhook)
-- may call this. NOT granted to anon/authenticated.
revoke all on function public.finalize_online_payment(text, text, uuid, integer, jsonb) from public;
grant execute on function public.finalize_online_payment(text, text, uuid, integer, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- ROLLBACK (only if you ever need to undo this whole migration):
--   drop function if exists public.finalize_online_payment(text, text, uuid, integer, jsonb);
--   drop table if exists public.online_payments;
-- ---------------------------------------------------------------------------
