# GangaLoo — Handoff Addendum (2026-06-30)

_Appended to the prior handoffs. Same owner (**Bernhard Perkins**, non-technical), same workflow: work **one step at a time**, plain language, **DB before dependent code**, deliver whole files + a PowerShell move script (or precise in-place line edits for tiny surgical changes), then publish `npx tsc --noEmit` → `git add` (explicit paths) → `git commit` → `git push` (**commit before push**; a pre-commit hook runs tsc). Everything below is committed, pushed, and live unless noted. Repo remote is `github.com/gangaloososua/GangaLoo2026.git` (master)._

---

## A. What shipped this session

| Commit | What |
| --- | --- |
| `8defabf` | **Inventory search: match each word independently** (handles `13x4 180% 26`) |
| (this session) | **Register: default grid driven by warehouse stock** (in-stock first, then OOS tail) |
| (this session) | **Register: honor a product's own Sale price** (offer) like online |
| (this session) | **Storefront: per-store WhatsApp link** in header + slide-out menu |

_(The three register/storefront commits were pushed during the session; capture their hashes from `git log` if needed — only the inventory one was pasted back.)_

Plus several **DB-only / no-code** investigations and fixes (Ana seller merge, discount-rule verification + toggle) described below.

---

## B. Duplicate SELLER merge — Ana Previlus (DB only, no code)

**Situation:** owner manually entered a seller, who then signed up online → two `profiles` rows, same phone (`+1 (809) 848-1740` vs `18098481740`), both `role='seller'`, both active, no club, 0 customer sales.

**Key point:** the existing `merge_customers()` function is **customer-only and aborts on sellers**, so it could NOT be used. Handled by hand instead.

**Procedure used (reusable for future seller dupes):**
1. Find both rows by phone with digit-normalized match: `where regexp_replace(phone,'[^0-9]','','g') like '%8481740%'`.
2. Map every FK that references `profiles(id)` (information_schema query) — there are many staff/actor columns: `sales.seller_id`, `sale_commissions.earner_id`, `commission_payouts.earner_id`, `seller_cash_collections.{seller_id,handed_in_by,logged_by}`, `payroll_employees.profile_id`, `warehouses.{distributor_id,manager_id}`, `audit_log.actor_id`, plus many `created_by`/`updated_by` columns, and the customer ones (`sales.customer_id`, `member_cards.customer_id`, `payment_receipts.customer_id`, `discount_rules.scope_customer_id`).
3. For BOTH ids, count rows in every referencing column + check `auth_user_id` (the login).
4. **Result:** the online row (`dc4e1356…`) had the login; the manual row (`c640c9dc…`) had **zero activity anywhere** and no login.
5. Compared the two full profile rows — manual row had nothing the online row lacked.
6. **Plain `delete` of the empty manual row** (no merge needed). No leftover Supabase Auth user (manual row had null `auth_user_id`).

**Lesson:** the easy seller-dupe case = the stray record has no login and no activity → straight delete. If a seller dupe ever HAS activity (sales as seller, commissions, cash collections, payroll), do NOT delete — re-point those staff/actor columns to the keeper first, then delete.

---

## C. Discount rule "Montellano Special" — verification + toggle (DB only)

**Trigger:** owner couldn't delete a discount rule ("has audit records attached").

**Why blocked:** `sale_discount_applications.discount_rule_id` FK — a rule that was applied to real sales can't be hard-deleted (protects the sales' discount trail). Correct resolution for a USED rule = **deactivate, don't delete**.

**Investigation (worth remembering the approach):**
- Counted attached sales per rule: only **Montellano Special** (bulk, `c4dd7abb…`) had any — **5**.
- Owner thought the discount "never showed." Pulled the 5 `sale_discount_applications` rows → each recorded a real 15% (`amount_cents` 103500/81000/33000/177000/195000) and the matching `sale_items.discount_cents` / `line_total_cents` confirmed the customer WAS charged the discounted price. **The discount always worked**; the owner had been looking at later orders. Total discounted ≈ **RD$5,895**.
- **Note:** those 5 `sale_discount_applications` rows have a **null `sale_id`** (discount tied to `sale_item_id` only). Harmless today, but a per-**sale** discount report could miss them. (Carried open.)

