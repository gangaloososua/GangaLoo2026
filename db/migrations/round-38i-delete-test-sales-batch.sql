-- round-38i-delete-test-sales-batch.sql  (v2 -- safe add-back method)
-- One-time cleanup: delete 11 TEST sales and reverse their side-effects.
--
-- Sales removed (existing ones only; missing ONL numbers simply don't exist):
--   ONL-0001 (confirmed), ONL-0003 (cancelled), ONL-0004 (cancelled),
--   ONL-0005 (paid), ONL-0006 (cancelled), ONL-0011 (draft), ONL-0012 (confirmed),
--   ONL-0013 (draft), ONL-0014 (draft), ONL-0015 (draft), ONL-0019 (draft),
--   FAC-2889 (refunded).
--
-- STOCK HANDLING -- corrected method:
--   We do NOT recompute whole lots. The sale_lot_consumption table does NOT
--   hold full lot history (e.g. lot c5cd5ef6 received 9, shows 8 sold, but only
--   1 consumption row exists), so a recompute would erase real sold units.
--   Instead we ADD BACK only the units the deleted test orders are CURRENTLY
--   holding -- i.e. the qty_consumed on the consumption rows we are about to
--   delete. Orders that already restocked (their unit is back in the lot) have
--   no effect because we add back exactly what is still recorded as consumed.
--
--   Per-lot effect (from the verified lot map):
--     0d093c91: +1 (ONL-0001 holding; 0003/0004 already returned)  2 -> 3
--     74453bcb: +1 (ONL-0012 holding)                              2 -> 3
--     305afc7a: +2 (FAC-2889 + ONL-0005 both still out)            0 -> 2
--     c5cd5ef6: +1 (ONL-0006 row still present)                    8 -> 9 ??  <-- see note
--
--   NOTE on c5cd5ef6: ONL-0006's consumption row says qty_consumed=1, but the
--   lot already shows that unit returned (cancel restocked it) -- the row is
--   stale. Adding it back would wrongly inflate 8 -> 9. To stay safe we add
--   back a lot's deleted-consumption ONLY for lots where doing so does not
--   exceed qty_received. c5cd5ef6 is already at 8 of 9; +1 would hit 9 which
--   equals received, but the 8 is the trusted figure -- so we CAP at
--   qty_received and, for this stale-cancel case, the cap plus the trusted
--   current value would still misfire. Therefore we exclude already-restocked
--   rows by only adding back consumption from sales whose unit is demonstrably
--   still out. Simplest robust rule: new_remaining = LEAST(qty_received,
--   current_remaining + deleted_consumption_for_this_lot) is NOT safe here.
--
--   => Cleanest correct approach: add back per-lot a HARD-CODED amount derived
--      from the verified map, which we have. This avoids all stale-row guessing.
--
-- SAFETY: ends in ROLLBACK. Running as-is changes NOTHING; previews + undoes.
-- To apply, change the final `rollback;` to `commit;` and re-run.

begin;

create temporary table _victims on commit drop as
select id, invoice_number
from public.sales
where invoice_number in (
  'ONL-0001','ONL-0003','ONL-0004','ONL-0005','ONL-0006',
  'ONL-0011','ONL-0012','ONL-0013','ONL-0014','ONL-0015',
  'ONL-0019','FAC-2889'
);

-- 1) Ledger
delete from public.transactions t
where t.source_sale_id in (select id from _victims)
   or t.source_sale_payment_id in (
        select sp.id from public.sale_payments sp where sp.sale_id in (select id from _victims)
      );

-- 2) stock_movements
delete from public.stock_movements sm
where sm.sale_item_id in (select si.id from public.sale_items si where si.sale_id in (select id from _victims));

-- 3) sale_lot_consumption
delete from public.sale_lot_consumption slc
where slc.sale_item_id in (select si.id from public.sale_items si where si.sale_id in (select id from _victims));

-- 4) sale_commissions
delete from public.sale_commissions sc
where sc.sale_item_id in (select si.id from public.sale_items si where si.sale_id in (select id from _victims));

-- 5) sale_discount_applications
delete from public.sale_discount_applications sda
where sda.sale_item_id in (select si.id from public.sale_items si where si.sale_id in (select id from _victims))
   or sda.sale_id in (select id from _victims);

-- 6) sale_payments
delete from public.sale_payments sp where sp.sale_id in (select id from _victims);

-- 7) seller_cash_collections (none found; defensive)
delete from public.seller_cash_collections scc where scc.sale_id in (select id from _victims);

-- 8) sale_items
delete from public.sale_items si where si.sale_id in (select id from _victims);

-- 9) sales
delete from public.sales where id in (select id from _victims);

-- 10) Restore stock -- explicit, verified per-lot amounts (no recompute, no stale-row guessing)
update public.inventory_lots set qty_remaining = qty_remaining + 1 where id = '0d093c91-edf2-4f6b-b8a9-10353ee6f736'; -- ONL-0001
update public.inventory_lots set qty_remaining = qty_remaining + 1 where id = '74453bcb-8840-43e7-85c5-43b6263ef4eb'; -- ONL-0012
update public.inventory_lots set qty_remaining = qty_remaining + 2 where id = '305afc7a-9c94-48e7-a3d7-5c6c291d5265'; -- FAC-2889 + ONL-0005
-- c5cd5ef6: ONL-0006 already restocked on cancel; add back 0 (no statement).

-- --- verification ---
select 'sales_left (want 0)' as check, count(*)::text as value
  from public.sales
  where invoice_number in (
    'ONL-0001','ONL-0003','ONL-0004','ONL-0005','ONL-0006',
    'ONL-0011','ONL-0012','ONL-0013','ONL-0014','ONL-0015',
    'ONL-0019','FAC-2889'
  )
union all
select 'lot 0d093c91 (want 3)', qty_remaining::text from public.inventory_lots where id = '0d093c91-edf2-4f6b-b8a9-10353ee6f736'
union all
select 'lot 74453bcb (want 3)', qty_remaining::text from public.inventory_lots where id = '74453bcb-8840-43e7-85c5-43b6263ef4eb'
union all
select 'lot 305afc7a (want 2)', qty_remaining::text from public.inventory_lots where id = '305afc7a-9c94-48e7-a3d7-5c6c291d5265'
union all
select 'lot c5cd5ef6 (want 8)', qty_remaining::text from public.inventory_lots where id = 'c5cd5ef6-a9c6-402a-9f0f-0b5c99c059e6'
order by 1;

-- Preview only. Change to `commit;` to apply for real.
rollback;
