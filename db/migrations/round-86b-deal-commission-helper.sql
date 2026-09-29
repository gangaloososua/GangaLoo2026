-- round-86b: deal_commission_percent(product, warehouse, at) -> seller
-- commission % from a LIVE promotion, or NULL. Used by the sale/order
-- functions as coalesce(deal %, seller personal %, product %, 0).
create or replace function public.deal_commission_percent(
  p_product_id   uuid,
  p_warehouse_id uuid,
  p_at           timestamptz default now()
)
returns numeric
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select d.commission_percent
    from discount_rules d
   where d.kind = 'promotion'::discount_rule_kind
     and d.is_active
     and d.commission_percent is not null
     and d.scope_product_id = p_product_id
     and (d.scope_warehouse_id is null or d.scope_warehouse_id = p_warehouse_id)
     and (d.starts_at is null or d.starts_at <= p_at)
     and (d.ends_at   is null or d.ends_at   >  p_at)
   order by d.priority desc nulls last, d.delta_percent desc, d.created_at asc
   limit 1;
$function$;
revoke all on function public.deal_commission_percent(uuid, uuid, timestamptz) from public, anon, authenticated;
