-- ============================================================================
-- Round 40a: Batch supplier payment ("Pagar a proveedores").
--
-- Mirrors the sales-side "Recibir Pago" pattern for purchases: ONE bank
-- withdrawal in the ledger, allocated across multiple pending purchase
-- orders, so the bank statement matches what's in the books.
--
-- WHAT'S NEW
--
--   supplier_payment_receipts (table)
--     One row per bank withdrawal: account, paid_at, dop_total_cents,
--     official_rate, optional reference + notes.
--
--   supplier_payment_allocations (table)
--     One row per (receipt, purchase_order): dop_amount_cents allocated
--     to that order. Unique on (receipt_id, purchase_order_id).
--
--   transactions.source_supplier_payment_receipt_id
--     New nullable FK so the batch ledger line traces back to its receipt.
--
--   post_transaction (replaced, same signature)
--     Adds source_supplier_payment_receipt_id to the payload it reads and
--     to the v_is_manual gate. Body otherwise byte-identical.
--
--   pay_suppliers_batch (new RPC)
--     pay_suppliers_batch(
--       p_account_id        uuid,
--       p_paid_at           timestamptz,
--       p_reference         text,
--       p_official_rate     numeric,
--       p_category_id       uuid,             -- expense category for the ledger line
--       p_allocations       jsonb,            -- [{po_id, dop_amount_cents}, ...]
--       p_description       text default null,
--       p_notes             text default null
--     ) returns uuid                          -- the receipt id
--
--     Owner/admin gated, atomic. Validates every PO is pending and has a
--     usd_total > 0; rejects duplicate po_ids and non-positive amounts.
--     For each allocation it calls the existing _allocate_supplier_payment
--     with p_category_id = NULL so the per-PO ledger post is skipped, then
--     writes ONE outflow line via post_transaction linked to the receipt.
--
-- WHAT'S NOT CHANGED
--
--   mark_paid_supplier (single-order pay flow): untouched.
--   _allocate_supplier_payment: untouched.
--   Existing data: nothing rewritten; only new columns/tables added.
--
-- IDEMPOTENT: tables / indexes / column use IF NOT EXISTS; functions use
-- CREATE OR REPLACE. Safe to re-run.
--
-- REVERSIBLE (rollback order):
--   drop function pay_suppliers_batch;
--   -- restore previous post_transaction from git history;
--   alter table transactions drop column source_supplier_payment_receipt_id;
--   drop table supplier_payment_allocations;
--   drop table supplier_payment_receipts;
-- ============================================================================


-- ---- 1) supplier_payment_receipts -----------------------------------------

create table if not exists public.supplier_payment_receipts (
  id              uuid primary key default gen_random_uuid(),
  account_id      uuid not null references public.money_accounts(id),
  paid_at         timestamptz not null default now(),
  dop_total_cents bigint not null check (dop_total_cents > 0),
  official_rate   numeric(12,4) not null check (official_rate > 0),
  reference       text,
  notes           text,
  created_at      timestamptz not null default now(),
  created_by      uuid references public.profiles(id)
);

create index if not exists idx_supp_pay_receipts_paid_at
  on public.supplier_payment_receipts (paid_at desc);
create index if not exists idx_supp_pay_receipts_account
  on public.supplier_payment_receipts (account_id, paid_at desc);


-- ---- 2) supplier_payment_allocations --------------------------------------

create table if not exists public.supplier_payment_allocations (
  id                uuid primary key default gen_random_uuid(),
  receipt_id        uuid not null
                       references public.supplier_payment_receipts(id) on delete cascade,
  purchase_order_id uuid not null references public.purchase_orders(id),
  dop_amount_cents  bigint not null check (dop_amount_cents > 0),
  created_at        timestamptz not null default now(),
  unique (receipt_id, purchase_order_id)
);

create index if not exists idx_supp_pay_alloc_receipt
  on public.supplier_payment_allocations (receipt_id);
