-- ============================================================
-- Round 14b.0 ROLLBACK - reverses the schema preparation
--
-- Run order:
--   1. Roll back column changes (usd_total expression,
--      usd_discount)
--   2. Roll back enum value additions
--
-- Both parts are idempotent where possible. Part 2 (enum swap)
-- will fail if any purchase_orders row currently has
-- status = 'cancelled' or 'lost' - this is intentional. The
-- operator must update those rows to a valid value first; the
-- rollback refuses to silently drop status data.
-- ============================================================

-- ---- Roll back Part 2: regenerated usd_total + usd_discount

begin;

alter table public.purchase_orders
  drop column if exists usd_total;

alter table public.purchase_orders
  drop column if exists usd_discount;

alter table public.purchase_orders
  add column usd_total numeric(12,2)
    generated always as
      (usd_subtotal + usd_shipping + usd_tax)
    stored;

commit;

-- ---- Roll back Part 1: drop 'cancelled' and 'lost' enum values

-- Safety check: refuse to roll back if any rows use the
-- to-be-dropped values. The DO block raises an exception
-- before the type swap touches anything.
do $$
declare
  bad_count int;
begin
  select count(*) into bad_count
  from public.purchase_orders
  where status::text in ('cancelled', 'lost');
  if bad_count > 0 then
    raise exception
      'Cannot roll back enum values: % rows currently use '
      'cancelled or lost. Update those rows to a valid '
      'pre-14b status (pending/paid_supplier/received/complete) '
      'before re-running this rollback.',
      bad_count;
  end if;
end$$;

begin;

-- Rename current type out of the way.
alter type public.purchase_status rename to purchase_status_with_14b;

-- Recreate the original 4-value enum.
create type public.purchase_status as enum (
  'pending', 'paid_supplier', 'received', 'complete'
);

-- Switch the column over via cast.
alter table public.purchase_orders
  alter column status type public.purchase_status
  using status::text::public.purchase_status;

-- Drop the renamed-aside 6-value type.
drop type public.purchase_status_with_14b;

commit;
