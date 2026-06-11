-- round-70a-fix-get-sale-return-info-types.sql
-- Bug: get_sale_return_info declares its money columns as bigint, but
-- sum(amount_cents) over a bigint column returns NUMERIC, so the RETURN QUERY
-- output shape (numeric) did not match the declared shape (bigint), raising
-- "structure of query does not match function result type" the first time the
-- Return-money dialog called it.
--
-- Fix: cast the three sum-derived columns to bigint. Values are whole cents,
-- so the cast is exact. Rebuilt verbatim from the LIVE body; only the three
-- ::bigint casts in the final SELECT are added. No logic change.

CREATE OR REPLACE FUNCTION public.get_sale_return_info(p_sale_id uuid)
 RETURNS TABLE(invoice_number text, collected_cents bigint, returned_cents bigint, returnable_cents bigint, suggested_account_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
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
    agg.cin::bigint,
    agg.cout::bigint,
    greatest(agg.cin - agg.cout, 0)::bigint,
    (select money_account_id from sugg)
  from sales s, agg
  where s.id = p_sale_id;
end;
$$;
