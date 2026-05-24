-- round-31a-deals-stage1.sql
-- Deal of the Day / Deal of the Week -- STAGE 1 (database groundwork).
-- Reuses the existing warehouse_offers table (starts_at/ends_at/kind/...).
-- 1) Adds a `deal_slot` label ('daily' | 'weekly' | NULL).
-- 2) Adds a SAFE public view `store_offers` (owner-rights, customer-safe
--    columns only) returning ACTIVE, NON-EXPIRED featured deals with the
--    computed deal price. Auto-expiry is built in via ends_at.
-- Idempotent and safe to re-run.

alter table public.warehouse_offers
  add column if not exists deal_slot text;

alter table public.warehouse_offers
  drop constraint if exists warehouse_offers_deal_slot_chk;
alter table public.warehouse_offers
  add constraint warehouse_offers_deal_slot_chk
  check (deal_slot is null or deal_slot in ('daily', 'weekly'));

create or replace view public.store_offers as
select
  o.warehouse_id,
  o.product_id,
  o.deal_slot,
  o.title,
  o.banner_text,
  o.ends_at,
  o.priority,
  case o.kind
    when 'price_override' then o.override_price_cents
    when 'percent_discount' then
      round(coalesce(pws.price_override_cents, p.price_cents)
            * (1 - coalesce(o.percent_off, 0) / 100.0))::int
    when 'flat_discount' then
      greatest(0, coalesce(pws.price_override_cents, p.price_cents)
                  - coalesce(o.flat_off_cents, 0))
    else null
  end as deal_price_cents
from public.warehouse_offers o
join public.products p
  on p.id = o.product_id
 and p.is_active = true
 and p.visible_in_store = true
left join public.product_warehouse_settings pws
  on pws.product_id = o.product_id
 and pws.warehouse_id = o.warehouse_id
where o.deal_slot in ('daily', 'weekly')
  and o.is_active = true
  and o.product_id is not null
  and o.starts_at <= now()
  and (o.ends_at is null or o.ends_at > now())
  and coalesce(pws.is_visible, true) = true;

grant select on public.store_offers to anon, authenticated;