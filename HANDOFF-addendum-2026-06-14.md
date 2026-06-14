# GangaLoo — Handoff Addendum (2026-06-14)

_Appended to the prior handoffs. Same owner (**Bernhard Perkins**, non-technical), same workflow: work **one step at a time**, plain language, **DB before dependent code**, deliver full files to copy in (owner prefers complete files + a PowerShell move script, NOT line-by-line edits), then publish `npx tsc --noEmit` → `git add` (explicit paths) → `git commit` → `git push` (**commit before push**; a pre-commit hook runs tsc). Everything below is committed, pushed, and live. Round numbering continues from Round 70/71 below._

---

## A. What shipped this session

| Commit | What |
| --- | --- |
| `1865f1c` | **`updatePromotionRule`** server action (edit promotion rules in place) |
| `7156ebe` | **Edit promotion rules** — pencil button on promotion rows + `/discount-rules/[id]/edit` page & form; `dealSlot` added to the discount-rules read layer |
| `0633442` | **US shop — abandoned approach** (separate `us_products` table + admin). _Superseded — see C._ |
| `1539151` | **Removed** the separate `us_products` work (table dropped + files/nav deleted) |
| `528dad9` | **US shop Phase 1 (final)** — US flags/pricing on the EXISTING `products` table + US section on the product form |
| `75f4750` | **US shop Phase 2** — public `/us` storefront (grid + product page), safe read fns, cost_calc price fix |

---

## B. Discount rule editing (DONE, live)

Previously rules could only be created + toggled on/off + deleted (no edit). Now **promotion** rules can be edited in place — the owner reuses one daily/weekly deal by swapping product/%/store/dates instead of creating a new rule each time.

