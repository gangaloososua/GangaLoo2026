-- ============================================================================
-- Round 24f: Purchases post to the live accounting ledger (Stage 2, final
-- event). When a purchase order is PAID for the supplier, the payment now
-- posts to the transactions ledger AND moves the money-account balance.
--
-- One shared helper, _allocate_supplier_payment, does the actual posting, so
-- BOTH payment paths are covered with a single change:
--   * mark_paid_supplier      -> pay an existing pending PO later
--   * create_purchase_order   -> create + pay in one go (inline payment)
-- Both already delegate the money work to the helper; they now also pass the
-- expense category straight through to it.
--
-- The expense category is chosen in the purchase form (same pattern as courier
-- payments / commission payouts). It is a NEW optional argument p_category_id
-- (default NULL) on all three functions. When NULL, NOTHING is posted -- so
-- this migration is fully backward-compatible: creating an UNPAID order, or
-- any existing call site that does not yet pass a category, behaves exactly as
-- before. Posting begins only once the frontend passes a category.
--
-- Posting details (in the helper, AFTER the unchanged landed-cost math):
--   amount  = p_dop_paid_total (PESOS) * 100, posted NEGATIVE (expense)
--   account = p_supplier_payment_account_id (the account the money left)
--   date    = p_paid_at_dop
--   link    = source_purchase_order_id  -> shows as AUTO in the ledger
--   scope   = business
-- Routed through post_transaction (owner/admin gated, atomic, locks the
-- account row before moving the balance) -- the same engine courier/commission
-- payouts use. Purchases are owner/admin operations, so the gate is correct.
--
-- The landed-cost / bank-fee / transport math in all three functions is
-- UNCHANGED, byte-for-byte. Only added: the p_category_id arg, a supplier-name
-- lookup for the ledger description, and the trailing post block in the helper.
--
-- DROP + CREATE (not CREATE OR REPLACE) because adding a defaulted argument
-- changes each signature; dropping the old signature first avoids leaving an
-- ambiguous overload behind. Helper is recreated first (the other two call it).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- Drop old signatures (exact arg types of the current functions)
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public._allocate_supplier_payment(
  uuid, numeric, numeric, numeric, uuid, timestamptz);

DROP FUNCTION IF EXISTS public.mark_paid_supplier(
  uuid, numeric, numeric, numeric, uuid, timestamptz);

DROP FUNCTION IF EXISTS public.create_purchase_order(
  text, uuid, timestamptz, timestamptz, text, jsonb,
  numeric, numeric, numeric, numeric, numeric, numeric,
  uuid, timestamptz, numeric, uuid, uuid, timestamptz, text, text);


-- ----------------------------------------------------------------------------
-- 1. _allocate_supplier_payment  (shared helper - now posts to the ledger)
--    NEW: p_category_id arg; supplier-name lookup; trailing post block.
--    Everything else is identical to the original.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._allocate_supplier_payment(
  p_purchase_order_id uuid,
  p_dop_paid_total numeric,
  p_exchange_rate numeric,
  p_official_rate_at_payment numeric,
  p_supplier_payment_account_id uuid,
  p_paid_at_dop timestamp with time zone,
  p_category_id uuid DEFAULT NULL
)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  v_usd_subtotal numeric(12,2);
  v_usd_total    numeric(12,2);
  v_dop_bank_fee numeric(12,2);
  v_supplier_name text;
begin
  -- Pull the header values we need for the math
  select usd_subtotal, usd_total
    into v_usd_subtotal, v_usd_total
    from public.purchase_orders
    where id = p_purchase_order_id;

  if not found then
    raise exception 'purchase order % not found', p_purchase_order_id;
  end if;

  if v_usd_subtotal = 0 then
    raise exception 'purchase order % has usd_subtotal = 0; cannot allocate', p_purchase_order_id;
  end if;

  -- Derived: bank fee = what bank charged minus naive prediction
  v_dop_bank_fee := p_dop_paid_total - (v_usd_total * p_exchange_rate);

  -- Update header
  update public.purchase_orders
    set dop_paid_total              = p_dop_paid_total,
        exchange_rate               = p_exchange_rate,
        official_rate_at_payment    = p_official_rate_at_payment,
        dop_bank_fee                = v_dop_bank_fee,
        supplier_payment_account_id = p_supplier_payment_account_id,
        paid_at_dop                 = p_paid_at_dop,
        status                      = 'paid_supplier',
        updated_at                  = now()
    where id = p_purchase_order_id;

  -- Update each line's DOP allocation
  update public.purchase_order_items poi
    set dop_unit_cost_base   = poi.usd_unit_cost * p_exchange_rate,
        dop_bank_share       = (
          (poi.usd_line_total / v_usd_subtotal) * p_dop_paid_total
          - poi.usd_line_total * p_exchange_rate
        ) / poi.qty,
        dop_unit_landed_cost = (poi.usd_unit_cost * p_exchange_rate)
                             + (
                                 (poi.usd_line_total / v_usd_subtotal) * p_dop_paid_total
                                 - poi.usd_line_total * p_exchange_rate
                               ) / poi.qty
                             + coalesce(poi.dop_transport_share, 0)
    where poi.purchase_order_id = p_purchase_order_id;

  -- ---- NEW: post the supplier payment to the live ledger ----
  -- Only when a category was supplied (keeps every existing path/back-compat).
  -- Amount is in PESOS on the PO -> *100 to cents, posted NEGATIVE (expense).
  if p_category_id is not null then
    select s.name
      into v_supplier_name
      from public.purchase_orders po
      join public.suppliers s on s.id = po.supplier_id
      where po.id = p_purchase_order_id;

    perform public.post_transaction(jsonb_build_object(
      'money_account_id',         p_supplier_payment_account_id,
      'category_id',              p_category_id,
      'amount_cents',             -round(p_dop_paid_total * 100),
      'scope',                    'business',
      'occurred_at',              p_paid_at_dop,
      'description',              'Purchase — ' || coalesce(v_supplier_name, ''),
      'source_purchase_order_id', p_purchase_order_id
    ));
  end if;
