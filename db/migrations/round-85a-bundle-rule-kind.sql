-- round-80a: add 'bundle' discount rule kind (set price for products bought together)
-- Must run alone: a new enum value can't be used in the same transaction it's added.
alter type public.discount_rule_kind add value if not exists 'bundle';
