-- round-86c: seller commission uses a live deal's commission % first.
-- Patches ONE line in each of the 4 live functions (read from
-- pg_get_functiondef, so it always starts from the live body). Stops and
-- changes nothing if the target line isn't found exactly once.
--   confirm_pos_sale, create_online_order : deal live now, at the source store
--   confirm_storefront_order             : deal live when the order was PLACED (sales.sold_at)
--   edit_unpaid_sale                     : deal live at the original sale time (sales.sold_at)
-- Verified 2026-09-26: all 4 are SECURITY DEFINER, so the helper stays revoked.
do $$
declare
  r record;
  d text;
  v_invoker boolean := false;
begin
  for r in
    select * from (values
      ('public.confirm_pos_sale(jsonb)',
       'v_commission_percent := COALESCE(v_seller_override, v_product_default_pct, 0);',
       'v_commission_percent := COALESCE(public.deal_commission_percent(v_product_id, v_source_warehouse_id, now()), v_seller_override, v_product_default_pct, 0); -- round-86c: live deal commission wins'),
      ('public.confirm_storefront_order(uuid, uuid)',
       'v_seller_pct := coalesce(v_seller_override, v_product_default_pct, 0);',
       'v_seller_pct := coalesce(public.deal_commission_percent(v_item.product_id, v_source_wh, (select s.sold_at from sales s where s.id = p_sale_id)), v_seller_override, v_product_default_pct, 0); -- round-86c: deal live when the order was placed wins'),
      ('public.create_online_order(jsonb)',
       'v_seller_pct := COALESCE(v_seller_override, v_product_default_pct, 0);',
       'v_seller_pct := COALESCE(public.deal_commission_percent(v_product_id, v_source_warehouse_id, now()), v_seller_override, v_product_default_pct, 0); -- round-86c: live deal commission wins'),
      ('public.edit_unpaid_sale(uuid, jsonb, integer)',
       'v_commission_percent := coalesce(v_seller_override, v_product_default_pct, 0);',
       'v_commission_percent := coalesce(public.deal_commission_percent(v_product_id, v_src_wh, (select s.sold_at from sales s where s.id = p_sale_id)), v_seller_override, v_product_default_pct, 0); -- round-86c: deal live at the original sale time wins')
    ) as t(sig, old_line, new_line)
  loop
    d := pg_get_functiondef(r.sig::regprocedure);
    if (length(d) - length(replace(d, r.old_line, ''))) / length(r.old_line) <> 1 then
      raise exception 'Stopped: target line not found exactly once in %', r.sig;
    end if;
    execute replace(d, r.old_line, r.new_line);
    if not (select prosecdef from pg_proc where oid = r.sig::regprocedure) then
      v_invoker := true;
    end if;
  end loop;
  if v_invoker then
    grant execute on function public.deal_commission_percent(uuid, uuid, timestamptz) to authenticated;
  end if;
end $$;
