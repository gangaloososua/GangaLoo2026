-- ============================================================
-- Round 77a — mark_cancelled: post the refund to the ledger
--             (paid_supplier cancels) + stop stamping completed_at
--
-- Rebuilt from the LIVE body (pg_get_functiondef, 2026-07-01).
-- Signature UNCHANGED. Only two behavioural changes vs live:
--
--   1. paid_supplier cancel WITH refund inputs now POSTS a positive
--      refund row to the ledger (via post_transaction) against the
--      chosen refund account, linked by source_purchase_order_id, and
--      reusing the ORDER'S OWN payment category/scope (read from the
--      most recent purchase_order_payments row). Before this, those
--      three refund fields were written to the order but NO ledger
--      row was posted and NO balance moved — the gap that required a
--      manual repair.
--
--   2. completed_at is set to NULL on cancel (was now()). A cancelled
--      order should not carry a completion timestamp; the stray value
--      was the source of the false "Complete / Mismatch" badge.
--
-- The pending path (returns part-payments via reverse_transaction) is
-- byte-for-byte unchanged — it already handled money correctly.
--
-- NOTE: post_transaction gates on auth.uid() (owner/admin), so this
-- function only works when called by a logged-in owner through the app
-- (as mark_cancelled always is). It cannot be exercised from an
-- anonymous SQL Editor session; verify with the round-77a test harness
-- (which sets request.jwt.claims to the owner inside a rolled-back tx).
-- ============================================================

CREATE OR REPLACE FUNCTION public.mark_cancelled(
  p_purchase_order_id uuid,
  p_dop_refund_total numeric DEFAULT NULL::numeric,
  p_refund_at_dop timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_refund_account_id uuid DEFAULT NULL::uuid
)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  v_status         public.purchase_status;
  v_refund_count   integer;
  v_txn_ids        uuid[];    -- round-41b: ledger lines of the part-payments
  v_tid            uuid;
  v_category_id    uuid;      -- round-77a: refund reuses the order's payment category
  v_scope          text;      -- round-77a: reuse the payment's scope (as text, like the
                              --            supplier-payment fn passes the literal 'business')
  v_supplier_name  text;      -- round-77a: for the refund ledger description
begin
  -- Status lookup + cancellable check
  select status into v_status
    from public.purchase_orders
    where id = p_purchase_order_id;

  if not found then
    raise exception 'purchase order % not found', p_purchase_order_id;
  end if;

  if v_status not in ('pending', 'paid_supplier') then
    raise exception 'cannot cancel: order % is in status %, expected pending or paid_supplier',
                    p_purchase_order_id, v_status;
  end if;

  -- "All three or none" rule for refund inputs
  v_refund_count :=
    (case when p_dop_refund_total  is not null then 1 else 0 end)
  + (case when p_refund_at_dop     is not null then 1 else 0 end)
  + (case when p_refund_account_id is not null then 1 else 0 end);

  if v_refund_count not in (0, 3) then
    raise exception 'refund inputs must be all-null or all-set (got % of 3)', v_refund_count;
  end if;

  -- Refund-on-pending refused (manual refund box is for paid orders; pending
  -- part-payments are returned automatically below).
  if v_refund_count = 3 and v_status = 'pending' then
    raise exception 'cannot record refund: order % is in status pending, no payment was made',
                    p_purchase_order_id;
  end if;

  -- Refund amount validation
  if p_dop_refund_total is not null and p_dop_refund_total <= 0 then
    raise exception 'dop_refund_total must be > 0 (got %)', p_dop_refund_total;
  end if;

  -- round-41b: cancelling a PENDING order returns any part-payments to the
  -- accounts they came from. Delete the part rows FIRST (they hold an FK to the
  -- ledger lines), then reverse each ledger line.
  if v_status = 'pending' then
    select array_agg(transaction_id)
      into v_txn_ids
      from public.purchase_order_payments
      where purchase_order_id = p_purchase_order_id
        and transaction_id is not null;

    delete from public.purchase_order_payments
      where purchase_order_id = p_purchase_order_id;

    if v_txn_ids is not null then
      foreach v_tid in array v_txn_ids loop
        perform public.reverse_transaction(v_tid);
      end loop;
    end if;
  end if;

  -- round-77a: a PAID_SUPPLIER cancel with refund inputs posts the refund to
  -- the ledger (positive = money in) against the chosen refund account, reusing
  -- the order's own payment category + scope so it nets against the same line.
  if v_refund_count = 3 and v_status = 'paid_supplier' then
    -- most recent payment row for this order supplies category + scope source
    select p.category_id
      into v_category_id
      from public.purchase_order_payments p
      where p.purchase_order_id = p_purchase_order_id
      order by p.paid_at desc nulls last, p.created_at desc nulls last
      limit 1;

    if v_category_id is null then
      raise exception 'cannot post refund: no payment category found for order %',
                      p_purchase_order_id;
    end if;

    -- reuse the scope of the original ledger line for this order (falls back to
    -- 'business' if none is found — matches how supplier payments are posted)
    select t.scope::text
      into v_scope
      from public.transactions t
      where t.source_purchase_order_id = p_purchase_order_id
      order by t.occurred_at asc
      limit 1;

    v_scope := coalesce(v_scope, 'business');

    -- supplier name for the ledger description
    select s.name
      into v_supplier_name
      from public.purchase_orders po
      join public.suppliers s on s.id = po.supplier_id
      where po.id = p_purchase_order_id;

    perform public.post_transaction(jsonb_build_object(
      'money_account_id',         p_refund_account_id,
      'category_id',              v_category_id,
      'amount_cents',             round(p_dop_refund_total * 100),  -- positive = money in
      'scope',                    v_scope,
      'occurred_at',              p_refund_at_dop,
      'description',              'Refund — ' || coalesce(v_supplier_name, '') || ' (cancelled)',
      'source_purchase_order_id', p_purchase_order_id
    ));
  end if;

  -- Status flip + optional refund record. One UPDATE so partial writes can't happen.
  -- round-77a: completed_at is cleared (was now()) — a cancel is not a completion.
  update public.purchase_orders
    set status            = 'cancelled',
        completed_at      = null,
        dop_refund_total  = p_dop_refund_total,
        refund_at_dop     = p_refund_at_dop,
        refund_account_id = p_refund_account_id,
        updated_at        = now()
    where id = p_purchase_order_id;
end;
$function$;
