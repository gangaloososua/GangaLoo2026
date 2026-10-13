# GangaLoo — Handoff Addendum (2026-10-13)

_Appended to the prior handoffs. Same owner (**Bernhard Perkins**, non-technical), same workflow: work **one step at a time**, plain language, **DB before dependent code**, deliver whole files + a PowerShell move script, then `npx tsc --noEmit` → `git add` (explicit paths) → `git commit` → `git push` (**commit before push**; a pre-commit hook runs tsc). SQL is run by the owner in the **Supabase SQL Editor** ("Success. No rows returned" is the normal reply to an UPDATE/INSERT/CREATE). Repo remote is `github.com/gangaloososua/GangaLoo2026.git` (master)._

_This addendum covers **system changes only** (code + database). One-off corrections to individual products, orders, sales or customers made during the session are deliberately left out._

---

## A. Code changes shipped (all committed, pushed, live)

| Commit | What |
| --- | --- |
| `266c532` | **Mobile transfer form + search names** (see B) |
| `229d3af` | **Dashboard period boundaries use Dominican time** (see C) — `lib/dashboard.ts` |
| `d7096bb` | **P&L + Sales Analysis reports: same timezone fix** — `lib/pnl.ts`, `lib/sales-report.ts` |
| `ced5c2e` | **Commission Statements: same timezone fix** — `lib/commissions-report.ts` |
| `dea90c1` | **Register search matches each word independently** — `lib/pos-register.ts` (see D) |
| `65f49f3` | **Register: "new customer" button in the customer picker** — `app/(dashboard)/caja/customer-picker.tsx` (see E) |

---

## B. Mobile: transfer form quantity stepper + readable product names (`266c532`)

- `app/(dashboard)/transfers/new/new-transfer-form.tsx` — on phones (`sm:hidden`) each line is now a stacked card with real **−/+ buttons** and an editable qty box (`inputMode="numeric"`). The original table is kept for `sm:` and up (`hidden sm:block`) and also got −/+ buttons. New `bumpQty()` helper; qty still floors at 1; over-stock warning unchanged.
- `app/(dashboard)/sales/new/product-search.tsx` — the product name in the search dropdown is `line-clamp-2 break-words` instead of `truncate` (it was cut to one line). This component is **shared** (New Sale, online order, edit-products, transfers).

---

## C. Dominican Republic timezone fix for reports (`229d3af`, `d7096bb`, `ced5c2e`)

**Problem:** sales made roughly 8 PM–midnight Dominican time (UTC-4) landed in the NEXT month on the dashboard/reports (e.g. FAC-3009, sold 30 Sept 8:37 PM local = 1 Oct 00:37 UTC, showed under October).

**Two stacked causes:** (1) `computePeriods`-style helpers read "today" with `new Date().getFullYear()/getMonth()/getDate()`, which on Netlify (UTC) is not the DR calendar date; (2) the bounds were sent to Postgres as bare `YYYY-MM-DD` strings, which it casts using the **session timezone (UTC)**.

**Fix (identical in all four files):** "today" comes from `Intl.DateTimeFormat` with `timeZone: 'America/Santo_Domingo'` (`drToday`), calendar math is done on UTC-anchored dates (`addDays`), and every bound is sent as an explicit ISO timestamp with `-04:00` (`drMidnightISO`). DR has no daylight saving, so the offset is constant.

**Files fixed:** `lib/dashboard.ts` (this-month / last-30 / this-year), `lib/pnl.ts` and `lib/sales-report.ts` and `lib/commissions-report.ts` (this-month / last-month / this-year / custom range — custom start/end dates are DR calendar dates anchored at DR midnight).

**Already correct / not affected:** Inventory Valuation (already used Intl DR); Receivables Aging and Who-owes-me (point-in-time, no period filter).

**Not changed:** the SQL functions (`dashboard_overview`, `pnl_report`, `sales_report`, `commissions_report`) just take whatever bounds they are given. Stored timestamps were never wrong, so nothing retroactive was needed.

**Rule going forward:** never derive a Dominican date from the server's local `Date` getters; use the DR helpers above.

---

## D. Register search matches each word independently (`dea90c1`)