create index if not exists idx_supp_pay_alloc_po
  on public.supplier_payment_allocations (purchase_order_id);


-- ---- 3) transactions: new source link -------------------------------------

alter table public.transactions
  add column if not exists source_supplier_payment_receipt_id uuid
    references public.supplier_payment_receipts(id);

create index if not exists idx_txn_supp_pay_receipt
  on public.transactions (source_supplier_payment_receipt_id)
  where source_supplier_payment_receipt_id is not null;


-- ---- 4) post_transaction: recognise the new source link -------------------
-- Body byte-identical to the version we just inspected; only the new
-- v_supp_receipt variable, the v_is_manual gate, and the INSERT change.

CREATE OR REPLACE FUNCTION public.post_transaction(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_account_id  uuid          := (p_payload->>'money_account_id')::uuid;
  v_category_id uuid          := (p_payload->>'category_id')::uuid;
  v_amount      bigint        := (p_payload->>'amount_cents')::bigint;
  v_scope       account_scope := (p_payload->>'scope')::account_scope;
  v_occurred    timestamptz   := coalesce(nullif(p_payload->>'occurred_at','')::timestamptz, now());
  v_desc        text          := nullif(btrim(p_payload->>'description'), '');

  -- optional source links (any one of these makes it a non-manual posting)
  v_sale         uuid := nullif(p_payload->>'source_sale_id','')::uuid;
  v_sale_payment uuid := nullif(p_payload->>'source_sale_payment_id','')::uuid;
  v_purchase     uuid := nullif(p_payload->>'source_purchase_order_id','')::uuid;
  v_courier      uuid := nullif(p_payload->>'source_courier_payment_id','')::uuid;
  v_commission   uuid := nullif(p_payload->>'source_commission_payout_id','')::uuid;
  v_transfer     uuid := nullif(p_payload->>'source_transfer_id','')::uuid;
  v_supp_receipt uuid := nullif(p_payload->>'source_supplier_payment_receipt_id','')::uuid;

  v_user_id         uuid := auth.uid();
  v_user_role       user_role;
  v_user_profile_id uuid;
  v_is_manual       boolean;
  v_new_id          uuid;
BEGIN
  -- Permission gate (owner/admin only)
  SELECT id, role INTO v_user_profile_id, v_user_role
    FROM profiles WHERE auth_user_id = v_user_id;
  IF v_user_role IS NULL OR v_user_role NOT IN ('owner','admin') THEN
    RAISE EXCEPTION 'permission denied: only owner/admin can post transactions'
      USING ERRCODE = '42501';
  END IF;

  -- Validation
  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'money_account_id is required' USING ERRCODE = '22023';
  END IF;
  IF v_category_id IS NULL THEN
    RAISE EXCEPTION 'category_id is required' USING ERRCODE = '22023';
  END IF;
  IF v_amount IS NULL OR v_amount = 0 THEN
    RAISE EXCEPTION 'amount_cents is required and cannot be zero' USING ERRCODE = '22023';
  END IF;
  IF v_scope IS NULL THEN
    RAISE EXCEPTION 'scope is required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM money_accounts WHERE id = v_account_id) THEN
    RAISE EXCEPTION 'money_account % not found', v_account_id USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM account_categories WHERE id = v_category_id) THEN
    RAISE EXCEPTION 'account_category % not found', v_category_id USING ERRCODE = '22023';
  END IF;

  v_is_manual := (v_sale IS NULL AND v_sale_payment IS NULL AND v_purchase IS NULL
                  AND v_courier IS NULL AND v_commission IS NULL AND v_transfer IS NULL
                  AND v_supp_receipt IS NULL);

  -- Lock the account row before moving its balance.
  PERFORM 1 FROM money_accounts WHERE id = v_account_id FOR UPDATE;

  INSERT INTO transactions (
    money_account_id, category_id, amount_cents, scope, occurred_at, description,
    source_sale_id, source_sale_payment_id, source_purchase_order_id,
    source_courier_payment_id, source_commission_payout_id, source_transfer_id,
    source_supplier_payment_receipt_id,
    is_manual, created_by
  ) VALUES (
    v_account_id, v_category_id, v_amount, v_scope, v_occurred, v_desc,
    v_sale, v_sale_payment, v_purchase,
    v_courier, v_commission, v_transfer,
    v_supp_receipt,
    v_is_manual, v_user_profile_id
  )
  RETURNING id INTO v_new_id;

  UPDATE money_accounts
    SET balance_cents = balance_cents + v_amount
    WHERE id = v_account_id;

  RETURN jsonb_build_object('ok', true, 'transaction_id', v_new_id, 'amount_cents', v_amount);
