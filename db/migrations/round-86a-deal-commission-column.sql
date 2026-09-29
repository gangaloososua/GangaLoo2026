-- round-86a: optional deal commission % on discount rules (promotions).
-- While a promotion with commission_percent is live, that % replaces the
-- seller commission for its product (owner decision 2026-09-26: deal % wins
-- over seller personal overrides; online orders use the order-placed time).
alter table public.discount_rules
  add column if not exists commission_percent numeric;
alter table public.discount_rules
  drop constraint if exists discount_rules_commission_percent_chk;
alter table public.discount_rules
  add constraint discount_rules_commission_percent_chk
  check (commission_percent is null or (commission_percent >= 0 and commission_percent <= 100));