end;
$function$;


-- ----------------------------------------------------------------------------
-- 2. mark_paid_supplier  (pay an existing pending PO later)
--    NEW: p_category_id arg, passed straight to the helper. Else identical.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_paid_supplier(
  p_purchase_order_id uuid,
  p_dop_paid_total numeric,
  p_exchange_rate numeric,
  p_official_rate_at_payment numeric,
  p_supplier_payment_account_id uuid,
  p_paid_at_dop timestamp with time zone DEFAULT now(),
  p_category_id uuid DEFAULT NULL
)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  v_status public.purchase_status;
begin
  -- Input validation
  if p_dop_paid_total is null or p_dop_paid_total <= 0 then
    raise exception 'dop_paid_total must be > 0 (got %)', p_dop_paid_total;
  end if;
  if p_exchange_rate is null or p_exchange_rate <= 0 then
    raise exception 'exchange_rate must be > 0 (got %)', p_exchange_rate;
  end if;

  -- Status guard - must be pending
  select status into v_status
    from public.purchase_orders
    where id = p_purchase_order_id;

  if not found then
    raise exception 'purchase order % not found', p_purchase_order_id;
  end if;

  if v_status <> 'pending' then
    raise exception 'cannot mark paid: order % is in status %, expected pending',
                    p_purchase_order_id, v_status;
  end if;

  -- Delegate to the shared allocation helper (now also posts to the ledger)
  perform public._allocate_supplier_payment(
    p_purchase_order_id,
    p_dop_paid_total,
    p_exchange_rate,
    p_official_rate_at_payment,
    p_supplier_payment_account_id,
    p_paid_at_dop,
    p_category_id
  );
end;
$function$;


-- ----------------------------------------------------------------------------
-- 3. create_purchase_order  (create + optional inline payment)
--    NEW: p_category_id arg (last), passed to the helper in the inline-pay
--    branch. Everything else - validation, totals, header/line inserts,
--    inline transport - is identical.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_purchase_order(
  p_supplier_name text,
  p_warehouse_id uuid,
  p_ordered_at timestamp with time zone,
  p_expected_at timestamp with time zone,
  p_notes text,
  p_lines jsonb,
  p_usd_shipping numeric,
  p_usd_tax numeric,
  p_usd_discount numeric,
  p_dop_paid_total numeric,
  p_exchange_rate numeric,
  p_official_rate_at_payment numeric,
  p_supplier_payment_account_id uuid,
  p_paid_at_dop timestamp with time zone,
  p_transport_amount_dop numeric,
  p_courier_id uuid,
  p_transport_account_id uuid,
  p_transport_paid_at timestamp with time zone,
  p_transport_description text,
  p_transport_reference text,
  p_category_id uuid DEFAULT NULL
)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
declare
  v_supplier_id  uuid;
  v_order_id     uuid;
  v_cp_id        uuid;
  v_pay_nulls    int;
  v_tr_nulls     int;
  v_inline_pay   boolean;
  v_inline_tr    boolean;
  v_usd_subtotal numeric;
  r              record;
