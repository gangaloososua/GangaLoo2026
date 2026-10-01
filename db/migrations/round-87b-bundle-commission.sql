-- round-87b: bundle commission. A bundle rule may carry commission_percent
-- (column from round-86a). Sale lines that received that bundle pay the
-- seller that % (flat for every product in the bundle; whole line).
-- Order: bundle % -> live deal % (round-86c) -> seller personal % -> product %.
-- Applies in confirm_pos_sale (rule ids from the line's discount_breakdown)
-- and confirm_storefront_order (rule ids from sale_discount_applications).
-- Patches the round-86c line in each live function; stops if not found once.
create or replace function public.bundle_commission_percent(p_rule_ids uuid[])
returns numeric
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select d.commission_percent
    from discount_rules d
   where d.id = any(coalesce(p_rule_ids, '{}'::uuid[]))
     and d.kind = 'bundle'::discount_rule_kind
     and d.commission_percent is not null
   order by d.priority desc, d.created_at asc
   limit 1;
$function$;
revoke all on function public.bundle_commission_percent(uuid[]) from public, anon, authenticated;

do $$
declare
  r record;
  d text;
begin
  for r in
    select * from (values
      ('public.confirm_pos_sale(jsonb)',
       'v_commission_percent := COALESCE(public.deal_commission_percent(v_product_id, v_source_warehouse_id, now()), v_seller_override, v_product_default_pct, 0); -- round-86c: live deal commission wins',
       'v_commission_percent := COALESCE(public.bundle_commission_percent(array(select (e->>''rule_id'')::uuid from jsonb_array_elements(coalesce(v_item->''discount_breakdown'', ''[]''::jsonb)) e where nullif(e->>''rule_id'', '''') is not null)), public.deal_commission_percent(v_product_id, v_source_warehouse_id, now()), v_seller_override, v_product_default_pct, 0); -- round-87b: bundle %, then live deal %'),
      ('public.confirm_storefront_order(uuid, uuid)',
       'v_seller_pct := coalesce(public.deal_commission_percent(v_item.product_id, v_source_wh, (select s.sold_at from sales s where s.id = p_sale_id)), v_seller_override, v_product_default_pct, 0); -- round-86c: deal live when the order was placed wins',
       'v_seller_pct := coalesce(public.bundle_commission_percent(array(select a.discount_rule_id from sale_discount_applications a where a.sale_item_id = v_item.id and a.discount_rule_id is not null)), public.deal_commission_percent(v_item.product_id, v_source_wh, (select s.sold_at from sales s where s.id = p_sale_id)), v_seller_override, v_product_default_pct, 0); -- round-87b: bundle %, then deal % at order time')
    ) as t(sig, old_line, new_line)
  loop
    d := pg_get_functiondef(r.sig::regprocedure);
    if (length(d) - length(replace(d, r.old_line, ''))) / length(r.old_line) <> 1 then
      raise exception 'Stopped: target line not found exactly once in %', r.sig;
    end if;
    execute replace(d, r.old_line, r.new_line);
  end loop;
end $$;
