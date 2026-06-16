# GangaLoo — Handoff Addendum (2026-06-15)

_Appended to the prior handoffs. Same owner (**Bernhard Perkins**, non-technical), same workflow: work **one step at a time**, plain language, **DB before dependent code**, deliver full files + a PowerShell move script (owner prefers whole files, NOT line-by-line edits), then publish `npx tsc --noEmit` → `git add` (explicit paths) → `git commit` → `git push` (**commit before push**; a pre-commit hook runs tsc). Everything below is committed, pushed, and live unless noted. This session built **US dropship Phase 3 (USD checkout)** and **Phase 4 (admin + ledger)**, took **Stripe live**, and queued two builds for next session._

---

## A. What shipped this session

| Commit | What |
| --- | --- |
| `90f472b` | **US shop Phase 3** — USD checkout (Stripe + PayPal + bank deposit), `us_orders` table + functions, webhook + paypal-return |
| `fef89dc` | **US thank-you bank-deposit details** (EN/ES) read from `store_config` + WhatsApp receipt link |
| `d4933b3` | **US shop Phase 4** — admin orders view, fulfilment stages, ledger posting (sale income + supplier cost) |

Migrations added (live in Supabase + recorded in `db/migrations`): `round-72a`, `round-72b`, `round-72c`, `round-72d`, `round-73a`, `round-73b`.

---

## B. Phase 3 — USD checkout (DONE, live)

Single-product **"Buy now"** flow (no multi-item cart). Product page → Buy now → `/us/checkout?slug=&qty=` → form → Stripe / PayPal / Bank deposit → `/us/checkout/gracias`.

### Database (live; records in db/migrations)
- `round-72a-us-orders-table.sql` — table **`public.us_orders`** (uuid id; customer name/email/phone; US shipping address line1/line2/city/state/zip/country; `items` jsonb `[{product_id,name,slug,qty,price_usd}]`; `subtotal_usd`/`shipping_usd`/`tax_usd`/`total_usd` numeric **dollars**; `status` (pending|paid|cancelled|forwarded|shipped|completed); `payment_method`; `payment_ref`; `paid_at`; `supplier_ref`; `supplier_cost_usd`; `internal_notes`; `timeline` jsonb; `created_by`). RLS ON, revoked from anon/authenticated, **granted to service_role** (admin client reads/writes; Phase-3 public functions are the only other doorway).
- `round-72b-create-us-order.sql` — **`create_us_order(...)`** public SECURITY DEFINER. **Recomputes each line price server-side** from `products` via `_us_price_usd(override, markup, cost_calc->>'base_cost_usd')` (the Phase-1/2 price fn); ignores any client price. Free shipping, no tax. Returns `{ok, order_id, total_usd}`. Granted anon+authenticated.
- `round-72c-get-us-order-for-payment.sql` — **`get_us_order_for_payment(p_order_id)`** SECURITY DEFINER reader (the table is locked down) returning status/total/method/customer. Granted anon+authenticated. Mirrors the DR `get_online_order_for_payment`.
- `round-72d-mark-us-order-paid.sql` — **`mark_us_order_paid(p_order_id, p_method, p_ref)`** SECURITY DEFINER, **idempotent** (already-paid → no-op, so webhook retries are safe), stamps status/paid_at/method/ref + a `paid` timeline entry. **service_role only** (revoked from anon/authenticated) — only the server-side webhook/return handlers call it.

### Code (live)
- `app/us/checkout/actions.ts` — `placeUsOrder` (create the pending order), `startUsStripeCheckout` (USD Stripe session, `currency:'usd'`, `unit_amount` in US cents, `metadata.us_order_id`), `startUsPaypalCheckout` (**no peso conversion** — total is already USD; passes USD straight to `createPaypalOrder`), `getUsOrderForThanks`. All read the authoritative total via `get_us_order_for_payment` (never trust the client).
- `app/us/checkout/page.tsx` — server; loads the product via `fetchUsStoreProduct(slug)`; renders the form.
- `app/us/checkout/us-checkout-form.tsx` — client; qty stepper, customer + US address, three pay buttons (**Pay with card**, **Pay with PayPal**, **Bank deposit (local clients only)**). Deposit path just goes to the thank-you page (order stays pending).
- `app/us/checkout/gracias/page.tsx` — server thank-you. Paid → "Payment received". Pending (deposit) → bank details **read from `store_config` via `get_store_public_config()` / `fetchStorePublicConfig().bankInfo`** (Banreservas / Bernhard Perkins / 960-649-2594 / Cuenta de Ahorros), EN/ES, + a `wa.me/18292867868` "send receipt" button. **No hardcoded bank details** — change them in Store Config and the page follows.
- `app/us/checkout/paypal-return/route.ts` — captures the PayPal order (`capturePaypalOrder(token)`), calls `mark_us_order_paid` via the **service-role** admin client, redirects to `gracias`. USD throughout.
- `app/api/webhooks/stripe/route.ts` — **EDITED** (not a new endpoint). The one Stripe webhook now branches: `session.metadata.us_order_id` → `mark_us_order_paid` (US); `session.metadata.sale_id` → `finalize_online_payment` (DR). Both idempotent.
- `app/us/[slug]/us-product-view.tsx` — replaced the "coming soon" box with a qty stepper + **Buy now** → `/us/checkout`.
- Middleware: **no change needed** — `/us` is already in `PUBLIC_PREFIXES` and matching is `startsWith`, so `/us/checkout*` and `/api/webhooks` are already public.

