# GangaLoo — Handoff Addendum (2026-07-11)

_Appended to the prior handoffs. Same owner (**Bernhard Perkins**, non-technical), same workflow: work **one step at a time**, plain language, **DB before dependent code**, deliver whole files + a PowerShell move script (or precise in-place PowerShell line edits for surgical changes), then publish `npx tsc --noEmit` → `git add` (explicit paths) → `git commit` → `git push` (**commit before push**; a pre-commit hook runs tsc). Everything below is committed, pushed, and live unless noted. Round numbering continues from Round 79a (highest migration was `round-79a`); this session added `round-80a` through `round-82a`, plus `round-83a`._

**Repo:** `C:\Users\Perkins\Documents\Apps\GangaLoo New 05-26\gangaloo-admin` · **remote:** `github.com/gangaloososua/GangaLoo2026` (branch `master`) · Netlify auto-builds on push.

**Working notes for the assistant this session (the owner reinforced these):**
- **SQL and PowerShell only.** The owner runs SQL in the Supabase SQL Editor and PowerShell in the repo. No other tooling.
- **The Supabase SQL Editor frequently drops large cell output** when copying back (e.g. `pg_get_functiondef` of a big function returns "empty" to the assistant). Workarounds that worked: read the **recorded copy from `db\migrations`** via PowerShell instead, or query **ground-truth data** (actual rows) rather than the function body. Chunking `substring(...)` also often failed — prefer the migrations file.
- **Big keyword searches / multi-range `for` loops in PowerShell sometimes returned empty** to the assistant. Narrow the pattern, or print one small line-range at a time (`$all = Get-Content ...; for ($i=A; $i -lt B; $i++){ "{0}: {1}" -f ($i+1), $all[$i] }`). `Select-String ... | ForEach-Object { "$($_.LineNumber): $($_.Line.Trim())" }` was reliable.
- For surgical edits the assistant used **line-based inserts** (`[System.Collections.Generic.List[string]]` + `.Insert()` / `.InsertRange()`) anchored on exact line content — more reliable than `.Replace()` on multiline strings when CRLF/whitespace differs.
- **Supabase SQL Editor runs each "Run" as its own session** → a `begin;` block you run, then a separate `commit;` run, does **not** work (the transaction already rolled back). For manual data fixes, run plain **auto-committed** statements with a `returning` clause to confirm, then verify with a separate SELECT. (This bit us on the product-repoint fix below.)

---

## A. What shipped this session

| Commit | Round | What |
| --- | --- | --- |
| `377f38a` | 80a | **P&L grouped by MAIN category** (statement lists each main in bold + sub-categories indented; donut/waterfall group by main) |
| `762afe4` | 81a | **Inventory Valuation monthly snapshots** (Live / saved-month picker + auto-bank), mirroring the Balance Sheet snapshot feature |
| `3415680` | 82a | **Settle a zero-cost (free) purchase order** — advance `pending → paid_supplier` with no payment; "Mark as paid (nothing owed)" button |
| `e82c205` | — | **Storefront: don't repeat featured offers** in the main product grid (each product once in the default view) |
| `bb9634f` | — | **Admin Products search fix** — per-word AND match, escape `%` so `13x4 180% 26` works |
| `65fcf51` | — | **Dashboard period switcher** navigates to `/panel` (Last 30 days / This year no longer bounce to the landing page) |
| `6933e9f` | — | **Store: product attributes shown as a specs list** on the public product page |
| `d98dc64` | — | **Checkout: non-refundable delivery-fee warning** shown when a delivery/other-warehouse fee applies |

Migration record files (in `db/migrations`): `round-80a-pnl-group-by-main-category.sql`, `round-81a-inventory-report-snapshots.sql`, `round-82a-settle-zero-supplier-purchase.sql`, `round-83a-dashboard-overview-fx.sql`.

