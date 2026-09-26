-- round-85d: optional image for a discount rule (used by bundles on the online store).
-- Images live in the public 'product-images' bucket under bundles/<rule_id>/.
-- Existing bucket policies already allow authenticated upload/delete there.
alter table public.discount_rules
  add column if not exists image_url text;
