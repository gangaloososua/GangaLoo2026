# GangaLoo — Handoff Addendum (2026-06-18)

_Appended to the prior handoffs. Same owner (**Bernhard Perkins**, non-technical), same workflow: work **one step at a time**, plain language, **DB before dependent code**, deliver whole files + a PowerShell move script (or precise in-place line edits for tiny surgical changes), then publish `npx tsc --noEmit` → `git add` (explicit paths) → `git commit` → `git push` (**commit before push**; a pre-commit hook runs tsc). Everything below is committed, pushed, and live. Round numbering continues from Round 76a below._

---

## A. What shipped this session

| Commit | Round | What |
| --- | --- | --- |
| `cfccd80` | — | **Accounting: sort ledger by transaction date** (`occurred_at`) first, not entry time |
| `88f0817` | 75a | **EUR supplier payments** — pay a USD purchase order from a EUR account (Bank C24) |
| `27ea624` | 76a | **Automatic purchase-order numbers** (`Order-1993`+) shown in the Reference column |
| `258741d` | — | **Fix mojibake em-dash** in the Purchases list (DOP paid + date cells) |

---

## B. Accounting ledger sort fix (commit `cfccd80`)

**Symptom:** in `/accounting`, transactions appeared mixed by date (e.g. 17 Jun above 18 Jun, then back to 15 Jun).

**Cause:** `lib/transactions.ts` → `fetchTransactions` chained two `.order()` calls with **`created_at` first** (entry time), then `occurred_at`. The first `.order()` wins as the primary sort, so the list sorted by when each row was *entered*, not the **Date** column the owner sees.

**Fix:** swapped the two lines so `occurred_at` (the transaction date shown in the UI) is primary and `created_at` is the tiebreaker:
```
.order('occurred_at', { ascending: false })
.order('created_at', { ascending: false })
```
One-line swap; git showed it as 1 insertion / 1 deletion.

---

## C. Round 75a — EUR supplier payments (commit `88f0817`)

### The problem
The owner pays AliExpress-style suppliers (orders priced in **USD**, `purchase_orders.usd_total`) from a **EUR bank account (Bank C24)**. The "Record supplier payment" dialog only handled DOP and USD paying accounts. `add_supplier_payment` had a per-currency deduction branch: `USD` → `pesos / rate` = dollars; **else → treat the typed number as pesos**. A EUR account fell into that `else`, so it would deduct the typed peso number **as euros** — wrong, and the C24 currency-trap the 06-07 addendum warned about.

### The agreed model (owner's real workflow)
The owner pays several orders at once in EUR (e.g. €538.04 covering $658.07 of orders) and apportions each order's share by hand. Decision: he types **EUR paid** for this order's slice + the month's **DOP-per-EUR** rate (auto-filled from Settings), and the system derives the rest. This mirrors how the USD flow already works (type a local amount + a rate, the function converts).