**Also done (data fixes / investigations, no code):** dashboard USD→DOP conversion bug (round-83a, DB-only), a product-stock mix-up corrected directly in the DB, and a supplier-payment "shows split amounts" question (left as-is by owner's decision).

---

## B. Round 80a — P&L grouped by MAIN category (commit `377f38a`)

**Symptom:** Reports → Profit & Loss "Expenses by category" effectively showed one lumped line ("Others"); the owner wanted **each expense category**.

**Discovery chain:** P&L page is `app/(dashboard)/reports/pnl/`. `pnl-view.tsx` renders `report.lines`. `lib/pnl.ts` is a thin wrapper calling the SQL RPC **`pnl_report(timestamptz,timestamptz,timestamptz,timestamptz)`** (NOT `date` args — that mattered). The grouping happens entirely in that function.

**Root cause (the real one):** categories are **two-level** — `account_categories` has a self-referencing **`parent_id`** (sub → main). Expenses are posted mostly to **sub**-categories; the report grouped by leaf `category_id`, so ~100 subs showed and the donut collapsed the tail into "Other". The owner wanted **main** categories with **subs listed underneath**.

**Key data facts (verified):**
- Main category = row where `parent_id IS NULL`. Group key for roll-up = **`coalesce(parent_id, id)`**.
- **"Other Expenses"** is a REAL main category (`d2070dbb…` business) with **147 transactions posted directly to the main** (parent_id null) — ~RD$1.45M. So a main can have direct postings AND subs. The view shows a "`Name` (direct)" sub-line for the direct portion so subs sum to the main subtotal.
- Duplicate main names exist (Travel, Transportation as both business and private mains) — grouping is by main **id** (not name) + the scope split keeps them separate.
- `monthly_exchange_rates` columns: `currency, rate, year, month, created_at`. Latest USD rate this session: **62.25**; EUR 70.00.

**What changed in `pnl_report` (round-80a):** the `lines` CTE now returns **one row per real category** (each sub, plus any main with direct postings), each carrying `main_id = coalesce(parent_id,id)`, `main_name`, `is_main = (parent_id is null)`. FX conversion (join `money_accounts` × latest rate, DOP=1), the two totals blocks (business / all), the Business/Everything split, and vs-prior math are **byte-for-byte unchanged**.

**Code:** `lib/pnl.ts` `PnlLine` type gained `main_id` / `main_name` / `is_main`. `pnl-view.tsx` groups lines by main → bold **main subtotal** row + indented subs; donut + waterfall now group by main.

**History note:** P&L / balance-sheet FX conversion pattern (fx CTE, latest rate per currency, DOP=1) is the canonical one reused several times this session.

---

## C. Round 81a — Inventory Valuation monthly snapshots (commit `762afe4`)

**Ask:** the Balance Sheet has a "Save this month's snapshot" + Live/saved-month dropdown (round-64a). The owner wanted the **same** on the Inventory Valuation report.

**Why snapshots (not a date picker):** inventory valuation = current qty × cost and **cannot be reconstructed for the past** (historical shelf quantities were never stored) — same limitation as the balance sheet. So it's **forward-only**: bank a copy per calendar month. **Inventory snapshots start July 2026** (record this like the balance sheet's June 2026 start).

**Built as a faithful clone of the balance-sheet snapshot objects.** New table `inventory_report_snapshots` (`id, period_month date unique, captured_at timestamptz, data jsonb`) + four functions, all `security definer`, owner/admin-gated (except the capture helper):
- `_capture_inventory_report_snapshot()` — ungated helper; month key = `date_trunc('month', now() at time zone 'America/Santo_Domingo')`; upserts `data = inventory_report()`.
- `save_inventory_report_snapshot()` — gated, calls the helper.
- `list_inventory_report_snapshots()` — gated, months desc.
- `get_inventory_report_snapshot(p_month date)` — gated, returns that month's data.

**`inventory_report()` takes no args** (like `balance_sheet()`).