### Verified
- **Stripe card — fully proven end-to-end in TEST mode**: checkout → Stripe → webhook → order flipped to `paid` (`payment_method=stripe`, `cs_test_...` ref, `paid_at` stamped). 
- Bank deposit — page renders the real bank details + WhatsApp link.
- **PayPal — NOT self-testable**: the GangaLoo PayPal is both merchant and the only account available, and PayPal blocks paying yourself (login/2FA loop, then CSP errors). Code is complete and uses the **same `createPaypalOrder`/`capturePaypalOrder` helpers + same live creds as the proven DR PayPal flow** — only difference is it passes USD directly instead of converting pesos. Trusted on that basis. To truly prove it: have a **different** person pay (any PayPal/card via guest checkout), then refund.

---

## C. STRIPE IS NOW LIVE (important env-var state)

- The old Netlify `STRIPE_SECRET_KEY` was **broken** — it held a key **ID** (`mk_1TFpU...`), not a secret value, so all Stripe (DR + US) returned `401 Invalid API Key`. Stripe card payments had **never actually worked in production** (only PayPal + WhatsApp did).
- Fixed by **rolling** the live secret key in Stripe (live secret can only be revealed once, at creation; the original was created Mar 28 and unrecoverable) and setting the new `sk_live_...` in Netlify.
- The **live-mode** Stripe webhook endpoint was repointed from `gangalooshop.netlify.app/api/webhooks/stripe` → **`https://gangaloo.club/api/webhooks/stripe`**, listening for `checkout.session.completed`; its `whsec_...` is set as `STRIPE_WEBHOOK_SECRET` in Netlify. (The **test-mode** webhook was also repointed to `gangaloo.club` earlier in the session for the test-mode proof.)
- **Netlify env now: `STRIPE_SECRET_KEY=sk_live_...`, `STRIPE_WEBHOOK_SECRET=whsec_...` (live), `PAYPAL_ENV=live`, `PAYPAL_CLIENT_ID`/`PAYPAL_SECRET`=live.** USD money accounts exist (Cash US, PayPal, 2× AliExpress).
- **⚠ BEFORE PUBLICLY LAUNCHING THE US SHOP:** do ONE small **real-card** Stripe purchase (e.g. flag a cheap item, buy, confirm it flips to `paid`, refund) — live Stripe is configured but unproven with a real card. Test-mode is proven; live is not yet.
- This also means **DR card checkout should now work** for the first time (same key). Worth a real-card check there too.

---

## D. Phase 4 — US orders admin + ledger (DONE, live)

Nav item **US Orders** (`/us-orders`, `Globe` icon, OWNER_ONLY, i18n en "US orders" / es "Pedidos US"), inserted after Service Orders in `lib/nav.ts`.

### Money decisions on record (owner)
- **Sale income is posted BY HAND** when the owner processes the order (NOT automatic on paid).
- **Supplier cost is recorded too**, so reports show **US profit** (= total_usd − supplier_cost_usd).
- Owner picks the **money account + category** at post time (mirrors the payroll-advance pattern), not hardcoded.

