-- round-85b: bundle rule shape check + discount_rule_bundle_items table
begin;
alter table public.discount_rules drop constraint discount_rules_shape_check;
alter table public.discount_rules add constraint discount_rules_shape_check check (
     ((kind = 'bulk'::discount_rule_kind) and (threshold_qty is not null) and (delta_percent is not null))
  or ((kind = 'club_tier'::discount_rule_kind) and (scope_club_tier is not null) and (delta_percent is not null))
  or ((kind = 'promotion'::discount_rule_kind) and (delta_percent is not null))
  or ((kind = 'customer_override'::discount_rule_kind) and (scope_customer_id is not null) and (delta_percent is not null))
  or ((kind = 'logistics_surcharge'::discount_rule_kind) and (delta_cents is not null) and (delta_cents > 0))
  or ((kind = 'coupon'::discount_rule_kind) and (code is not null) and (
        ((delta_percent is not null) and (delta_cents is null) and (delta_percent > 0) and (delta_percent <= 100))
     or ((delta_cents is not null) and (delta_percent is null) and (delta_cents > 0))))
  or ((kind = 'bundle'::discount_rule_kind) and (delta_cents is not null) and (delta_cents > 0) and (delta_percent is null))
);
create table if not exists public.discount_rule_bundle_items (
  rule_id    uuid not null references public.discount_rules(id) on delete cascade,
  product_id uuid not null references public.products(id),
  qty        integer not null default 1 check (qty > 0),
  primary key (rule_id, product_id)
);
create index if not exists discount_rule_bundle_items_product_idx
  on public.discount_rule_bundle_items (product_id);
alter table public.discount_rule_bundle_items enable row level security;
commit;