**Gating note:** the balance-sheet snapshot RPCs are granted to PUBLIC (anon/authenticated/service_role) by Postgres default; safety is enforced *inside* each function via `auth.uid()` + `profiles.role in ('owner','admin')`. The inventory clone matches this. **Consequence:** these gated RPCs **cannot be tested from the SQL Editor** (no `auth.uid()` there → "Not authorized"); test via the app, or call the ungated `_capture_…` helper directly. (We proved the DB side by calling `_capture_inventory_report_snapshot()` → banked July 2026, cost_cents 109339421 = RD$1,093,394.21, 549 units — matches the Balance Sheet.)

**Code (mirrors balance-sheet files):**
- `lib/inventory-report.ts` — added `InventoryReportSnapshotMeta` type + `list/get/save` wrappers.
- `app/(dashboard)/reports/inventory/actions.ts` (**new**) — `saveInventorySnapshotAction`, `requireOwner()` gated.
- `app/(dashboard)/reports/inventory/snapshot-controls.tsx` (**new**) — Live/saved-month `<select>` + "Save this month's snapshot" + auto-bank once per month (fires `save` if the current DR month isn't in `months`).
- `app/(dashboard)/reports/inventory/page.tsx` — reads `?month=`, lists snapshots, Live vs `get(month)`, keeps the existing "Print by category" button.

---

## D. Round 82a — Settle a zero-cost (free) purchase order (commit `3415680`)

**Symptom:** a purchase that was **free** (`usd_total = 0`) but had courier/transport allocated couldn't advance — "Pay supplier" can't record a 0 payment, so it was stuck at `pending` and couldn't be received.

**Why the existing paths don't fit (verified from live bodies):**
- `_allocate_supplier_payment` hard-rejects `usd_subtotal = 0` (`raise 'cannot allocate'`).
- `waive_supplier_remainder` requires `usd_total > 0` AND ≥1 recorded payment AND an uncovered remainder — all fail for a truly free order.

**Fix — new tightly-guarded RPC `settle_zero_supplier_purchase(p_purchase_order_id uuid)`** (`security definer`, owner-only). Guards: order must be `pending`, `usd_total = 0`, and **zero** rows in `purchase_order_payments`. It advances `status → 'paid_supplier'` with **NO ledger post and NO invented payment** (nothing is owed). Transport still lands as the line's landed cost at receive time (`dop_transport_share`), so a free order that's received correctly lands its cost = just the transport. From there the normal Receive → Complete flow runs.

**Types confirmed:** enums `purchase_status`, `user_role`; tables `purchase_order_payments`, `purchase_orders`. `purchase_orders` uses status transitions like `_allocate_supplier_payment` (which stamps `paid_at_dop`, `exchange_rate` on real payments — left null here, honestly, since there's no payment).

**Code:** `app/(dashboard)/purchases/actions.ts` gained `settleZeroSupplierPurchase(orderId)` (owner-gated, `revalidatePath`). `app/(dashboard)/purchases/[id]/actions-bar.tsx` gained a **"Mark as paid (nothing owed)"** button + confirm dialog, shown only when `status === 'pending' && usdTotal === 0` (via a new `canSettleZero` flag; `page.tsx` already passed `usdTotalForPay`). Button uses `BadgeCheck` icon.

---

## E. Storefront — offers no longer duplicate in the main grid (commit `e82c205`)

**Symptom:** on the store (`/tienda/montellano`), products appeared **twice**. The owner suspected category `is_primary`/visibility, but the **data was correct** (InDoo product had exactly one `is_primary=true` + one hidden secondary; no duplicate product rows; one inventory row per warehouse).

**Real cause:** `app/(shop)/tienda/[warehouse]/store-page.tsx` renders, in the default view (`activeCat === 'all' && !searching`), an **"Ofertas" strip** (`offers.filter(stock>0).slice(0,8)`) AND the full **"Todos los productos"** grid (`filtered` → `shown`). A product on offer showed in both.

**Fix:** in the `filtered` useMemo, when `activeCat === 'all'` (default view), exclude the first-8 in-stock offer ids from `byCat` (new `offerIdsShown` Set; `offers` added to deps). Category views and search are unaffected (the strip isn't shown there, so everything still appears). **Storefront catalog lives in `lib/store/catalog.ts`** — grid comes from `fetchStoreCatalog(warehouse)` (plain `store_products` query, one row per product; it does NOT fan out — confirmed). Category mapping there already uses `.eq('is_primary', true)`.

---

## F. Admin Products search fix (commit `bb9634f`)

**Symptom:** admin Products list search — typing `13x4 180%` worked, adding ` 26` returned nothing. (This is the **admin list** search, distinct from the POS `searchProductsForSale` we fixed earlier in `lib/sales.ts`.)

**Path:** `app/(dashboard)/products/page.tsx` reads `?q=` → passes `search` to **`fetchProductsWithStock`** in `lib/products.ts`. (`products-client.tsx` only pushes the query into the URL via `updateParam('q', …)`; no local filter.)

**Bug (lib/products.ts, was lines 71-73):**
```
const s = filters.search.trim().replace(/[%,]/g, '')
if (s) query = query.or(`name.ilike.%${s}%,sku.ilike.%${s}%`)
```
It **stripped `%`** and matched the whole string as one contiguous substring. Product name is `13x4 180% 26" …`; after stripping `%`, `13x4 180 26` is not a contiguous run, so nothing matched.

**Fix:** split the query into words, require **each** word to match name OR sku (chained `.or()` = AND across words), and **escape** `% _ \` so `180%` matches literally:
```
const words = filters.search.replace(/[(),]/g, ' ').trim().split(/\s+/).filter(Boolean)
for (const w of words) {
  const esc = w.replace(/[%_\\]/g, (ch) => `\\${ch}`)
  query = query.or(`name.ilike.%${esc}%,sku.ilike.%${esc}%`)
}
```

---

## G. Dashboard period switcher route fix (commit `65fcf51`)

**Symptom:** on the dashboard, **"Last 30 days"** and **"This year"** bounced to the landing page; "This month" seemed fine.

**Cause:** the dashboard page is at **`app/(dashboard)/panel/page.tsx`** (route **`/panel`**, reads `?period=`). But `app/(dashboard)/dashboard-period-switcher.tsx` pushed to `/` (site root/landing): `router.push(qs ? \`/?${qs}\` : '/')`. "This month" deletes the param → `/` (redirects to dashboard, looked fine); the others pushed `/?period=…` → landing page (ignores param).

**Fix:** added `const BASE = '/panel'` and changed the push to `router.push(qs ? \`${BASE}?${qs}\` : BASE)`. (Other switchers — pnl/sales/commissions — already use a `BASE` constant.)

---

## H. Store — product attributes as a specs list (commit `6933e9f`)

**Ask:** show a product's attributes on the **public product page** (`/tienda/<store>/<producto>`), as a specs list under the description.

**Data layer:** `lib/store/product.ts` → `fetchStoreProduct` previously loaded product/settings/promo/inventory/images/category but **not attributes**. Added:
- Type `StoreProductAttributeGroup = { name: string; values: string[] }` and field `attributes: StoreProductAttributeGroup[]` on `StoreProductDetail`.
- A fetch: `store_product_attribute_values (product_id → attribute_value_id)` → `store_attribute_values (id, attribute_id, value, display_order, is_active)` → `store_attributes (id, name, display_order, is_active)`. Active-only, grouped by attribute name, ordered by `display_order`. (Mirrors the storefront attribute join in `catalog.ts`.)

**View:** `app/(shop)/tienda/[warehouse]/[producto]/product-view.tsx` — added an **"Especificaciones"** section (`<dl>` name → values.join(', ')) right after the description, shown only when `product.attributes.length > 0`.

**i18n:** `lib/i18n/shop.ts` — added `'shop.specs'`: `Especificaciones` (ES) / `Specifications` (EN), next to the existing `shop.description` entries.

---

## I. Checkout — non-refundable delivery-fee warning (commit `d98dc64`)

**Ask:** when an online order involves a **delivery fee** (delivery, or ship/pickup to another warehouse), warn that the fee is **non-refundable and still due** even if the order is later cancelled/refused.

**Checkout model (`app/(shop)/tienda/[warehouse]/checkout/checkout-view.tsx`):** fulfillment via `method` = `delivery` (region local/national) or `pickup_other` (warehouse pickup with a fee). Fee preview: `previewFee()` → `deliveryFees.localDeliveryCents` / `nationalDeliveryCents` / `warehousePickupFees[...]`. Club members get free shipping. The live fee variable is **`const fee = isClubMember ? 0 : previewFee()`** (line ~380). `fee > 0` cleanly covers both delivery and other-warehouse fees.

**Fix (display-only):** added `feeNonRefundable` strings to this file's in-file `tx` dictionary (ES + EN), and rendered a red `<p>{tx.feeNonRefundable}</p>` under the summary's delivery-fee line, shown only when `fee > 0`. No server/logic change (the server is authoritative on the fee amount).
- ES: "El costo de envío no es reembolsable. Se debe pagar aunque luego se cancele o rechace el pedido."
- EN: "The delivery fee is non-refundable. It remains due even if the order is later cancelled or refused."

**Possible follow-up the owner may want:** make it a required checkbox ("I understand the fee is non-refundable") before Place Order.

---

## J. Round 83a — Dashboard USD/EUR → DOP conversion bug (commit `22590fb`, DB-only)

**Symptom:** dashboard **Revenue** showed **RD$1,909.85** for a **USD** cashback of **$1,909.85** (account "Konto Aliexpress Cashback", category "Ali-affliate"). The stored row was correct (`amount_cents = 190985` on a USD account); the dashboard summed `amount_cents` **without converting currency**.

**Path:** `app/(dashboard)/panel/page.tsx` → `@/lib/dashboard` → RPC **`dashboard_overview(timestamptz×4)`** (recorded in `db/migrations/round-25a-dashboard-overview.sql`).

**Cause:** four ledger aggregations summed `amount_cents` with no `money_accounts` join / FX: current revenue/expense, previous revenue/expense, expenses-by-category, and the 6-month trend. (Cash/receivables/inventory/accounts were already correct — they read stored balances/costs.)

**Fix (round-83a):** added the same FX conversion `pnl_report` uses — per-row `factor` via lateral join to `money_accounts` + latest `monthly_exchange_rates` rate (DOP = 1) — to all four aggregations. **Gotcha:** `round(...)` must wrap `sum(...) filter(...)` as `round(sum(...) filter(where ...))` — putting FILTER on `round` errors "round is not an aggregate function". Uses **latest** rate per currency (matches pnl_report; historical figures shift slightly when a rate changes — intended, keeps dashboard and P&L consistent). Verified: July revenue_cents `11888816` = RD$118,888.16 = 190985 × 62.25 / 100. STABLE, read-only, no owner gate (app calls behind `requireOwner()`).

---

## K. Data fix (no code) — product stock mix-up corrected in DB

**Symptom:** "Lacio 13x4 200% 28" #33 Cobrizo **Agairl**" (product `eec97b6c…`, SKU `…COB-92103`) showed **2 in stock** but the owner bought 1.

**Investigation:** two `inventory_lots`, qty 1 each, from **two different** `purchase_order_items` on **two different** complete orders:
- `cd2a5a2f` (supplier **Agairl**, item `f1bc8502…`, lot 1981, cost 7805.37) — correct.
- `536f7a18` (supplier **Aliafee**, item `bc175ab1…`, lot 1984 `6a189047…`, cost 8666.40) — **wrong product**: this Aliafee order's "#33 Cobrizo" line pointed at the **Agairl** product instead of the **Aliafee** product (`ce08bca9…`, SKU `…COB-75173`), which exists separately.

**Fix (Scenario A — repoint, not rename):** moved the order item and its lot from the Agairl product to the Aliafee product. Nothing sold from the lot (qty_remaining 1, no `stock_movements`), so safe. Result: Agairl → 1, Aliafee → 1. **No money changed** (costs/payments/order totals untouched; only the `product_id` pointer moved).

**Process gotcha (important):** the SQL Editor's `begin;` … then separate `commit;` **did not persist** (each Run is its own session → rolled back). The updates only stuck when run as **plain auto-committed** statements with `returning`:
```
update purchase_order_items set product_id = 'ce08bca9-…' where id = 'bc175ab1-…' returning id, product_id;
update inventory_lots set product_id = 'ce08bca9-…' where id = '6a189047-…' returning id, product_id, qty_remaining;
```
**Table column notes discovered:** `inventory_lots` links to an order via **`purchase_order_item_id`** (no direct `purchase_order_id`). `stock_movements` uses **`kind`** (enum) and **`qty_delta`** (not `movement_type`/`qty`), and has `lot_id`, `product_id`, `purchase_order_item_id`, `sale_item_id`, `transfer_id`, `adjustment_reason`. `purchase_orders` reference column is **`order_no`** (not `reference`).

---

## L. Investigations closed with no change

1. **Purchase reference gap (Order-2008..2011 missing).** `order_no` is assigned by app code (no DB sequence/default). Range 1993–2015 with only 19 orders. Zero orphaned `purchase_order_items` and zero orphaned `transactions` → the missing numbers were **burned/abandoned drafts**, never real orders. Nothing to fix. **Optional cosmetic follow-up:** assign `order_no` at save time (not draft open) so abandoned drafts don't skip numbers.

2. **P&L / dashboard waterfall "bars look the same height."** Not a bug — it's a **waterfall**: income is full height, each expense floats down from the running balance, so a big first expense (Products) starts near the top and its *top edge* looks close to Income's even though its *height* is the true value. The white line inside a bar is the boundary of that expense's slice. Owner understood and kept it as-is. **Optional:** add value labels on bars (keeps the cascade + hover popups) if it ever confuses again.

3. **Batch supplier payment "shows split amounts, not the total" (`pay_suppliers_batch`).** The batch-payment screen is **"Pagar a proveedores"** (`/purchases/pay`-style), function **`pay_suppliers_batch(uuid,timestamptz,text,numeric,jsonb,text)`** (migration `round-40a-batch-supplier-payment.sql`). It posts **one ledger row per supplier** (each carrying that supplier's expense category), all linked to one `supplier_payment_receipts` row via `transactions.source_supplier_payment_receipt_id`. So a withdrawal covering N suppliers = N movements (they sum to the bank total but don't match the single bank line). Verified against real receipts (e.g. Jul 9 receipt `ce14435a…` = RD$31,439.64 → 2 rows −22,981.22 / −8,458.42). **The owner considered a "one bank row + per-supplier category split"** but `transactions` has **no split/parent/memo mechanism** (every row moves the account balance), so a true split would need new schema + balance-engine changes. Alternative (one total row) would lose per-supplier categories. **Owner decided: leave as-is.** No change made.

---

## M. Open threads / watch-list for next session

- **Empty "Movements" tab on products.** Received purchases create `inventory_lots` but apparently **no `stock_movements` rows** (the Agairl/Aliafee product showed stock 2 with "No stock movements recorded"). So the per-product Movements history is empty for products received this way — a real (cosmetic) gap worth investigating: check whether the receive path should write a `stock_movements` row (`kind` = receive, `qty_delta`, `purchase_order_item_id`, `lot_id`). Stock and money are accurate regardless.
- **June-11 batch supplier receipt `6be19b47…` (RD$36,655.03) shows 0 linked ledger rows** (`transactions.source_supplier_payment_receipt_id` = that receipt → none). Possibly a batch payment that never posted its movement(s). Worth confirming whether that withdrawal is reflected in the account balance.
- **Inventory snapshots begin July 2026** (forward-only, like balance-sheet's June 2026). Record this so nobody expects earlier months.
- Optional cosmetic items noted above (order_no burned numbers; waterfall value labels; checkout fee-acknowledgement checkbox).