- `app/(dashboard)/discount-rules/actions.ts` — added **`updatePromotionRule`** (mirrors `createPromotionRule`'s validation exactly; only ever updates a row where `kind='promotion'` as a safety guard; owner/admin-gated; plain table update, no migration).
- `lib/discount-rules.ts` — added **`dealSlot`** ('daily'|'weekly'|null) to `DiscountRuleRow`, the raw type, the SELECT, and the map (it was missing, so the edit form couldn't pre-fill daily/weekly). `getDiscountRuleById` already existed and is reused.
- `app/(dashboard)/discount-rules/edit/edit-promotion-form.tsx` (NEW) — a copy of `new-promotion-form.tsx` pre-filled from the rule; calls `updatePromotionRule`. Kept SEPARATE from the new form on purpose so a bug here can't break rule creation.
- `app/(dashboard)/discount-rules/[id]/edit/page.tsx` (NEW) — loads the rule (404s if not a promotion) + the product/category/warehouse picker data (same loaders as the new-promotion page), renders the edit form.
- `app/(dashboard)/discount-rules/list-table.tsx` — pencil **Edit** link on **promotion rows only** (other kinds still show only Delete). Edit-for-other-kinds was not built.
- **Verified live.** Editing only covers promotions; bulk/coupon/club_tier/customer_override still create-only.

---

## C. US dropship shop — the big arc this session

### The pivot (important context)
We first built a **separate `us_products` table** with its own admin (commit `0633442`). The owner then realised that means **entering every product twice**. We **abandoned** that approach and **removed it entirely** (`1539151` — table dropped via `drop table ... cascade`, all 5 files + nav item deleted, confirmed nothing else referenced it). 

**The final model:** the **SAME products** entered for the DR market can ALSO be shown in the US shop, flagged per-product, priced in USD, with **no commission/club/loyalty add-ons** and (decided) **no tax, free shipping**. No double entry.

### Decisions on record (owner)
- **Which products in the US shop:** only ones flagged (`us_enabled`), NOT all by default.
- **US price:** **markup % with optional manual override.** Default markup **5%**.
- **Cost basis for the markup:** **`cost_calc->>'base_cost_usd'`** (the USD cost the owner TYPES on the Calculator tab) — **NOT** the `products.base_cost_usd` column, which can hold a different, separately-sourced number (we saw 73.19 in the column vs 69.20 typed). The form preview was fixed to read `cost_calc` too, so preview == storefront == (eventually) charge.
- **US tax:** **NONE to start.** Owner is mostly dropshipping with no tax obligation; real US sales tax (nexus, per-jurisdiction rates, remitting) is a paid-service problem (Stripe Tax / TaxJar) to add later IF an accountant says a state requires it. Do not hand-roll per-state tax.
- **US shipping:** **free — built into the markup.** No shipping calculator.
- **US payments:** **same Stripe + PayPal accounts, in USD.** (Confirmed feasible — see Phase 3 notes.)

### Round 70a — US flags on products (DB, live)
`db/migrations/round-70a-products-us-flags.sql` — added to `public.products`:
- `us_enabled boolean not null default false`
- `us_markup_percent numeric not null default 5`
- `us_price_override_usd numeric` (nullable)
- partial index `products_us_enabled_idx ... where us_enabled`.
Purely additive — the DR storefront/POS/feed do NOT read these, so nothing existing changed.

### Phase 1 — US fields on the EXISTING product form (commit `528dad9`, live)
Owner-only "US shop" section at the bottom of the product **Pricing** tab: enable checkbox, US markup %, optional US price override, with a live USD price preview. Threaded through the standard SELECT+type+pass prefill chain (the lesson from `video_url`/`is_inventory`/`sale_price_cents`):
- `app/(dashboard)/products/_form/pricing-tab.tsx` — the US section (gated on `canSeeCosts`); preview = override else `base_cost_usd * (1+markup/100)`.
- `app/(dashboard)/products/_form/product-form.tsx` — `InitialValues` gained `base_cost_usd`, `us_enabled`, `us_markup_percent`, `us_price_override_usd`; passed to `PricingTab`.
- `app/(dashboard)/products/actions.ts` — `createProduct` + `updateProduct` read the 3 US fields from formData and write them in BOTH payloads.
- `app/(dashboard)/products/[id]/page.tsx` — US fields added to the owner SELECT, the type, and `initial`. **`base_cost_usd` is read from `cost_calc.base_cost_usd`, NOT the column** (the fix above; shipped in `75f4750`).
- **Verified:** flag on, markup/override save + stick, preview correct, DR pricing untouched.

### Round 71a — safe US storefront read (DB, live)
`db/migrations/round-71a-us-store-functions.sql`:
- `public._us_price_usd(override, markup, cost)` — the single price formula (override if >0, else cost*(1+markup/100), rounded 2dp; null if no resolvable price).
- `public.get_us_store_products()` and `public.get_us_store_product(p_slug)` — SECURITY DEFINER, return ONLY display-safe columns (id, name, slug, description, primary_image_url, us_price_usd). NEVER expose cost/markup. Only `us_enabled AND is_active AND visible_in_store` AND a resolvable price (no $0 products). Granted to anon+authenticated.
- **Gotcha hit + fixed:** `products` has **no flat `category` column** (categories live in the `product_categories` link table). First version of these fns selected `p.category` and errored; category was dropped from the US fns (no category filter in the US shop for now).
- **Verified:** `select * from get_us_store_products();` returns the flagged wig at **$72.66** (69.20 × 1.05).

### Phase 2 — public `/us` storefront (commit `75f4750`, live, BROWSE-ONLY)
English, USD, brand-styled (navy `#0A2A66` / red `#CE1126` / flag stripe), matches the DR landing look. NO cart/checkout yet.
- `lib/us-store.ts` (NEW) — public read layer; `fetchUsStoreProducts()` / `fetchUsStoreProduct(slug)` call the safe RPCs. Deliberately simple (no warehouse/stock/club/deal pricing).
- `app/us/page.tsx` + `app/us/us-shop-view.tsx` (NEW) — grid landing.
- `app/us/[slug]/page.tsx` + `app/us/[slug]/us-product-view.tsx` (NEW) — product detail; shows a "online ordering coming soon, contact us" note (placeholder until Phase 3).
- `lib/supabase/middleware.ts` — **added `/us` to `PUBLIC_PREFIXES`** (CRITICAL — same lesson as manifest/feed: without it, logged-out `/us` 307-redirects to /login and customers can't see the shop). **Test: incognito `gangaloo.club/us` must show the grid, not bounce to login.**
- **Verified live, incognito.**

---

## D. PHASE 3 STARTS HERE (next session) — USD checkout (NOT built)

The heavy, money-touching phase. Decisions are settled (no tax, free shipping, USD Stripe+PayPal), so it's lighter than feared — the checkout math is just **sum of item prices**.

**Key architecture decision already made:** the US shop must NOT route through `place_storefront_order()` (the DR checkout SQL fn). That function is tied to warehouses, tier/coupon/DR pricing, and the `sales` ledger — none of which the US shop uses (its fulfilment is "forward to supplier," like Encargos). **Phase 3 needs its OWN order path:**
- a small **US-orders table** (customer name/email + US shipping address, items jsonb with USD prices, total, status, payment method/ref, link for forwarding),
- a **create-US-order** function (USD, item prices only, free shipping, no tax),
- **US Stripe/PayPal actions** mirrored from `app/(shop)/tienda/[warehouse]/checkout/actions.ts` but: Stripe `currency: 'usd'` with `unit_amount` in US cents (DR uses `'dop'`); PayPal is ALREADY USD in the DR flow (it converts pesos→USD today), so the US one is simpler — the price is already USD, no rate conversion.
- The DR Stripe webhook + PayPal return handlers are the pattern to mirror for marking a US order paid.

**Then Phase 4** = US order handling/forwarding in the admin (mirror/extend Encargos: see the order, forward to supplier by hand, mark stages, record supplier cost, WhatsApp alert via `lib/notify.ts`, post sale income + supplier cost to the ledger so US sales show in reports). **Phase 5** = returns, margin reporting, US Merchant Center feed.

See **`US-DROPSHIP-PLAN.md`** (repo root) for the full phased plan.

---

## E. Conventions reconfirmed this session
- Owner strongly prefers **whole files + a PowerShell move script**, not str_replace-style line edits. Always ship the move script; use the newest-match picker (`Get-ChildItem -LiteralPath $dl -Filter 'name*.ext' | Sort -Desc | Select -First 1`).
- Several files must be **renamed to `page.tsx`** on copy (Next.js route convention) — call this out explicitly each time.
- `git add` of a not-yet-saved migration path **fails the whole add** (hit twice — "pathspec did not match"). Save the `db/migrations/round-NN.sql` record file BEFORE the `git add`.
- A `git add` that silently does nothing leaves files in "Changes not staged" — re-check `git status` shows them staged before committing.
- `products` categories are via the **`product_categories` link table** (primary category), NOT a column on `products`.
- USD money on the US side is handled as numeric dollars in cost fields but **cents** at Stripe charge time (Stripe `unit_amount` is minor units).

_End of 2026-06-14 addendum._