**Actions taken (all simple `update`s on `c4dd7abb…`):** toggled `is_active=false`, then back `true` with `ends_at='2026-07-31 23:59:59.999+00'`, then (owner's final call) `is_active=false` again. Net state at session end: **Montellano Special is OFF.**

---

## D. Register default grid now driven by warehouse stock (`lib/pos-register.ts`)

**Symptom:** picking a warehouse (e.g. Montellano) in the Caja showed "just wigs" — bundles/accessories "missing," even though they had stock there (Cabellos had 28 in stock at Montellano).

**Root cause (NOT `warehouse_categories` — that table is read by NOTHING in the register):** `listProductsForRegister` fetched the **first 60 active products ordered by name**, warehouse-independent, then only *sorted* in-stock-at-warehouse to the top of those 60. So an in-stock product whose name sorted past #60 never entered the grid. Switching warehouse only changed the sort, not the set.

**Fix (whole file):** in the **default branch (no search, no category)** the grid is now built from the warehouse's stock:
- fetch all in-stock product ids at the warehouse from `v_inventory_current` (cap `IN_STOCK_CAP=300`),
- fetch those active products (name order),
- append a short OOS tail (scan first `OOS_SCAN=120` active by name, drop in-stock, keep `OOS_TAIL=40`),
- existing enrichment + in-stock-first sort unchanged.
The **search / category** branch is unchanged (still scans the full catalog, 50-row cap).

`opts.limit` no longer caps the default grid (it still applies to search/category). Acceptable per owner.

---

## E. Register honors a product's own Sale price / offer (`app/(dashboard)/caja/register.tsx`)

**Symptom:** a product with a 10% **Sale price** (the product Pricing tab's "Sale price / discount" field, `sale_price_cents`) showed the reduced price **online** (RD$9,090 vs RD$10,100) but rang up at **full price** in the register.

**Root cause:** the register's `priceFor()` returned `warehouse_price_override_cents ?? base_price_cents` and **ignored `sale_price_cents`** entirely (even though `pos-register.ts` already loads it). The earlier "15% in register" the owner saw was just the Montellano bulk rule masking it.

**Fix (whole file):** `priceFor()` now uses `sale_price_cents` when it's set and **lower** than the regular/override price. That flows to the grid card, the cart line `unit_price_cents`, and the charged amount. Discount RULES still apply on top via the resolver.

**Edge flagged to owner (NOT fixed):** if a **club member** is attached AND the product is on Sale, the club-tier discount rule stacks on top of the sale price (a bigger discount than online, which charges the *lower of* club vs sale). Rare; revisit only if club-on-sale rings up often. The register applies club pricing via **rules**, whereas online uses the product `club_price_cents` field — a pre-existing divergence.

---

## F. Per-store WhatsApp link on the storefront (`app/(shop)/tienda/[warehouse]/store-page.tsx`)

**Goal:** show each store's WhatsApp number by the logo/name on the storefront.

**Good news — DB + loader were already done:** `warehouses.whatsapp` (and `phone`, `address`, `city`, `maps_url`) exist; the safe `store_warehouses` view exposes them; `lib/store/catalog.ts` already SELECTs `whatsapp` and carries it on the `StoreWarehouse` type (both `listStoreWarehouses` and `resolveStoreWarehouse`). Numbers already set and `wa.me`-formatted: **Maranatha `18292867868`**, **Montellano `18298417980`**.

**Fix (whole file, display-only):** added a green WhatsApp circle in the header right after the store name, and a "WhatsApp <store>" row in the slide-out menu. Both gated on `warehouse.whatsapp` existing. New helper `whatsappHref()` strips non-digits at link time (so a stray `+`/spaces still work) and pre-fills a locale-aware message ("Hola, vengo de la tienda online de GangaLoo <store>"). Uses existing `ICON.chat` + WhatsApp green `#25D366`.

---

## G. Inventory product search — word-split fix (commit `8defabf`, `lib/inventory.ts`)

**Symptom:** in **Inventory → Adjust stock**, typing `13x4 180% 26` returned nothing, while `13x4 180%` worked.

**Cause:** the SAME single-phrase bug fixed earlier in `sales.ts` (commit `d0efa71`). `searchInventoryProducts` cleans the query of `% " ( ) * , '` → `13x4 180 26`, then matched it as one unbroken `ilike` run — but the stored name `13x4 180% 26"…` still has the `%`, so that run never appears.

**Fix:** split the cleaned query on spaces and require **each word** to match (AND), name OR sku, any order:
```js
for (const term of q.split(' ')) {
  if (term) pq = pq.or('name.ilike.%' + term + '%,sku.ilike.%' + term + '%')
}
```
Also re-joined a `stock_movements` select string that had a stray line break (no behavior change). `searchInventoryProducts` is the only search box in this file (the movements-ledger filter reuses it), so the whole inventory module is covered.

---

## H. Non-code guidance given this session

- **NFC member cards — what to write:** **nothing.** The register's member-card scan keys on the card's **factory UID/serial** (read via Web NFC `serialNumber`; `member_cards.card_uid` is normalized uppercase, separators stripped, so `04:1a:2b` == `041A2B`). Setup per member: read the card's UID (free phone app like "NFC Tools"), then **People → Membership cards → link by serial** (type/paste; tap-to-link on that page is deferred). Tap-to-read works **Android Chrome only** (not iPhone/iPad Safari); typed serial works anywhere. Any **NTAG213/215/216** card works.
- **Stock "showing 0" that's actually correct:** owner saw a wig at 0 and the Movements tab showed 2 purchased / 1 sold. Movements tab only shows the **3 most recent** rows; pulling `sale_items` revealed a **second (online) sale** ONL-2C0F74A0. Final tally per store balanced exactly (Maranatha 1 in/1 out, Montellano 1 in/1 out) → **0 is correct.** Lesson: Movements tab is a recent-history peek, not the ledger; `inventory_lots` + `sale_items` are the source of truth. (Migration `created_at` on all lots/sales = `2026-05-15`, `legacy_id` present — migrated history may not surface as movement rows.)

---

## I. Conventions reconfirmed this session
- **Whole files + move script**, newest-match picker (`Get-ChildItem -LiteralPath $dl -Filter 'name*.ext' | Sort-Object LastWriteTime -Descending | Select-Object -First 1`); verify the "Copied" line points at the intended folder (and not a `.bak`). `[warehouse]` brackets and `(dashboard)`/`(shop)` parens need `-LiteralPath`.
- **To hand whole files to Claude:** `Get-Content -LiteralPath … -Raw | Set-Clipboard` then paste; or `Select-String -Pattern … -Context` to send just the relevant region (used to confirm `catalog.ts` already carried `whatsapp`).
- **`v_inventory_current`** is the canonical on-hand-per-(product,warehouse) view (sum of `inventory_lots.qty_remaining > 0`); POS search, transfers, online stock guard all agree with it.
- **Pricing parity:** the register applies discount RULES via `lib/discount-rules-resolver.ts`; a product's own **Sale price** (`sale_price_cents`) and **club price** (`club_price_cents`) are separate direct-price mechanisms. Online uses the price fields; the register now uses `sale_price_cents` too (this session) but still applies club via rules.

---

## J. OPEN / WATCH (carried + new)
- **NEW — null `sale_id` on 5 `sale_discount_applications` rows** (Montellano Special). Harmless unless a per-sale discount report is built; they're tied to `sale_item_id` only.
- **NEW — register club-on-sale stacking** (§E): club rule stacks on top of a product Sale price; online charges the lower of the two. Revisit only if it happens often.
- **NEW — migrated-lot reconciliation (optional):** this session's spot-check (one wig) reconciled perfectly, so not urgent; a one-time pass across migrated lots is still a reasonable future task.
- **Remaining single-phrase product-search boxes still need the word-split fix:** **transfers** (`app/(dashboard)/transfers/new/…`), **online-orders new**, **labels (etiquetas)**. (Caja/`pos-register.ts` and Inventory now done; `sales.ts` done earlier.)
- **`.bak` cleanup:** stray `*.bak`/`*.bak-*` backups clutter repo searches (`inventory.ts.bak-*`, `sales.ts.bak`, `page.tsx.bak-*`, etc.); safe to delete after verifying. Already in `.gitignore`.
- Carried from prior addenda (still open): tier/loyalty config cleanup (two overlapping tier sets); refunds don't auto-return cash (separate "Return money" button); points have no clawback on refund/cancel; `club_member_no` not on People `Profile` type; mobile menu for Club/Mayoreo/Cómo funciona; retire old `gangaloo.netlify.app`; member-number backfill for till-only members; Stripe Issuing fees unverified on `/club/tarifas`; cotizador fees duplicated; `nav.ts` recurring encoding casualty; US dropship later phases (verify status); online bulk discounts (queued); mark-PO-received-before-paid (deferred); EUR multi-order payment slivers → Waive remaining.

---

## K. New reusable pieces to remember
- **Seller-dupe merge procedure** (§B) — `merge_customers()` does NOT apply to sellers; map FK references, check login + activity, delete the empty one.
- **`whatsappHref()` helper** in `store-page.tsx` — builds a `wa.me` link from a stored number (digit-strips) with a locale-aware prefilled message. `store_warehouses` view + `StoreWarehouse` type already carry `whatsapp`/`phone`/`address`/`city`/`mapsUrl` if other contact display is ever wanted.
- **Register `priceFor()`** now: `sale_price_cents` (if set & lower) → else `warehouse_price_override_cents ?? base_price_cents`.

_End of 2026-06-30 addendum._
