-- ============================================================================
-- Round 41b: Cancel reverses part-payments (no stranded money) + FK-order fix.
--
-- Two functions that "undo a part-payment" must delete the part row BEFORE
-- reversing its ledger line, because purchase_order_payments.transaction_id is
-- a foreign key to transactions(id): reverse_transaction deletes the ledger
-- row, which the FK blocks while the part row still references it.
--
--   mark_cancelled          - cancelling a PENDING order now returns every
--                             part-payment to the accounts it came from, then
--                             marks it cancelled. (Fully-paid orders keep the
--                             existing manual "Record a refund" behaviour.)
--   remove_supplier_payment - the single-payment "remove" (trash button) had
--                             the same FK-order bug; fixed here too.
--
-- Everything else in both functions is unchanged.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- mark_cancelled
-- ----------------------------------------------------------------------------
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

  -- Status flip + optional refund record. One UPDATE so partial writes can't happen.
  update public.purchase_orders
    set status            = 'cancelled',
        completed_at      = now(),
        dop_refund_total  = p_dop_refund_total,
        refund_at_dop     = p_refund_at_dop,
        refund_account_id = p_refund_account_id,
        updated_at        = now()
    where id = p_purchase_order_id;
end;
$function$;

-- ----------------------------------------------------------------------------
-- remove_supplier_payment (FK-order fix: delete row before reversing line)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.remove_supplier_payment(p_payment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role       user_role;
  v_profile_id uuid;
  v_po         uuid;
  v_status     purchase_status;
  v_txn        uuid;
begin
  select id, role into v_profile_id, v_role
    from public.profiles where auth_user_id = auth.uid();
  if v_role is null or v_role not in ('owner','admin') then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  select purchase_order_id, transaction_id into v_po, v_txn
    from public.purchase_order_payments where id = p_payment_id;
  if not found then
    raise exception 'part-payment % not found', p_payment_id;
  end if;

  select status into v_status from public.purchase_orders where id = v_po for update;
  if v_status <> 'pending' then
    raise exception 'cannot remove a part-payment: order % is %, use Correct payment instead',
                    v_po, v_status;
  end if;

  -- Delete the part row FIRST (it holds an FK to the ledger line), then reverse.
  delete from public.purchase_order_payments where id = p_payment_id;
  if v_txn is not null then
    perform public.reverse_transaction(v_txn);
  end if;

  return jsonb_build_object('ok', true, 'purchase_order_id', v_po);
end;
$function$;

-- ============================================================================
-- End round 41b.
-- ============================================================================