### Database (live; records in db/migrations)
- `round-73a-us-order-ledger-columns.sql` — `transactions.source_us_order_id` (+ index); `us_orders.income_transaction_id` + `us_orders.supplier_transaction_id`. (`supplier_cost_usd` already existed from 72a.) Additive.
- `round-73b-us-order-ledger-functions.sql` — four functions, all SECURITY DEFINER, **owner/admin-gated via `auth.uid()`** → **call via the regular server client, NEVER service-role** (and they **can't be run from the SQL editor** — no logged-in user there; exercise from the app). They mirror `post_payroll_advance` (round-54a): `post_transaction` then tag `source_us_order_id` + `is_manual=false`, with `reverse_transaction` to undo.
  - `post_us_order_income(order, money_account, category)` — posts **+income** (cents = `round(total_usd*100)`); blocks double-post; scope follows the account; stamps `income_transaction_id`.
  - `reverse_us_order_income(order)`.
  - `post_us_order_supplier_cost(order, amount_usd, money_account, category, note)` — posts **−expense**; blocks double-post; stores `supplier_cost_usd`; stamps `supplier_transaction_id`.
  - `reverse_us_order_supplier_cost(order)`.
- **USD → cents at post time** (`round(usd*100)`), posted against a **USD money account** so the balance-sheet currency conversion (round-65a) values it in pesos correctly.

### Code (live)
- `lib/us-orders.ts` — PURE client-safe types + helpers (`UsOrder`, status labels, `usd()`, `shortId()`, `usOrderProfit()`).
- `app/(dashboard)/us-orders/page.tsx` — `requireOwner`; reads `us_orders` via **admin client** (RLS-locked), money accounts via `listAccounts({includePrivateAndMixed:true})`, `account_categories` (type in income/expense, active) via the **server client** — exactly like `payroll/page.tsx`.
- `app/(dashboard)/us-orders/actions.ts` — stage/notes/delete via **admin client**; ledger post/reverse via the **regular server client** (the round-73b RPCs gate on auth.uid()).
- `app/(dashboard)/us-orders/us-orders-view.tsx` — list + detail; fulfilment stage buttons (paid → forwarded → shipped → completed); **Post sale income** / **Record supplier cost** dialogs (account + category pickers) + reverse buttons; profit line; notes; delete.

### To verify (couldn't be SQL-tested — auth.uid() gated)
- Need a real US order. Open it in **US Orders** → **Post sale income** (pick e.g. PayPal USD account + an income category like "Shop Sales") → confirm it appears in Accounting and the account balance moves. → **Record supplier cost** → confirm profit shows. → test the **Reverse** buttons.

---

## E. Other things settled this session
- **Service item "no stock" at the register** — NOT a bug. The item simply had **track-inventory ON** (`is_inventory=true`), so `confirm_pos_sale` correctly ran the lot logic and refused (no lots). Fix = flip the product's stock toggle OFF. (`confirm_pos_sale` already exempts `is_inventory=false` items — Round 39. Reminder: there's a historical toggle-reverts-to-on bug fixed in `6d0616a`; if a service item throws "no stock" again, check `is_inventory` first.)
- **Wax Stick** (`b28dbc44-8953-40e8-8660-9d1a34b23d77`) was temporarily flagged `us_enabled=true` for a PayPal price test, then **unflagged** (`us_enabled=false`). US shop is back to just the one originally-flagged wig.
- `us_orders` test rows from the session were all deleted (clean slate; `select count(*) from us_orders` = 0).

---

## F. OPEN / NEXT SESSION (queued, NOT built)

### 1. Online bulk discounts (decided to build next session)
- **Current state:** bulk discount rules (incl. store-wide "all products") work at the **POS register** and **staff /sales/new** ONLY. The **customer storefront deliberately does NOT read bulk rules** (decision recorded 06-06 addendum §C). Owner confirmed a store-wide bulk rule (all products, qty≥1, Montellano) **works at POS** but shows nothing online — that's by design, not a bug.
- **Owner wants it online too** (both POS and storefront), understanding it's a real build.
- **Scope of the build (per 06-06 addendum §C):** make the storefront pricing pipeline read bulk rules — **logged-in customers only**, applied in the **cart + checkout** (where quantity is known). The **grid + product page can't meaningfully preview** a qty-threshold bulk price (single item, no qty context) — that's a limitation to accept, not a bug.
- **The lock-step rule (critical):** `lib/discount-rules-resolver.ts` (TS, the live charge authority, already handles store-wide bulk — the register uses it) and `public.resolve_line_discounts` (SQL) must stay identical. But note: the storefront charge actually flows through `get_storefront_quote` / `place_storefront_order`, which currently do NOT call the resolver for bulk. So this build means teaching the **storefront quote/order SQL** to apply bulk (qty-based), plus the cart preview (TS), keeping **grid = product page = cart = checkout to the peso**. Money-touching; do DB-first, verify on a real sale.

### 2. Mark PO received without it being fully paid (deferred)
- Owner wants Purchases to **mark a PO received before the supplier payment is complete** (receive into stock now, pay later).
- This is **real surgery**: stock counts + FIFO `inventory_lots` (`qty_remaining` stores its own count, decremented at sale time) + the money ledger all interlock. Relevant: `round-14b...mark-received`, `round-38c-pay-supplier-for-received`. Diagnose the current receive-vs-pay ordering before changing; rebuild any money function from the **live** body via `pg_get_functiondef`.

### 3. Phase 5 (US shop, future)
- Returns (US), margin reporting, US Merchant Center feed.

### Carried over from prior addenda (still open)
- Patch remaining single-phrase product-search boxes with the word-split fix (Caja/`pos-register.ts` already has its own loader; transfers, online-orders-new, labels) if "won't match" recurs.
- `club_member_no` not on the People `Profile` type (People card shows `memberNo: null`).
- Optional: retire old `gangaloo.netlify.app`; remove old Merchant Center data source; member-number backfill for till-only members; shareable membership-card PNG; tier/loyalty config cleanup (06-06 §G).

_End of 2026-06-15 addendum._