END;
$function$;


-- ---- 5) pay_suppliers_batch RPC -------------------------------------------

create or replace function public.pay_suppliers_batch(
  p_account_id    uuid,
  p_paid_at       timestamptz,
  p_reference     text,
  p_official_rate numeric,
  p_category_id   uuid,
  p_allocations   jsonb,
  p_description   text default null,
  p_notes         text default null
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_caller_role user_role;
  v_caller_id   uuid;
  v_total_cents bigint := 0;
  v_po_count    int    := 0;
  v_receipt_id  uuid;
  v_alloc       record;
  v_usd_total   numeric(12,2);
  v_dop_amount  numeric(14,2);
  v_exchange    numeric(14,4);
  v_po_status   text;
  v_seen        jsonb  := '[]'::jsonb;
begin
  -- Owner/admin gate
  select id, role into v_caller_id, v_caller_role
    from profiles where auth_user_id = auth.uid();
  if v_caller_role is null or v_caller_role not in ('owner','admin') then
    raise exception 'permission denied: only owner/admin can pay suppliers'
      using errcode = '42501';
  end if;

  -- Input validation
  if p_account_id is null then
    raise exception 'p_account_id is required';
  end if;
  if p_official_rate is null or p_official_rate <= 0 then
    raise exception 'p_official_rate must be > 0';
  end if;
  if p_category_id is null then
    raise exception 'p_category_id is required';
  end if;
  if p_allocations is null
     or jsonb_typeof(p_allocations) <> 'array'
     or jsonb_array_length(p_allocations) = 0 then
    raise exception 'p_allocations must be a non-empty array';
  end if;

  -- Pass 1: validate each allocation, sum total, detect duplicates
  for v_alloc in
    select
      (e->>'po_id')::uuid              as po_id,
      (e->>'dop_amount_cents')::bigint as dop_amount_cents
    from jsonb_array_elements(p_allocations) e
  loop
    if v_alloc.po_id is null then
      raise exception 'allocation missing po_id';
    end if;
    if v_alloc.dop_amount_cents is null or v_alloc.dop_amount_cents <= 0 then
      raise exception 'allocation dop_amount_cents must be > 0 (po %)', v_alloc.po_id;
    end if;
    if v_seen @> to_jsonb(v_alloc.po_id) then
      raise exception 'duplicate allocation for po %', v_alloc.po_id;
    end if;
    v_seen := v_seen || to_jsonb(v_alloc.po_id);

    select status::text, usd_total
      into v_po_status, v_usd_total
      from purchase_orders where id = v_alloc.po_id;
    if not found then
      raise exception 'purchase order % not found', v_alloc.po_id;
    end if;
    if v_po_status <> 'pending' then
      raise exception 'purchase order % is in status %, expected pending',
        v_alloc.po_id, v_po_status;
    end if;
    if v_usd_total is null or v_usd_total <= 0 then
      raise exception 'purchase order % has no usd_total', v_alloc.po_id;
    end if;

    v_total_cents := v_total_cents + v_alloc.dop_amount_cents;
    v_po_count    := v_po_count + 1;
  end loop;

  -- Create receipt header
  insert into supplier_payment_receipts (
    account_id, paid_at, dop_total_cents, official_rate, reference, notes, created_by
  ) values (
    p_account_id, p_paid_at, v_total_cents, p_official_rate, p_reference, p_notes, v_caller_id
  )
  returning id into v_receipt_id;

  -- Pass 2: per-PO math via the existing helper. p_category_id = NULL keeps
  -- the helper from posting its own ledger line; we post once at the end.
  for v_alloc in
    select
      (e->>'po_id')::uuid              as po_id,
      (e->>'dop_amount_cents')::bigint as dop_amount_cents
    from jsonb_array_elements(p_allocations) e
  loop
    select usd_total into v_usd_total
      from purchase_orders where id = v_alloc.po_id;
    v_dop_amount := v_alloc.dop_amount_cents::numeric / 100;
    v_exchange   := round(v_dop_amount / v_usd_total, 4);

    perform _allocate_supplier_payment(
      v_alloc.po_id,
      v_dop_amount,
      v_exchange,
      p_official_rate,
      p_account_id,
      p_paid_at,
      null          -- skip per-PO ledger post
    );

    insert into supplier_payment_allocations (
      receipt_id, purchase_order_id, dop_amount_cents
    ) values (
      v_receipt_id, v_alloc.po_id, v_alloc.dop_amount_cents
    );
  end loop;

  -- One ledger outflow line for the whole deposit, linked to the receipt.
  perform post_transaction(jsonb_build_object(
    'money_account_id',                   p_account_id,
    'category_id',                        p_category_id,
    'amount_cents',                       -v_total_cents,
    'scope',                              'business',
    'occurred_at',                        p_paid_at,
    'description',
      coalesce(p_description,
               'Pago a proveedores · ' || v_po_count || ' órdenes' ||
               coalesce(' · Ref ' || nullif(p_reference, ''), '')),
    'source_supplier_payment_receipt_id', v_receipt_id
  ));

  return v_receipt_id;
end;
$function$;


-- ============================================================================
-- SMOKE CHECKLIST (run in Supabase SQL editor — each in its own Run,
-- BEGIN/ROLLBACK so nothing is permanent):
--
--   1. Happy path: 2 pending POs.
--      BEGIN;
--      SET LOCAL request.jwt.claims = '{"sub":"<owner_auth_user_id>","role":"authenticated"}';
--      SELECT public.pay_suppliers_batch(
--        '<account_id>'::uuid,
--        now(),
--        'SMOKE-40a',
--        60.50::numeric,
--        '<expense_category_id>'::uuid,
--        '[{"po_id":"<po_a>","dop_amount_cents":700000},{"po_id":"<po_b>","dop_amount_cents":1300000}]'::jsonb
--      ) AS receipt_id;
--      -- verify:
--      SELECT id, status, dop_paid_total, exchange_rate FROM purchase_orders WHERE id IN ('<po_a>','<po_b>');
--      SELECT * FROM supplier_payment_receipts WHERE reference = 'SMOKE-40a';
--      SELECT * FROM supplier_payment_allocations WHERE receipt_id = (SELECT id FROM supplier_payment_receipts WHERE reference='SMOKE-40a');
--      SELECT amount_cents, description, source_supplier_payment_receipt_id, is_manual
--        FROM transactions WHERE source_supplier_payment_receipt_id IS NOT NULL ORDER BY created_at DESC LIMIT 1;
--      ROLLBACK;
--      -- expected: both POs status=paid_supplier, receipt row exists with dop_total_cents=2000000,
--      -- two allocation rows, one transaction row with amount_cents=-2000000 and is_manual=false.
--
--   2. Negative — already-paid PO:
--      same call but with a PO already in paid_supplier → raises
--      'purchase order ... is in status paid_supplier, expected pending'.
--
--   3. Negative — duplicate po_id in allocations array:
--      raises 'duplicate allocation for po ...'.
--
--   4. Negative — non-owner JWT:
--      raises 'permission denied: only owner/admin can pay suppliers'.
-- ============================================================================
