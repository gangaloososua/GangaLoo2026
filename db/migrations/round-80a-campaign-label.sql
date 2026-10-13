-- round-80a: seasonal campaign label on promotion rules
-- (applied live 2026-10-13; this file is the record)
--
-- discount_rules.campaign = optional label (e.g. 'halloween') grouping
-- ordinary promotion rules into a seasonal campaign. Exposed on the
-- store_promotions view so the storefront can show a themed box.
-- Additive only: NULL for every existing rule, nothing else changes.

alter table public.discount_rules
  add column if not exists campaign text;

create index if not exists discount_rules_campaign_idx
  on public.discount_rules (campaign)
  where campaign is not null;

create or replace view public.store_promotions as
 SELECT id,
    scope_product_id AS product_id,
    scope_warehouse_id AS warehouse_id,
    deal_slot,
    delta_percent,
    ends_at,
    priority,
    campaign
   FROM discount_rules dr
  WHERE kind = 'promotion'::discount_rule_kind
    AND is_active = true
    AND scope_product_id IS NOT NULL
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at IS NULL OR ends_at > now());