- `lib/pos-register.ts` (`listProductsForRegister`) searched the whole query as ONE phrase (`name.ilike.%11a faloo%`), so a search for `11a faloo` never found `Lacio 11A Bob 13x4 180% 12" Negro FaLoo`. It now splits the sanitized query on spaces and requires each word to match sku OR name (AND across words).
- An earlier handoff note said this was already done for the register; it was **not** actually in the file until now.
- **Not verified this session:** older notes flagged other search boxes (Transfers, Online orders, Labels) as possibly having the same single-phrase behaviour.

---

## E. Register: add a customer from the picker (`65f49f3`)

- `app/(dashboard)/caja/customer-picker.tsx` now has a small person-with-plus button beside "Choose customer (optional)". It opens the existing **`QuickCustomerDialog`** (`app/(dashboard)/sales/new/quick-customer-dialog.tsx`, which calls `createCustomerQuick` → RPC `create_customer_quick`, open to owner/admin/seller/distributor). The new customer is attached to the sale immediately (same `ScannedMember` shape the card scan uses) and stays in the dropdown for the session.
- The picker no longer disappears when the customer list is empty.
- **Database side** (see F2): `create_customer_quick` now refuses duplicate phone numbers. **This guard has not yet been confirmed in the live app** (the SQL Editor can't test it because the function checks `auth.uid()`).

---

## F. Database changes (run directly in the Supabase SQL Editor — **no `db/migrations` record files were created yet**)

Read any live body with `select pg_get_functiondef(oid) from pg_proc where proname = '<name>' and pronamespace = 'public'::regnamespace;`.

### F1. `mark_received(p_purchase_order_id, p_receipts)` — two changes
1. **Now writes a `stock_movements` row (`kind = 'purchase_in'`, with `lot_id`, `purchase_order_item_id`, `created_by`) next to every inventory lot it creates**, copying the pattern in `receive_stock_transfer`. Before, receiving created the lot but no movement, so receipts were missing from Inventory → History (since about 1 June 2026). Stock counts (`inventory_lots.qty_remaining`) were never wrong — only the history.
2. **Free lines can be received.** A line with `usd_line_total = 0` and no `dop_unit_landed_cost` no longer blocks receiving; its lot cost defaults to 0 (`coalesce(..., 0)`). A line that has real cost still requires a landed cost. Before this, free purchase orders had to be hand-patched (zero costs) in SQL before "Receive" worked. The order must still be in `paid_supplier` status.

**One-time backfill (data repair, verified to 0 remaining):** inserted missing `purchase_in` movements for **235 lots** — 105 lots that had no movements at all (earliest 1 Jun 2026) and 130 lots that had only later movements such as `sale_out` (28 May–26 Aug 2026). Backfilled rows use `occurred_at` = the lot's `received_at`, `qty_delta` = `qty_received`, `unit_cost_dop` = the lot's cost, `created_by` = NULL. The first backfill missed the 130 because it only looked for lots with *no* movements — always test for a missing movement of the specific `kind`.

### F2. `create_customer_quick(p_full_name, p_phone, p_email)` — duplicate-phone guard
Refuses to create a customer when an active `role='customer'` profile already has the same phone, compared by the **last 10 digits** (spaces, dashes, `+1` ignored; only checked when the new phone has 7+ digits; blank phone skips the check). Raises SQLSTATE `23505` with a bilingual message naming the existing customer. Two real people sharing one number must leave the phone blank on the second.

### F3. Automatic daily/weekly deals (new)
**What:** a nightly job keeps the "Oferta del día" and "Oferta de la semana" promotions filled automatically, per store, so nothing has to be entered by hand.

- **Table `public.auto_deal_log`** (`warehouse_id`, `slot`, `product_id`, `rule_id`, `starts_at`, `ends_at`, `discount_percent`, `created_at`; RLS on, no policies). Used for the 30-day no-repeat rule, because the owner edits promotion rules in place and history would otherwise be lost.
- **Function `public.auto_deals_fill(p_dry_run default true, p_daily_percent default 30, p_weekly_percent default 25, p_daily_commission default 10, p_daily_days_ahead default 3, p_warehouse_ids, p_daily_category_ids, p_weekly_category_ids)`** — `SECURITY DEFINER`; execute **revoked** from public/anon/authenticated (only the database / admin can run it). Returns a preview/result table (`o_store, o_slot, o_starts_local, o_ends_local, o_product, o_category, o_qty, o_price_cents, o_cost_cents, o_percent, o_action`). **Dry run by default — call with `p_dry_run := false` to write.**
- **Behaviour:** for each store (default Maranatha `84a39e23-3f25-4097-921c-366db6ffd188`, Montellano `e601a9e9-067d-4a7f-924f-6acc8499b430`) it fills daily windows (today + next N−1 days, Dominican midnight→midnight) and weekly windows (this Monday→next Monday, and the following week). If **any active promotion with the same `deal_slot` already overlaps the window for that store (or for all stores), it skips** — so manual rules always win. Otherwise it picks a **random** product that: is active + `is_inventory`, has a primary-category in the slot's pool, has an image, has stock at that store (`v_inventory_current`) of **≥1 (daily) / ≥4 (weekly)**, has a known cost (>0, max lot cost with stock at that store) with the discounted price still ≥ cost, was not a deal at that store in the last 30 days (log), is not in another deal slot rule ended within 30 days or still running, and isn't already picked in the same run. It inserts a `discount_rules` row (`kind='promotion'`, name `Oferta del día <Store> (auto)` / `Oferta de la semana <Store> (auto)`, `priority 50`, `commission_percent` = 10 on daily / NULL on weekly, `created_by` = the owner profile, `deal_slot` set) plus a log row. Finally it deletes its own rules that ended >14 days ago and were never used on a sale (errors swallowed).
- **Category pools (UUIDs):** wigs = Pelucas Lacio `d2aab7ea-3014-494d-87c0-134e04c5b9c0`, Pelucas Ondulado `b421e570-ed5c-4470-b763-0320977fde55`, Pelucas Rizado `a0f06dbd-8fbe-4a85-b534-8b098e518142`. Function default **daily** pool = the three wigs; default **weekly** pool = wigs + Frontales `b0d7e0fa-4103-4677-aa24-2fc03f26da55` + Cabellos `9d0e7ddc-eb08-4c9f-a89a-095188cb4075` + Accesorios de Belleza `37e42f1e-c7fd-43d2-9d7f-95b95d6ff257`.
- **pg_cron 1.6.4 enabled** (`create extension pg_cron`). **Job `auto-deals-nightly` (jobid 1), schedule `5 4 * * *` = 04:05 UTC = 12:05 AM Dominican time**, active. The scheduled call **overrides the defaults** (percent 30 for both slots, 2 days ahead, weekly pool WITHOUT Accesorios de Belleza):

```sql
select cron.schedule(
  'auto-deals-nightly',
  '5 4 * * *',
  $$select * from public.auto_deals_fill(
      p_dry_run := false,
      p_daily_percent := 30,
      p_weekly_percent := 30,
      p_daily_days_ahead := 2,
      p_weekly_category_ids := array[
        'd2aab7ea-3014-494d-87c0-134e04c5b9c0',
        'b421e570-ed5c-4470-b763-0320977fde55',
        'a0f06dbd-8fbe-4a85-b534-8b098e518142',
        'b0d7e0fa-4103-4677-aa24-2fc03f26da55',
        '9d0e7ddc-eb08-4c9f-a89a-095188cb4075'
      ]::uuid[]
  )$$
);
```

- **Manage:** stop with `select cron.unschedule('auto-deals-nightly');`; to change a setting, unschedule and re-run the schedule command with new values. Check runs with `select status, return_message, start_time at time zone 'America/Santo_Domingo' from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'auto-deals-nightly') order by start_time desc limit 5;`. Preview anytime with `select * from public.auto_deals_fill();` (writes nothing).
- **Initial manual run (13 Oct):** created 7 rules — Maranatha 3 daily (13, 14, 15 Oct) + 2 weekly (13–19 Oct, 19–26 Oct); Montellano 2 weekly (same weeks). Montellano's dailies stayed the owner's manual ones (through 16 Oct).
- **Expected first scheduled runs (UNVERIFIED until they happen):** 14 Oct = nothing to add; 15 Oct = creates Maranatha's 16 Oct deal; 16 Oct = creates Montellano's 17 Oct deal; Monday 19 Oct = adds the week of 26 Oct.

### F4. Facts about promotions learned (no change made)
- A promotion needs only `delta_percent` (`discount_rules_shape_check`); `deal_slot` is `daily`/`weekly` (check constraint); the app additionally requires an end date for any deal slot. `store_promotions` (view the storefront reads) = active promotions with a product scope, `starts_at <= now()` and `ends_at > now()`. A rule already applied to a sale cannot be hard-deleted (FK from `sale_discount_applications`) — deactivate instead.

---

## G. Useful system facts discovered (no change made)

- **Stock transfers flow:** `request_stock_transfer` (a seller/distributor tied to one of the two warehouses, or owner/admin) → owner/admin `approve_stock_transfer` (becomes `in_transit`, stock leaves the source) or `decline_stock_transfer` → `receive_stock_transfer`; `cancel_stock_transfer` is owner/admin only and only for `in_transit`. Requested lines live in **`stock_transfer_requested_items`** (not `stock_transfer_items`, which holds shipped lines with `source_lot_id`). A request the owner declines becomes `rejected`; a request the requester withdraws becomes `cancelled` **with no `cancelled_by`/`cancelled_at` recorded**. The Transfers screen lists only pending requests, in transit and received, so **rejected/withdrawn requests are invisible** there. Not built (offered, owner declined): a "Declined / cancelled" section and recording who/when/why on withdrawal.
- **`mark_lost`** pushes the lost line's landed cost onto the received lines (assumes no refund); **`mark_complete`** is a plain status flip. Because of this, a supplier refund is recorded as a manual income entry in Accounting, not through "Mark lost".
- **`sales.total_cents` is a generated column** (`subtotal_cents − discount_cents + tax_cents + shipping_cents`) — never update it directly. `sales.seller_id` and `sale_commissions.earner_id` both carry the seller and must be changed together; `sale_commissions.earner_role` is a functional tag (`seller`), separate from `profiles.role`. Commission status enum: `pending / paid / void`.
- **`stock_movements.kind` enum:** `purchase_in, sale_out, transfer_in, transfer_out, adjustment_in, adjustment_out, return_in, initial, transfer_cancelled`. A `sale_items` row cannot be deleted while `stock_movements.sale_item_id` references it (FK `fk_movements_sale_item`). `sale_lot_consumption` columns: `sale_item_id, lot_id, qty_consumed, unit_cost_dop`.
- **`v_inventory_current` sums only lots with `qty_remaining > 0`** — negative (oversold) lots are ignored, so on-hand can look higher than the true net. Owner decided to **leave the view as is** and fix individual cases by hand.
- The product-edit page for unpaid sales (`sales/[id]/edit-products`) only works on **unpaid** confirmed sales; paid/partially-paid sales need a manual correction or refund + re-ring.

---

## H. Open / watch

1. **Auto deals are not yet proven by a scheduled run** — check `cron.job_run_details` and the Discount rules page on 15 and 16 Oct (see F3).
2. **Function defaults ≠ the scheduled call** (defaults: 25% weekly, 3 days ahead, weekly pool includes Accesorios de Belleza; the cron job passes 30% / 2 days / no accessories). Anyone re-running the function with defaults gets different behaviour.
3. **Many wigs have only 1 unit**, so an auto-picked daily deal can sell before its day; and if a store has no eligible product the slot is **silently skipped** (no alert). Fix by hand with the pencil icon on the Discount rules page.
4. **Cost data:** the cost guard skips products with no/zero cost. At least one product (Yulinion Wax Stick) showed a lot cost of ~RD$11 against a RD$400 price — likely a cost-entry mistake worth checking.
5. **Duplicate-phone guard** (F2) not yet confirmed in the live app; existing duplicate customers were not cleaned up (`merge_customers()` exists for that).
6. **Timezone fix gaps not checked:** the monthly trend inside `dashboard_overview` groups with `date_trunc('month', occurred_at)` in the database session timezone (UTC) and could mis-bucket late-evening transactions near month end; the trend inside `sales_report` was not inspected either.
7. **Other search boxes** (Transfers, Online orders, Labels) may still use single-phrase matching — unverified.
8. **One known negative lot** remains: M1 Bluetooth Mini Bocina Negro at 2-Montellano (−1, from 24 Aug) — see the `v_inventory_current` note in G.
9. **No record files** exist for the database changes in F — if wanted, save them as `db/migrations/round-xx-*.sql` (mark_received, create_customer_quick, auto_deal_log + auto_deals_fill + the cron command).

_End of 2026-10-13 addendum._
