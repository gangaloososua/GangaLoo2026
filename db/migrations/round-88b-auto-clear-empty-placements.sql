-- round-88b: remove shelf placements automatically when a product runs out.
-- After any change to inventory_lots (sale, transfer, adjustment...), if a
-- product's total qty_remaining in a warehouse is 0, its product_locations in
-- that warehouse are deleted. Non-inventory products are skipped.
-- Plus a one-time cleanup of placements that were already out of stock
-- (run 2026-10-21: 139 in-stock placements remained).
create or replace function public._clear_empty_placements()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  k record;
begin
  for k in
    select distinct x.product_id, x.warehouse_id
      from (select new.product_id, new.warehouse_id where tg_op <> 'DELETE'
            union all
            select old.product_id, old.warehouse_id where tg_op <> 'INSERT') x
     where x.product_id is not null and x.warehouse_id is not null
  loop
    if coalesce((select is_inventory from products where id = k.product_id), true)
       and coalesce((select sum(qty_remaining) from inventory_lots
                      where product_id = k.product_id
                        and warehouse_id = k.warehouse_id), 0) <= 0 then
      delete from product_locations pl
       using storage_locations sl
       where pl.location_id = sl.id
         and sl.warehouse_id = k.warehouse_id
         and pl.product_id = k.product_id;
    end if;
  end loop;
  return null;
end;
$function$;
revoke all on function public._clear_empty_placements() from public, anon, authenticated;

drop trigger if exists trg_clear_empty_placements on public.inventory_lots;
create trigger trg_clear_empty_placements
  after insert or delete or update of qty_remaining, product_id, warehouse_id
  on public.inventory_lots
  for each row execute function public._clear_empty_placements();

delete from product_locations pl
 using storage_locations sl, products p
 where pl.location_id = sl.id
   and p.id = pl.product_id
   and coalesce(p.is_inventory, true)
   and coalesce((select sum(il.qty_remaining) from inventory_lots il
                  where il.product_id = pl.product_id
                    and il.warehouse_id = sl.warehouse_id), 0) <= 0;
