# GangaLoo — Handoff Addendum

_Appended 2026-06-06. Covers the per-store discount work (Rounds 61, 61b, 62) and the storefront category-order fix (Round 63). Same conventions as the main handoff: owner **Bernhard Perkins** (non-technical), work **one step at a time**, deliver files to copy in, DB before dependent code, `tsc` → `git add` (explicit paths) → `commit` → `push`._

---

## A. What shipped this session

Four commits on **master** (all live via Netlify):

| Commit | What |
| --- | --- |
| `982d9a0` | **Bulk discounts: optional per-store scope** (POS + staff online-order) |
| `728e2f8` | **Promotions: per-store scope at the register**; Store picker shown for all promotions |
| `eb15d97` | **Storefront: all per-store promotions lower the online price** (grid/page/checkout); carousel stays featured-only |
| `10ea05e` | **Storefront: categories shown in admin order** (display_order), subs after their parent; not alphabetical |

---

## B. The discount system — how it actually works (read this before touching discounts)

The discount_rules engine has **two authorities that MUST stay in lock-step**:

1. **`lib/discount-rules-resolver.ts`** (TypeScript) — this is the **LIVE charge authority**. The cart computes its discount here and sends the result to the confirm/checkout functions, which just **record** it. Every preview surface feeds it the real warehouse via `sourceWarehouseId` (POS register, `sales/new`, `online-orders/new`, edit-products).
2. **`public.resolve_line_discounts`** (SQL) — kept in lock-step but **currently dormant**: nothing calls it. `confirm_pos_sale`, `create_online_order`, and `edit_unpaid_sale` all write the discount audit but do **not** call the resolver or read discount_rules — they trust the cart's number. Still, any change to the TS resolver MUST be mirrored here (a future revival could re-arm it). The live body also has a distributor/seller wholesale block + a club_tier-excludes-distributors guard that older migration record files (e.g. `round-57a`) do NOT have — always rebuild from the **live** body via `pg_get_functiondef`, never from an old record file.

### Two DIFFERENT warehouse columns (easy to confuse — this bit them once)
- **Bulk rules** scope by **`scope_source_warehouse_id`** (Round 61).
- **Promotion rules** scope by **`scope_warehouse_id`** (Round 61b) — the SAME column the online "Deal of the Day/Week" featuring uses. So one Store choice on a promotion now governs both the register and online featuring.
- In both: **blank/NULL = all warehouses** (so every pre-existing rule is unchanged). Set = only matches a sale whose `sourceWarehouseId` equals it.

### Admin forms
- Bulk form (`new-bulk-form.tsx`) + promotion form (`new-promotion-form.tsx`) each have a **Store** dropdown (All stores / the warehouses). On the promotion form the Store picker was moved OUT of the "Feature online" box so it shows for every promotion. Both pages already load `warehouses` and pass them in.
- `createBulkRule` writes `scope_source_warehouse_id`; `createPromotionRule` writes `scope_warehouse_id`. The rules list (`list-table.tsx`) already shows the source warehouse as "From: <name>".

### Migrations added
- `round-61a-bulk-warehouse-scope.sql` — bulk branch warehouse clause (SQL mirror).
- `round-61b-promotion-warehouse-scope.sql` — promotion branch warehouse clause (SQL mirror).

---

## C. Promotions vs the storefront (Round 62)