begin
  -- ---- Validate p_lines shape and contents ----
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'p_lines must be a jsonb array';
  end if;
  if jsonb_array_length(p_lines) = 0 then
    raise exception 'p_lines must not be empty';
  end if;
  for r in select value from jsonb_array_elements(p_lines) loop
    if (r.value->>'product_id') is null then
      raise exception 'each line must have product_id';
    end if;
    if (r.value->>'qty')::numeric is null
       or (r.value->>'qty')::numeric <= 0 then
      raise exception 'each line must have qty > 0';
    end if;
    if (r.value->>'usd_unit_cost')::numeric is null
       or (r.value->>'usd_unit_cost')::numeric < 0 then
      raise exception 'each line must have usd_unit_cost >= 0';
    end if;
  end loop;

  -- ---- All-or-none on payment params (5 of them) ----
  v_pay_nulls := (case when p_dop_paid_total              is null then 1 else 0 end)
               + (case when p_exchange_rate               is null then 1 else 0 end)
               + (case when p_official_rate_at_payment    is null then 1 else 0 end)
               + (case when p_supplier_payment_account_id is null then 1 else 0 end)
               + (case when p_paid_at_dop                 is null then 1 else 0 end);
  if v_pay_nulls not in (0, 5) then
    raise exception 'inline payment: all 5 params must be provided or all 5 must be null';
  end if;
  v_inline_pay := (v_pay_nulls = 0);

  -- ---- All-or-none on transport required params (4 of them) ----
  v_tr_nulls := (case when p_transport_amount_dop is null then 1 else 0 end)
              + (case when p_courier_id           is null then 1 else 0 end)
              + (case when p_transport_account_id is null then 1 else 0 end)
              + (case when p_transport_paid_at    is null then 1 else 0 end);
  if v_tr_nulls not in (0, 4) then
    raise exception 'inline transport: amount, courier, account, paid_at must all be provided or all null';
  end if;
  v_inline_tr := (v_tr_nulls = 0);

  if v_inline_tr and not v_inline_pay then
    raise exception 'inline transport requires inline payment';
  end if;

  -- ---- Resolve supplier_id (lookup or insert) ----
  select id into v_supplier_id
    from public.suppliers
    where name = p_supplier_name
      and kind = 'supplier'
    limit 1;
  if not found then
    insert into public.suppliers (name, kind)
      values (p_supplier_name, 'supplier')
      returning id into v_supplier_id;
  end if;

  -- ---- Header totals ----
  select coalesce(sum(
           (value->>'qty')::numeric
           * (value->>'usd_unit_cost')::numeric
         ), 0)
    into v_usd_subtotal
    from jsonb_array_elements(p_lines);

  -- ---- Insert header (status defaults to 'pending';
  --      usd_total is a generated column, do NOT insert) ----
  insert into public.purchase_orders (
    supplier_id, warehouse_id, ordered_at, expected_at, notes,
    usd_subtotal, usd_shipping, usd_tax, usd_discount
  ) values (
    v_supplier_id, p_warehouse_id, p_ordered_at, p_expected_at, p_notes,
    v_usd_subtotal,
    coalesce(p_usd_shipping, 0),
    coalesce(p_usd_tax,      0),
    coalesce(p_usd_discount, 0)
  )
  returning id into v_order_id;

  -- ---- Insert lines (usd_line_total is a generated
  --      column, do NOT insert; the DB computes it) ----
  for r in select value from jsonb_array_elements(p_lines) loop
    insert into public.purchase_order_items (
      purchase_order_id, product_id, qty, usd_unit_cost
    ) values (
      v_order_id,
      (r.value->>'product_id')::uuid,
      (r.value->>'qty')::numeric,
      (r.value->>'usd_unit_cost')::numeric
    );
  end loop;

  -- ---- Inline transport (BEFORE payment so transport_share
  --      is in place when _allocate_supplier_payment reads it) ----
  if v_inline_tr then
    insert into public.courier_payments (
      courier_id, paid_at, money_account_id, amount_dop_total,
      description, reference
    ) values (
      p_courier_id, p_transport_paid_at, p_transport_account_id,
      p_transport_amount_dop,
      p_transport_description, p_transport_reference
    )
    returning id into v_cp_id;

    insert into public.courier_payment_allocations (
      courier_payment_id, purchase_order_id, amount_dop
    ) values (
      v_cp_id, v_order_id, p_transport_amount_dop
    );

    -- Proportional per-unit transport share across lines
    update public.purchase_order_items poi
      set dop_transport_share =
        (poi.usd_line_total / v_usd_subtotal)
        * p_transport_amount_dop
        / poi.qty
      where poi.purchase_order_id = v_order_id;
  end if;

  -- ---- Inline payment (helper handles bank fee + status flip
  --      + landed cost + ledger post; reads dop_transport_share via coalesce) ----
  if v_inline_pay then
    perform public._allocate_supplier_payment(
      v_order_id,
      p_dop_paid_total,
      p_exchange_rate,
      p_official_rate_at_payment,
      p_supplier_payment_account_id,
      p_paid_at_dop,
      p_category_id
    );
  end if;

  return v_order_id;
end;
$function$;