**Per-currency meaning of the inputs (the key design):**
- **DOP account** (unchanged): typed amount = pesos; `exchange_rate` = DOP-per-USD; deducts pesos.
- **USD account** (unchanged): typed amount (sent as pesos) ÷ rate = dollars deducted.
- **EUR account (NEW):** the dialog computes `peso figure = EUR paid × DOP-per-EUR` and sends THAT as `p_dop_amount` (so the **peso figure stays the single source of truth** for both the product's DOP landed cost AND the USD coverage). The function then deducts **euros** from C24 via `peso ÷ DOP-per-EUR`. USD coverage = `peso ÷ DOP-per-USD` (drives the paid/still-open status).

**Worked example (the $23.70 AliExpress order, real first payment):**
EUR paid 19.38, DOP-per-EUR 70, DOP-per-USD 62 →
- peso figure = 19.38 × 70 = **RD$1,356.60** (landed cost)
- euros leaving C24 = 1,356.60 ÷ 70 = **€19.38** (exact)
- USD covered = 1,356.60 ÷ 62 = **$21.88** (so the $23.70 order is partly covered, stays pending — correct, since it's one slice of a bulk EUR payment)

### Database (live; record in db/migrations)
`db/migrations/round-75a-supplier-payment-eur.sql` — rebuilt `add_supplier_payment` **from the LIVE body** (`pg_get_functiondef`; confirmed no drift vs the round-41a file). Changes are minimal and **backward compatible**:
- New **optional trailing parameter** `p_eur_rate numeric default null` (DOP-per-EUR). Because it has a default, existing DOP/USD callers are unaffected.
- New `elsif v_acct_currency = 'EUR'` branch in the deduction logic: requires `p_eur_rate > 0`, then `v_post_amount := p_dop_amount / p_eur_rate` (euros). DOP/USD branches unchanged.
- Everything else (the peso `dop_amount_cents` stored, USD coverage math, auto-finalize, blended rate) is byte-for-byte the live function.

**Note:** the ledger row `amount_cents` is in the **paying account's own currency** (pesos / dollars / euros), exactly as before — that's why the balance-sheet currency conversion (round-65a) values C24's euro balance correctly in pesos.

**Could NOT be SQL-Editor tested** — `add_supplier_payment` gates on `auth.uid()` (no logged-in user in the editor → "permission denied"). The math was confirmed with a plain ungated arithmetic SELECT (1356.60 / 19.38 / 21.88) and then **proven for real in the app** (owner made the €19.38 payment; ledger showed −€19.38 against C24).

### Code (live)
- `lib/sales.ts` — `MoneyAccount` type gained `currency: string`; `listMoneyAccounts` select widened to `id, name, kind, currency`. (Additive — many callers use this; they ignore the new field.)
- `app/(dashboard)/purchases/actions.ts` — `AddSupplierPaymentInput` gained optional `eurRate?: number`; `addSupplierPayment` passes `p_eur_rate: input.eurRate ?? null` to the RPC.
- `app/(dashboard)/purchases/[id]/page.tsx` — reads the latest monthly **EUR + USD** rates from `monthly_exchange_rates` (via `createClient`), passes `monthlyEurRate` / `monthlyUsdRate` as props to `PurchaseActionsBar`.
- `app/(dashboard)/purchases/[id]/actions-bar.tsx` (whole file) — the Pay-supplier dialog now detects the chosen account's currency. When it's **EUR**: the amount field relabels to **"EUR paid"**, a **"Rate (DOP per EUR)"** field appears auto-filled from Settings, the USD exchange/official rates auto-fill too, and a live preview shows "Leaves this account: €X · Peso cost: RD$Y · Covers $Z of the order." On submit it sends `dopAmount = EUR × DOP-per-EUR` and `eurRate = DOP-per-EUR`. **USD/DOP accounts behave exactly as before.** Auto-fill only sets a field if it's still empty (never clobbers typed input).

**Rates source:** `monthly_exchange_rates` (`currency, year, month, rate`). Live values seen: EUR June 70 / May 71; USD June 62 / May 62.5. To change the rate the dialog auto-fills, add/edit the month's row there.

**Multi-order note:** because EUR coverage routes through the monthly rates (not the owner's exact blended bank rate), an order can occasionally show a small "still open" sliver of a few cents — that's what the existing **Waive remaining** button (round-49a) is for.

---

## D. Round 76a — Automatic purchase-order numbers (commit `27ea624`)

**Goal:** give each NEW purchase order a sequential human-readable number in the Purchases list **Reference** column, continuing from the owner's manual cross-reference numbers (so starting at **1993**).

**Context confirmed:** the existing Reference numbers (1991, 1990, …) are **manual** values the owner typed into `legacy_id` to cross-reference his old system. So the new auto-number must NOT reuse/overwrite `legacy_id`. Decision: **only new orders** get auto-numbered; the 245 existing orders stay blank in the new column (still findable by their manual `legacy_id`).

### Database (live; record in db/migrations)
`db/migrations/round-76a-purchase-order-numbers.sql` — mirrors the existing `sales_fac_seq → FAC-####` pattern. Purely additive:
- `alter table purchase_orders add column if not exists order_no text` (nullable).
- `create sequence if not exists purchase_order_seq start with 1993`.
- `_stamp_purchase_order_no()` trigger fn (SECURITY DEFINER) — fills `order_no := 'Order-' || nextval(seq)` only when it was left empty.
- `before insert` trigger `trg_stamp_purchase_order_no` on `purchase_orders`. Hands-off: the create flow needs no code change. Verified: column exists, sequence `last_value=1993, is_called=false` (first new order = `Order-1993`), trigger present.

`legacy_id` is **untouched**.

### Code (live)
- `lib/purchases-types.ts` — `PurchaseOrderRow` gained `order_no: string | null`.
- `lib/purchases.ts` — `order_no` added to `PURCHASE_ORDER_COLUMNS` (the select string) and the `RawPurchaseOrder` type. The `coercePurchaseOrder` mapping uses `...r` (spread), so `order_no` flows through automatically.
- `app/(dashboard)/purchases/list-table.tsx` — Reference cell now renders `order_no` first (bold), then `legacy_id` as a smaller muted line if present, then `notes`, with a `&mdash;` dash only when all three are empty.

**Next new PO shows `Order-1993`; the one after `Order-1994`, etc. — fully automatic.**

---

## E. Mojibake em-dash fix in Purchases list (commit `258741d`)

**Symptom:** the **DOP paid** column on pending orders showed `â€"` garbage (and the same in two date cells).

**Cause:** three raw em-dash (`—`, U+2014) characters in `list-table.tsx` had been double-encoded to mojibake — the recurring non-UTF-8 save issue (same family as the `nav.ts` problem flagged 06-04 and 06-17). They live in plain-string returns: `formatDOP` (null/zero → dash) and two date formatters (`!iso` / `NaN` → dash).

**Fix:** read the file as UTF-8, replaced the exact mojibake byte sequence (`C3 A2 E2 82 AC E2 80 9D`) with a clean em-dash, wrote back **UTF-8 no-BOM**. 3 occurrences fixed.

**Lesson reconfirmed:** when writing JSX dashes, prefer the HTML entity `&mdash;` (pure ASCII, can't corrupt). The Reference-cell rewrite in §D used `&mdash;` deliberately for this reason. For plain JS string returns, just keep the file UTF-8 no-BOM.

---

## F. Conventions reconfirmed this session
- **Money functions:** rebuild any `CREATE OR REPLACE` from the **LIVE body** (`pg_get_functiondef`), change only the needed lines, keep the signature backward compatible by giving new params a DEFAULT.
- **Gated RPCs (auth.uid()) can't be tested in the SQL Editor** — confirm the math with a plain ungated SELECT, then prove the real path in the app. Keep a reversal path in mind (part-payments have `remove_supplier_payment` while pending).
- **Encoding:** edit files via `[System.IO.File]::ReadAllText/WriteAllLines` with a UTF-8-no-BOM encoder; never round-trip accented/dash bytes through naive `Get-Content`/`Set-Content`. PowerShell's **console** mangles accents on display even when the file bytes are correct — verify by reading back as UTF-8, not by eyeballing the console.
- **In-place line edits** are fine for tiny surgical changes (the sort swap, type additions) as long as anchors are confirmed first; watch for off-by-one when splicing (`currency: string` initially landed after the closing brace and had to be re-placed).
- SQL record files saved into `db/migrations` BEFORE `git add`.

---

## G. OPEN / WATCH (carried + new)
- **NEW — EUR multi-order payments:** EUR coverage uses the monthly rate, so small "still open" slivers may appear; use **Waive remaining**. If the owner later wants exact coverage, the alternative was "EUR paid + real blended EUR→USD rate" (not built).
- **NEW — `list-table.tsx` had the recurring mojibake** (now fixed). Same root cause as `nav.ts`; watch for `â€"`/`Ã­`-style garbage after future edits and re-save UTF-8 no-BOM.
- Carried from prior addenda (still open): tier/loyalty config cleanup (two overlapping tier sets — 06-06 §G); refunds still don't auto-return cash (separate "Return money" button — 06-10); points have no clawback on refund/cancel; `club_member_no` not on the People `Profile` type; remaining single-phrase product-search boxes (Caja/transfers/online-orders/labels) could use the word-split fix; mobile menu for Club/Mayoreo/Cómo funciona; retire old `gangaloo.netlify.app`; member-number backfill for till-only members; Stripe Issuing fees unverified on `/club/tarifas`; cotizador fees duplicated; `nav.ts` recurring encoding casualty; US dropship Phase 3 (USD checkout — note: 06-15 addendum says Phases 3 & 4 shipped, so this may be stale; verify); online bulk discounts (queued 06-15); mark-PO-received-before-paid (deferred 06-15).

---

## H. New reusable pieces to remember
- **`add_supplier_payment(..., p_eur_rate)`** — pay a USD PO from a EUR account (round-75a). EUR detection + auto-fill lives in `actions-bar.tsx`; monthly rates passed from `[id]/page.tsx`.
- **`purchase_order_seq` + `_stamp_purchase_order_no()` trigger** — auto PO numbers `Order-####` (round-76a), mirrors `sales_fac_seq`.
- **`MoneyAccount.currency`** now available from `listMoneyAccounts` (`lib/sales.ts`).

_End of 2026-06-18 addendum._
