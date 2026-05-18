-- Round 14b.2 - create_purchase_order
--
-- The big one. Atomic multi-table write that creates a
-- purchase order from scratch, optionally with inline supplier
-- payment and optional inline transport (courier) payment in
-- one call. Returns the new purchase_order_id for the TS layer
-- to redirect to /purchases/[id] on success.
--
-- Inputs are flat scalar params (no jsonb wrapper for the
-- options) except p_lines which is jsonb array of
--   {product_id, qty, usd_unit_cost}.
--
-- Status outcomes:
--   - no inline payment   -> status pending
--   - inline payment      -> status paid_supplier (via helper)
--
-- Optional sub-flows are all-or-none:
--   - payment: 5 params (dop_paid_total, exchange_rate,
--     official_rate_at_payment, supplier_payment_account_id,
--     paid_at_dop). All null = no inline payment. All set =
--     inline payment.
--   - transport: 4 required params (amount, courier,
--     account, paid_at) plus 2 nullable text fields
--     (description, reference). All 4 null = no transport.
--     All 4 set = inline transport.
--   - Transport without payment is rejected: the transport
--     allocation needs dop_unit_landed_cost to make sense,
--     and standalone courier entry is the 14c surface.
--
-- Math (mirrors hand-verified Aliafee two-line case):
--   usd_subtotal = sum(qty * usd_unit_cost)
--   usd_total    = usd_subtotal + shipping + tax - discount
--   line.usd_line_total = qty * usd_unit_cost
--   line.dop_transport_share = (usd_line_total / usd_subtotal)
--                              * transport_total / qty
--   (bank fee and landed cost: see _allocate_supplier_payment)
--
-- Supplier resolution: lookup by name + kind='supplier';
-- insert if not found. No unique constraint on suppliers.name,
-- so race accepted per spec (one-owner usage).
-- ============================================================
create or replace function public.create_purchase_order(
  p_supplier_name               text,
  p_warehouse_id                uuid,
  p_ordered_at                  timestamptz,
  p_expected_at                 timestamptz,
  p_notes                       text,
  p_lines                       jsonb,
  p_usd_shipping                numeric,
  p_usd_tax                     numeric,
  p_usd_discount                numeric,
  p_dop_paid_total              numeric,
  p_exchange_rate               numeric,
  p_official_rate_at_payment    numeric,
  p_supplier_payment_account_id uuid,
  p_paid_at_dop                 timestamptz,
  p_transport_amount_dop        numeric,
  p_courier_id                  uuid,
  p_transport_account_id        uuid,
  p_transport_paid_at           timestamptz,
  p_transport_description       text,
  p_transport_reference         text
) returns uuid
language plpgsql
as $func$
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
  --      + landed cost; reads dop_transport_share via coalesce) ----
  if v_inline_pay then
    perform public._allocate_supplier_payment(
      v_order_id,
      p_dop_paid_total,
      p_exchange_rate,
      p_official_rate_at_payment,
      p_supplier_payment_account_id,
      p_paid_at_dop
    );
  end if;

  return v_order_id;
end;
$func$;