- Promotions are **product-only** (`scope_product_id`). There is **no category promotion** — category discounts are a **bulk** concept.
- **`store_promotions` is a VIEW over discount_rules** (kind='promotion'). It used to require `deal_slot IN ('daily','weekly')`, so plain promotions never reached the website. **Round 62 widened it** to include ALL active, in-window, product-scoped promotions. `deal_slot` is kept as a column (NULL for plain ones) and still marks which are FEATURED.
- The two checkout functions (`get_storefront_quote`, `place_storefront_order`) and the product page (`lib/store/product.ts`) read the view by product+warehouse and take the top promotion's `delta_percent` — they don't care about `deal_slot`, so widening the view made plain per-store promotions apply online automatically (per-store filter already there).
- `lib/store/catalog.ts` (the grid) was edited to **split price vs featured**: `promoPctByProduct` lowers the displayed price for ANY promotion; `dealByProduct` (daily/weekly only) drives the carousel. The `/tienda` landing carousel (`listStoreWarehousesWithDeals`) now filters to featured-only so the homepage is unchanged.
- Migration: `round-62a-store-promotions-all.sql`.

**Decision on record:** plain promotions DO lower the online price (per store). Online promotions apply to logged-in customers' normal pricing path; guests keep their markup behavior.

### Bulk online is deliberately NOT built
The storefront pricing pipeline (quote/order/grid/product page) does **not** read bulk rules at all. Owner's decision: bulk stays POS + staff-online-order only. If bulk online is ever wanted, the decided scope is **logged-in customers only**, and it's a real build on the live customer-pricing path (must keep grid = product page = cart = checkout to the peso).

---

## D. Storefront category order (Round 63)

- `store_categories` view was `SELECT id, name` — widened to also expose **`parent_id, display_order`** (`round-63a-store-categories-order.sql`). Neither is sensitive.
- `lib/store/catalog.ts` now sorts categories by **admin order**: rank = [parent's display_order, this category's display_order], name as tiebreak — so mains appear in the dragged order and a sub sits right after its parent. The storefront page (`store-page.tsx`) does NOT re-sort; it renders the array as given.

---

## E. Sub-categories (no work needed — already built)

The category system already supports **two-level** nesting (main → sub) end-to-end: `categories.parent_id` exists; the admin Categories page has a "Parent category" picker, nested display, drag-reorder, and per-category product lists; products attach to subs on the product Categories tab; inventory/count-sheet/POS/sales-search all group parent→sub. **Storefront shows no hierarchy** (`store_categories` exposes only id/name/order/parent for sorting, and the shop renders a flat chip list). A product only gets a category/sub-category discount or grouping via its **PRIMARY** category link. Three-level nesting is NOT supported (deeper rows fall into an "Other" catch-all) — would be a real change.

---

## F. Deleting a test sale (safe recipe — learned the hard way)

To hard-delete a sale (e.g. a cancelled test online order):
1. Find the FKs pointing at `sales`: query `pg_constraint` for `confrelid = 'public.sales'::regclass`. Current children: `sale_items`, `sale_payments`, `online_payments`, `seller_cash_collections`, `sale_discount_applications`, `transactions(source_sale_id)`.
2. Count children for that invoice; confirm the **money tables are empty** before deleting. **No stock/inventory table FKs to sales**, so deleting a sale does NOT touch stock counts.
3. Delete **children first, sale last**, as **plain statements** (Supabase SQL editor auto-commits). Do NOT wrap in a manual `begin … commit` in that editor — an uncommitted `begin` block gets rolled back and the row survives (this happened; the plain-statement version worked).
4. Verify with `select … where invoice_number = '…'` → expect 0 rows.

---

## G. OPEN ITEM — tier / loyalty system (unresolved)

Store Config shows **two overlapping tier sets** and it's unclear which is live:
- `tier1..4_points` (250/500/750/1000) paired with `tier1..4_pct` (5/10/15/20), plus `ptsPerHundred` (1 point per RD$100).
- a separate `disc_bronze/silver/gold/diamond` (5/5/10/15) + `pts_silver/gold/diamond` (350/700/1500) + `clubDiscount` (10).

The truth lives in the SQL function **`get_customer_tier`** (called by `get_storefront_quote`/`place_storefront_order`). **Next step:** dump it via `pg_get_functiondef` to see which config keys it actually reads, then explain to the owner what e.g. `tier1_points = 250` means and retire the dead set. Not yet done.
