-- round-85h: public read-only list of LIVE bundles for the online store.
-- Same pattern as store_promotions (round-62a). Only active, in-window
-- bundles with 2+ items, all of which are active + visible in the store.
create or replace view public.store_bundles as
  select
    d.id,
    d.name,
    d.image_url,
    d.scope_warehouse_id as warehouse_id,
    d.delta_cents        as price_cents,
    d.ends_at,
    d.priority,
    d.created_at,
    (select jsonb_agg(jsonb_build_object('product_id', b.product_id, 'qty', b.qty)
                      order by b.product_id)
       from discount_rule_bundle_items b
      where b.rule_id = d.id) as items
  from discount_rules d
  where d.kind = 'bundle'::discount_rule_kind
    and d.is_active = true
    and d.delta_cents > 0
    and (d.starts_at is null or d.starts_at <= now())
    and (d.ends_at   is null or d.ends_at   >= now())
    and (select count(*) from discount_rule_bundle_items b where b.rule_id = d.id) >= 2
    and not exists (
      select 1
        from discount_rule_bundle_items b
        join products p on p.id = b.product_id
       where b.rule_id = d.id
         and not (p.is_active and p.visible_in_store)
    );
grant select on public.store_bundles to anon, authenticated;
