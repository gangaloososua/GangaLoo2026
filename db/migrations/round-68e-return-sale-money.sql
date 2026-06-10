-- Round 68e — Return money on a sale (cash refund through the ledger)
-- ============================================================================
-- "Return money" is a SEPARATE, owner-pressed action from the goods-refund.
-- It posts a NEGATIVE (money-out) entry through the existing post_transaction
-- engine, so the account balance drops and an audited "Refund FAC-xxxx" row
-- appears. Supports PARTIAL returns (call again later); never returns more than
-- was actually collected minus what's already been returned — all computed
-- straight from the ledger (no new columns).
--
-- Reuses the SAME category + scope as the sale's original payment, so reports
-- net correctly. v1 deliberately does NOT change the invoice's paid_cents /
-- status — cash handling stays separate from invoice status.
--
-- Both functions are owner/admin only and run via the regular server client
-- (they gate on auth.uid()), exactly like post_transaction / reverse_transaction.
-- ============================================================================

-- ---- Read helper: prefill the Return-money dialog -----------------------
create or replace function public.get_sale_return_info(p_sale_id uuid)
returns table (
  invoice_number       text,
  collected_cents      bigint,
  returned_cents       bigint,
  returnable_cents     bigint,
  suggested_account_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role user_role;
begin
  select role into v_role from profiles where auth_user_id = auth.uid();
  if v_role is null or v_role not in ('owner', 'admin') then
    raise exception 'permission denied: only owner/admin' using errcode = '42501';
  end if;

  return query
  with infl as (
    select t.money_account_id, t.amount_cents, t.occurred_at
    from transactions t
    where t.source_sale_id = p_sale_id
  ),
  agg as (
    select
      coalesce(sum(amount_cents) filter (where amount_cents > 0), 0)  as cin,
      coalesce(-sum(amount_cents) filter (where amount_cents < 0), 0) as cout
    from infl
  ),
  sugg as (
    select money_account_id
    from infl
    where amount_cents > 0
    order by occurred_at desc
    limit 1
  )
  select
    s.invoice_number,
    agg.cin,
    agg.cout,
    greatest(agg.cin - agg.cout, 0),
    (select money_account_id from sugg)
  from sales s, agg
  where s.id = p_sale_id;
end;
$$;

-- ---- The cash-out action ------------------------------------------------
create or replace function public.return_sale_money(
  p_sale_id          uuid,
  p_amount_cents     bigint,
  p_money_account_id uuid,
  p_note             text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

  return jsonb_build_object(
    'ok', true,
    'invoice_number', v_invoice,
    'returned_cents', p_amount_cents,
    'remaining_returnable_cents', v_returnable - p_amount_cents,
    'transaction', v_result
  );
end;
$$;

-- ---- Grants -------------------------------------------------------------
grant execute on function public.get_sale_return_info(uuid)                 to authenticated, service_role;
grant execute on function public.return_sale_money(uuid, bigint, uuid, text) to authenticated, service_role;

-- End of Round 68e.
