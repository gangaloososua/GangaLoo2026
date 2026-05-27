-- round-38h-delete-test-sales-paid-pair.sql
-- One-time cleanup: delete TEST sales FAC-2891 and FAC-2892 (both 'paid'),
-- fully reversing their side-effects so inventory and ledger stay correct.
--
-- What this undoes, in order:
--   1. Restores consumed stock to its lot(s) -- read from the actual
--      sale_lot_consumption rows, so it adds back EXACTLY what was taken.
--   2. Deletes the ledger (transactions) rows tied to these sales,
--      directly (source_sale_id) or via their payment (source_sale_payment_id).
--   3. Deletes stock_movements, sale_lot_consumption, sale_commissions,
--      sale_discount_applications, sale_payments, sale_items.
--   4. Deletes the two sales rows.
--   5. Prints a verification summary.
--
-- SAFETY: wrapped in a transaction ending in ROLLBACK -> running it as-is
-- changes NOTHING; it previews the result and undoes itself. To apply for
-- real, change the final word `rollback;` to `commit;` and run once more.
--
-- Scope is pinned to two exact invoice numbers; nothing else can be touched.

begin;

-- 1) Restore stock to the lot(s), based on what was actually consumed
update public.inventory_lots il
set qty_remaining = il.qty_remaining + agg.qty
from (
  select slc.lot_id, sum(slc.qty_consumed) as qty
  from public.sale_lot_consumption slc
  join public.sale_items si on si.id = slc.sale_item_id
  join public.sales s on s.id = si.sale_id
  where s.invoice_number in ('FAC-2891','FAC-2892')
  group by slc.lot_id
) agg
where il.id = agg.lot_id;

-- 2) Ledger entries (delete before sale_payments / sales they reference)
delete from public.transactions t
where t.source_sale_id in (
        select id from public.sales where invoice_number in ('FAC-2891','FAC-2892')
      )
   or t.source_sale_payment_id in (
        select sp.id from public.sale_payments sp
        join public.sales s on s.id = sp.sale_id
        where s.invoice_number in ('FAC-2891','FAC-2892')
      );

-- 3) stock_movements
delete from public.stock_movements sm
where sm.sale_item_id in (
  select si.id from public.sale_items si
  join public.sales s on s.id = si.sale_id
  where s.invoice_number in ('FAC-2891','FAC-2892')
);

-- 4) sale_lot_consumption
delete from public.sale_lot_consumption slc
where slc.sale_item_id in (
  select si.id from public.sale_items si
  join public.sales s on s.id = si.sale_id
  where s.invoice_number in ('FAC-2891','FAC-2892')
);

-- 5) sale_commissions (both pending -> nothing paid out)
delete from public.sale_commissions sc
where sc.sale_item_id in (
  select si.id from public.sale_items si
  join public.sales s on s.id = si.sale_id
  where s.invoice_number in ('FAC-2891','FAC-2892')
);

-- 6) sale_discount_applications (by sale_item OR sale)
delete from public.sale_discount_applications sda
where sda.sale_item_id in (
        select si.id from public.sale_items si
        join public.sales s on s.id = si.sale_id
        where s.invoice_number in ('FAC-2891','FAC-2892')
      )
   or sda.sale_id in (
        select id from public.sales where invoice_number in ('FAC-2891','FAC-2892')
      );

-- 7) sale_payments
delete from public.sale_payments sp
where sp.sale_id in (
  select id from public.sales where invoice_number in ('FAC-2891','FAC-2892')
);

-- 8) sale_items
delete from public.sale_items si
where si.sale_id in (
  select id from public.sales where invoice_number in ('FAC-2891','FAC-2892')
);

-- 9) sales
delete from public.sales
where invoice_number in ('FAC-2891','FAC-2892');

-- --- verification (shown before the rollback/commit) ---
select 'sales_left (want 0)'            as check, count(*)::text as value
  from public.sales where invoice_number in ('FAC-2891','FAC-2892')
union all
select 'lot c5cd5ef6 qty_remaining (want 8)', qty_remaining::text
  from public.inventory_lots where id = 'c5cd5ef6-a9c6-402a-9f0f-0b5c99c059e6';

-- Preview only. Change to `commit;` to apply for real.
rollback;
