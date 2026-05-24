-- round-32c-retire-store-offers.sql
-- Deals stage 3c cleanup. Online deals now run entirely through discount_rules
-- promotions (see round-32a + the store_promotions view), so the original
-- warehouse_offers experiment from stages 1-2 is retired:
--   * drop the store_offers view (no longer read by catalog or checkout)
--   * drop the deal_slot column + check we added to warehouse_offers
-- The warehouse_offers table itself is left in place (it pre-existed, unused).
-- Run AFTER deploying the catalog change that reads store_promotions.

drop view if exists public.store_offers;
alter table public.warehouse_offers drop constraint if exists warehouse_offers_deal_slot_chk;
alter table public.warehouse_offers drop column if exists deal_slot;