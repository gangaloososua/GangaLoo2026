-- round-71a-return-money-resync-commissions.sql
-- Owner rule (2026-06-11): a "Return money" is an effective discount, so the
-- seller/distributor commission should be earned on the NET amount kept, not the
-- original invoice. Every Return money now re-syncs the sale's still-PENDING
-- commissions down to match. Already-PAID commissions are left untouched (they
-- cannot be silently clawed back) and reported back so they can be settled by hand.
--
-- Part 1: a small reusable helper that recomputes pending commissions for a sale
--         from the live ledger (total returned) and the items' line totals.
--         UNGATED + not granted to app users: only return_sale_money (security
--         definer) and the SQL editor can run it. Idempotent: safe to re-run; it
--         always recomputes from the cumulative amount returned.

CREATE OR REPLACE FUNCTION public.resync_pending_commissions(p_sale_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
declare
  v_total_returned bigint;
  v_base_total     bigint;
  v_count          int;
begin
  -- total money returned on this sale so far (negative ledger rows, as positive)
  select coalesce(-sum(amount_cents) filter (where amount_cents < 0), 0)
    into v_total_returned
    from transactions
   where source_sale_id = p_sale_id;

  -- the merchandise base = sum of the line totals
  select coalesce(sum(line_total_cents), 0)
    into v_base_total
    from sale_items
   where sale_id = p_sale_id;

  if v_base_total <= 0 then
    return 0;
  end if;

  -- For each PENDING commission, allocate the total returned across items in
  -- proportion to each line's total, drop that from the line's base, and
  -- recompute the commission at its own percent.
  update sale_commissions sc
     set amount_cents = round(
           greatest(
             si.line_total_cents
               - round(v_total_returned * si.line_total_cents::numeric / v_base_total),
             0
           ) * sc.percent / 100.0
         )::int
    from sale_items si
   where si.id = sc.sale_item_id
     and si.sale_id = p_sale_id
     and sc.status = 'pending';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Part 2: return_sale_money, rebuilt verbatim from the LIVE body, with two
--         additions only: (a) a v_comm_count variable, (b) a call to the helper
--         after the refund posts, and the count surfaced in the result.

CREATE OR REPLACE FUNCTION public.return_sale_money(p_sale_id uuid, p_amount_cents bigint, p_money_account_id uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
declare
  v_role       user_role;
  v_invoice    text;
  v_cin        bigint;
  v_cout       bigint;
  v_returnable bigint;
  v_category   uuid;
  v_scope      account_scope;
  v_desc       text;
  v_result     jsonb;
  v_comm_count int := 0;   -- Round 71: how many pending commissions were re-synced
begin
  -- Gate (post_transaction re-checks too, but fail early with a clean message).
  select role into v_role from profiles where auth_user_id = auth.uid();
  if v_role is null or v_role not in ('owner', 'admin') then
    raise exception 'permission denied: only owner/admin can return money'
      using errcode = '42501';
  end if;

  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Return amount must be greater than zero' using errcode = '22023';
  end if;
  if p_money_account_id is null then
    raise exception 'Choose an account to return the money from' using errcode = '22023';
  end if;

  select invoice_number into v_invoice from sales where id = p_sale_id;
  if v_invoice is null then
    raise exception 'Sale not found' using errcode = '22023';
  end if;

  -- How much came in vs already went back out, straight from the ledger.
  select
    coalesce(sum(amount_cents) filter (where amount_cents > 0), 0),
    coalesce(-sum(amount_cents) filter (where amount_cents < 0), 0)
  into v_cin, v_cout
  from transactions
  where source_sale_id = p_sale_id;

  v_returnable := v_cin - v_cout;
  if v_returnable <= 0 then
    raise exception 'Nothing left to return on % (collected %, already returned %)',
      v_invoice, v_cin, v_cout using errcode = '22023';
  end if;
  if p_amount_cents > v_returnable then
    raise exception 'You can return at most % on % (already returned %)',
      v_returnable, v_invoice, v_cout using errcode = '22023';
  end if;

  -- Copy category + scope from an inflow row (prefer the chosen account) so the
  -- refund nets against the same income line.
  select category_id, scope
  into v_category, v_scope
  from transactions
  where source_sale_id = p_sale_id and amount_cents > 0
  order by (money_account_id = p_money_account_id) desc, occurred_at desc
  limit 1;

  if v_category is null then
    raise exception 'Could not find the original payment category for %', v_invoice
      using errcode = '22023';
  end if;

  v_desc := 'Refund ' || v_invoice ||
            case when nullif(btrim(p_note), '') is not null
                 then ' — ' || btrim(p_note) else '' end;

  -- Post the negative (money-out) entry through the audited engine.
  v_result := post_transaction(jsonb_build_object(
    'money_account_id', p_money_account_id,
    'category_id',      v_category,
    'amount_cents',     (-p_amount_cents),
    'scope',            v_scope::text,
    'description',      v_desc,
    'source_sale_id',   p_sale_id
  ));

  -- Round 71: the refund is now posted, so the ledger reflects the full amount
  -- returned. Re-sync the sale's PENDING commissions to the net amount kept.
  v_comm_count := public.resync_pending_commissions(p_sale_id);

  return jsonb_build_object(
    'ok', true,
    'invoice_number', v_invoice,
    'returned_cents', p_amount_cents,
    'remaining_returnable_cents', v_returnable - p_amount_cents,
    'pending_commissions_adjusted', v_comm_count,
    'transaction', v_result
  );
end;
$$;
