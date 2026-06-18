# GangaLoo — Handoff Addendum (2026-06-17, part 2: transfers stock-guard + scan, cancel restock, online out-of-stock block)

_Appended to the prior handoffs. Same owner (**Bernhard Perkins**, non-technical), same workflow: work **one step at a time**, plain language, **DB before dependent code**, deliver **whole files + a PowerShell move script** (owner prefers complete files, not line edits), then publish `npx tsc --noEmit` → `git add` (explicit paths) → `git commit` → `git push` (**commit before push**; a pre-commit hook runs tsc). Everything below is committed, pushed, and live. Round numbering continues from Round 74a below._

---

## A. What shipped this session

| Commit | Round | What |
| --- | --- | --- |
| `9da0196` | — | **Transfers: approve dialog caps "Send" at available source stock** |
| (with above) | — | **Transfers: camera scan to add products** (owner + distributor forms) |
| `7d435b5` | — | **Cancel sale: always restock + void commissions** |
| `54099e1` | 74a | **Online checkout: block orders for out-of-stock items** (SQL guard + friendly message) |

Also done (data-only, in Supabase, no repo change): **one-time restock + commission-void cleanup** for three sales cancelled BEFORE the cancel fix shipped — FAC-2923, FAC-2924, ONL-0051 (see §D).

---

## B. Transfers — two fixes

### B1. Approve dialog caps "Send" at available source stock
**Symptom:** owner could approve a distributor's transfer request for more than was physically in the source warehouse; the engine then rejected it with a raw `insufficient stock: product <uuid> has X, need Y`.

**Diagnosis (confirmed by reading live code):** the DB engine was already safe — both `initiate_stock_transfer` and `approve_stock_transfer` have a "Pass 1" guard that rejects an over-stock transfer (so no phantom inventory ever moved). The two CREATE forms (`new-transfer-form.tsx`, `request-transfer-form.tsx`) already captured `qty_on_hand_at_add` and flagged/blocked over-stock. The GAP was only the **approve dialog** (`RequestReviewButtons` in `app/(dashboard)/transfers/request-actions.tsx`): it showed "Requested" + "Send" and capped "Send" at the requested qty only — it never showed or checked actual source stock.

**Fix (code only, no DB):**
- `lib/stock-transfers.ts` — added `qty_available: number` to `RequestedItem`; `listPendingRequests` now batch-reads `v_inventory_current` (the SAME lot-derived view the product search uses, and the SAME number `approve_stock_transfer` consumes against) keyed by `(from_warehouse_id, product_id)` and attaches per-line available stock. `mapRequestedItems(row, availByProduct)` takes the map.
- `app/(dashboard)/transfers/request-actions.tsx` — approve dialog now has an **"In source"** column; each "Send" input is capped at `min(requested, available)` (default value too), disabled when 0 in stock, amber when partially short, and **"Approve & send" is disabled** if any line exceeds available — a clean cap instead of the DB error.

**Key fact:** `v_inventory_current = SELECT product_id, warehouse_id, sum(qty_remaining) AS qty_on_hand, ... FROM inventory_lots WHERE qty_remaining>0 GROUP BY product_id, warehouse_id`. So the form's stock number and the transfer engine read the same source. **The distributor REQUEST form is deliberately left as warn-only** (amber), not blocked — a request can legitimately ask for more than is on hand now, since stock may arrive before approval. The block lives at approval, which is where stock actually moves.

### B2. Camera scan to add products on the transfer forms
Owner wanted to add products to a transfer by camera scan (one-shot). The pieces already existed and were reused as-is:
- `QrScanButton` (`components/qr-scanner.tsx`) — `onScan(text)`, optional `locale`/`label`/`continuous` (default one-shot). html5-qrcode, lazy import, **camera needs HTTPS** (test on gangaloo.club, not http localhost).
- `findProductBySkuAction(warehouseId, sku)` (`app/(dashboard)/scan/actions.ts`) — returns a `ProductSearchResult | null` scoped to the warehouse (so the scanned line carries the correct `qty_on_hand` and inherits the over-stock guard).

Added to BOTH forms (`new-transfer-form.tsx` owner, `request-transfer-form.tsx` distributor): a `<QrScanButton>` beside `<ProductSearch>`, and a `handleScan` mirroring the register's (`app/(dashboard)/caja/register.tsx`) — look up scoped to the source warehouse (`fromId` / `sourceId`), found → `addProduct` + success toast, not found → error toast. Import path from `transfers/new/` is `../../scan/actions` (same depth as the existing `../../sales/new/product-search`). The distributor form passes `locale` so the scanner labels show Spanish.

---

## C. Cancel a sale — always restock + void commissions
**Symptom:** cancelling a confirmed sale did NOT return stock (movement history showed the `sale_out` with no offset). **Cause:** `cancelSale` in `app/(dashboard)/sales/actions.ts` deliberately only flipped status to `cancelled` (its own comment said cancelling-without-refunding was an opt-in edge case; refund was the only stock-restoring path).

**Owner decisions:** cancel should ALWAYS put stock back, AND void commissions (like refund).

**Fix (code only, no DB):** `cancelSale` now, for `confirmed`/`partially_paid` sales, mirrors `refundSale`'s stock logic — reads consumption via `sale_items → sale_lot_consumption` (with the lot's `warehouse_id` + current `qty_remaining`), writes a `return_in` `stock_movements` row per consumed lot, and **always** bumps `inventory_lots.qty_remaining` back (aggregated per lot) — then voids all `sale_commissions` for the sale (by `sale_item_id`). A `draft` cancel stays a pure status flip (a draft never consumed stock or wrote commissions). Order: status flip → movements → lot bumps → commission void, each with its own clear error message. **Payments are NOT reversed** (same boundary as refund — use the separate "Return money" button for cash).

**Reminders confirmed this session:** on-hand is NOT purely movement-derived — the lot `qty_remaining` MUST be bumped, not just a movement written. `sale_lot_consumption` has no direct FK to sales, so you reach it via `sale_items`.

---

## D. One-time cleanup of pre-fix cancelled sales (data only, Supabase)
Three sales were cancelled BEFORE §C shipped, so their stock never returned: **FAC-2923, FAC-2924, ONL-0051**.
- **FAC-2923, FAC-2924** — confirmed sales that consumed stock. Restored manually in one transaction: inserted `return_in` movements, bumped the two lots (`96f9c014…` → 0 [was −1, oversold], `4c3c2c42…` → 1), voided both pending commissions (`dda0b500…`, `5cbf17d7…`). Verified after commit.
- **ONL-0051** — online order with **0 consumption rows** (online orders are created as `draft` and do NOT consume stock until `confirm_storefront_order` runs; this one was cancelled while still a draft). Nothing to restore; no commissions. Left as-is.

**Pattern (for future pre-fix cleanups):** preview with a `begin; … ; <preview select>; rollback;` block first, confirm the lot numbers, then swap `rollback;` → `commit;`. The cleanup SQL was not saved as a migration (it's a one-time data fix, not schema).

---

## E. Round 74a — Online checkout blocks out-of-stock items
**Symptom:** the public storefront let a customer place an order (ONL-0051) for items with no stock.

**Diagnosis:** `place_storefront_order(jsonb)` creates the order as a `draft` and inserts `sale_items` but does NOT consume lots — stock is consumed later in `confirm_storefront_order(uuid,uuid)`, which already has a strict stock check (raises `insufficient_stock`). So a bad order could be placed; it just couldn't be confirmed. Owner's decision: **block at placement**.

**Fix:**
- DB: `db/migrations/round-74a-storefront-block-oos.sql` — rebuilt `place_storefront_order` from the LIVE body (`pg_get_functiondef`) and added a **Pass-1 stock check** BEFORE any sale/sale_items insert: per orderable line, `sum(qty_remaining)` in the SOURCE warehouse `v_wh_id` (the same warehouse `confirm_storefront_order` consumes from); if any line exceeds available, raise `out_of_stock: <product_id>` and the whole order is rejected (nothing inserted). The pre-check uses the SAME skip rules as the build loop (missing/inactive/not-visible product, qty ≤ 0 are skipped, not blocked) so the two never disagree. Everything else byte-for-byte the live function. **Applied live in Supabase**, record file committed.
- Code: `app/(shop)/tienda/[warehouse]/checkout/actions.ts` — when the rpc error starts with `out_of_stock:`, return `{ ok:false, error:'out_of_stock' }` (stable flag) instead of the raw text.
- Code: `app/(shop)/tienda/[warehouse]/checkout/checkout-view.tsx` — added an `outOfStock` string to both `es`/`en` blocks (`CT[locale]`, read as `tx.<key>`); the placeOnlineOrder failure branch now shows `tx.outOfStock` when `res.error === 'out_of_stock'`, else the generic `shop.orderError`. (The view never displayed the raw rpc error — failures already mapped to a generic localized message — so there was no leak, just a vague message; now out-of-stock is specific.)

**Decision on record:** out-of-stock = **block checkout** (not backorder, not hide). The message: "One or more items just sold out. Please review your cart." / "Uno o más artículos se acaban de agotar. Por favor revisa tu carrito."

---

## F. Conventions reconfirmed this session
- **Whole files + move script**, never line edits (owner preference). Newest-match picker; `actions*.ts` can collide with the sales `actions.ts` — verify the "Copied" line points at the intended folder.
- **Rebuild `CREATE OR REPLACE` functions from the LIVE body** (`pg_get_functiondef`), never an old migration file.
- **`v_inventory_current`** is the canonical on-hand-per-(product,warehouse) view (sum of `inventory_lots.qty_remaining`). Transfer engine, POS search, and now the online stock guard all agree with it.
- **PowerShell pitfalls:** pasting prior command output back into the prompt makes PS try to run it (the `(shop)` parens + `:` error out); a stray quote drops you into the `>>` continuation prompt — press Enter on a blank line (or Esc/Ctrl+C) to escape. To hand whole files to Claude reliably, write them to `Downloads\*.txt` via `Get-Content -Raw … | Set-Content -Encoding UTF8` and upload.
- `checkout-view.tsx` is UTF-8 **with BOM + CRLF** and has accented `es` strings — preserved exactly; only the 3 intended spots changed.

## G. OPEN / WATCH (carried)
- Camera scan + out-of-stock block must be tested on **HTTPS** (gangaloo.club), not http localhost (camera is blocked on http; and verify the live build).
- Refunds still don't auto-return cash (separate "Return money" button); points have no clawback on refund/cancel; tier/loyalty config cleanup (two overlapping tier sets); `club_member_no` not on People `Profile` type; remaining single-phrase product-search boxes (Caja/transfers/online-orders/labels) could use the word-split fix; mobile menu for Club/Mayoreo/Cómo funciona; retire old `gangaloo.netlify.app`; Stripe Issuing fees unverified on `/club/tarifas`; cotizador fees duplicated; `nav.ts` recurring encoding casualty; US dropship Phase 3.

_End of 2026-06-17 part-2 addendum._
