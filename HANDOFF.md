Continuing Gangaloo admin build (Next.js 16 + Turbopack + Netlify +
shadcn/ui + Supabase SSR + Tailwind v4). Project:
`C:\Users\Perkins\Documents\Apps\GangaLoo New 05-26\gangaloo-admin\`.
Migration SQLs live in the admin repo at `db\migrations\`
(pattern adopted in Round 11.10). Old sibling `gangaloo-migration\`
still has pre-Round-11 SQLs, untracked.
Remote: https://github.com/gangaloososua/GangaLoo2026.git (private).

== STATE AS OF END OF LAST SESSION ==

Modules complete and committed: Auth, Dashboard shell, Categories,
Warehouses, People, Products (all 6 tabs), Settings (hub + Exchange
Rates + Store Config), Sales/POS (Round 9), Users (Round 10), RBAC
(Round 11, all sub-rounds including RLS + promotions).

ROUND 12 (Money Accounts): IN PROGRESS. Spec landed; one foundation
sub-round (12.0.a, multi-currency schema) done. Application-layer
work pending. Detailed status:

  12.1 (spec) — DONE. See docs/round-12-money-accounts.md.
  12.0.a (DB schema for multi-currency rates) — DONE.
  12.0.b (lib + UI updates for multi-currency) — NOT STARTED.
  12.2+ (Money Accounts pages/actions) — NOT STARTED, blocked by 12.0.b.

== WHY 12.0.a EXISTS (CONTEXT FOR NEXT SESSION) ==

Round 12 spec calls for a DOP-equivalent grand total over accounts
in DOP, EUR, USD. Discovered mid-design that monthly_exchange_rates
had no currency column and a PK on (year, month) — i.e. only one
foreign currency rate was supported per month. Existing row was
USD->DOP.

Two migrations applied (both committed at 889214a):
  round-12-exchange-rates-currency.sql      — add currency column
  round-12-exchange-rates-pk-fix.sql        — replace PK to include currency

Verified: USD and EUR rows now coexist for the same year+month.
PK is now (year, month, currency). Schema is multi-currency capable.

== 12.0.b — WORK TO DO NEXT SESSION ==

The schema change broke callers that weren't updated. Three places
need fixing before any Money Accounts code lands. Order:

  12.0.b.1 — lib/exchange-rates.ts (currency-aware)
    - Add `Currency` type (literal union: 'DOP' | 'USD' | 'EUR')
    - Add `currency: Currency` to ExchangeRate type
    - MOVE fetchCurrentExchangeRate from lib/products.ts to here
    - Make `currency` a REQUIRED parameter (no default — explicit is safer)
    - Add fetchEffectiveRatesForCurrencies(currencies: Currency[]):
        returns { rates: Record<Currency, { rate, year, month }>,
                  missing: Currency[] }
        Per currency: current month preferred, fall back to most
        recent prior month, then to "missing" if no rate ever set.

  12.0.b.2 — settings/exchange-rates/actions.ts (currently BROKEN)
    Three functions to fix. None can stay as written:
    - createRate: insert without currency would 500 (NOT NULL violation)
    - updateRate: .eq('year', X).eq('month', Y) updates ALL currencies
    - deleteRate: same issue
    All three need currency added to their identification keys.

  12.0.b.3 — settings/exchange-rates UI (page, dialog, table)
    Surface the currency column. Likely:
    - rates-table.tsx: new Currency column, sort by year DESC, month DESC, currency
    - rate-form-dialog.tsx: Currency select (DOP/USD/EUR) on create only
      (currency immutable post-creation, same rationale as account currency)
    - page.tsx: pass currency to fetchAllExchangeRates if filtering;
      may just render all and let the table group

  12.0.b.4 — lib/products.ts + products/[id]/page.tsx
    - Remove the duplicate ExchangeRateRow + fetchCurrentExchangeRate
      from lib/products.ts (moved to lib/exchange-rates.ts in 12.0.b.1)
    - products/[id]/page.tsx: update import path, pass 'USD' explicitly
    - Verify Products Calculator still works after the change

After 12.0.b ships, Round 12 proper picks up:
  12.2 lib/money-accounts.ts fetchers
  12.3 list page
  12.4 create page + action
  12.5 edit page + action
  12.6 nav entry
  12.7 end-to-end smoke + seller-404 verification

== BROKEN UI WARNING ==

Do NOT add an exchange rate via /settings/exchange-rates until
12.0.b.2 ships. The create form will hit a NOT NULL violation on
currency. Existing rates can still be displayed; they just can't
be inserted or updated cleanly until the actions are fixed.

If you genuinely need to add a EUR rate before next session, do
it via SQL editor:
  INSERT INTO monthly_exchange_rates (year, month, currency, rate, source, notes)
  VALUES (2026, 5, 'EUR', <your rate>, 'manual', 'pre-12.0.b workaround');

== ROADMAP AFTER ROUND 12 ==

Round 13 — Settings Receipt tab (small)
Round 14 — Purchases module (substantial; pre-req for Round 18)
    Real table names: purchase_orders, purchase_order_items,
    courier_payments, courier_payment_allocations, payment_receipts.
Round 15 — Online Orders (substantial; cutover blocker)
Round 16 — Sale-discount auto-application (design first)
Round 17 — Inventory / stock-movements UI
Round 18 — Cashback / commissions reports
Round 19 — Accounting / transactions module (transfers between
           money accounts live here)
Round 20 — Real-numbers dashboard

== MIGRATION CUTOVER STATUS ==

Unchanged. DB has frozen snapshot from cutoff: 135 sales (126 POS
+ 9 online), all products, all people, etc. Anything entered in
OLD system since cutoff is NOT in new DB. Cutover decision still
pending. POS technically works in new system. With Delia,
Estafany, Fabienne now logged in (plus Sophia from before),
parallel running is operationally feasible.

== DB CONTEXT ==

- profiles.auth_user_id is the bridge to auth.users; required for
  confirm_pos_sale role gate.
- Role enum: 'owner','admin','seller','distributor','customer'.
- customer is NOT served by this admin — bounced to /bounce.
- admin is dormant; behaves as owner if SQL-created. Never via UI.
- Owner cannot be banned, unlinked, or role-changed from /users.
- ZERO triggers on sales chain — app owns transactional logic.
- sale_items.line_total_cents + sales.total_cents are GENERATED.
- stock_movements.created_by FKs profiles.id NOT auth.users.id.
- sales_fac_seq is atomic but doesn't roll back; failed confirms
  leave invoice number gaps (acceptable).
- 34 tables; 19 have RLS enabled (the sensitive ones).
- confirm_pos_sale is SECURITY DEFINER + search_path=public; it
  bypasses RLS. POS still works under RLS via this.
- auth_role() helper: SECURITY DEFINER, STABLE, search_path locked.
- money_accounts: 20 rows live, 3 currencies (DOP, EUR, USD), 4
  kinds (bank/cash/digital/credit_line), 2 scopes (business/private).
  Owner-only per RLS.
- monthly_exchange_rates: NOW multi-currency. PK is (year, month,
  currency). One row exists: 2026-05 USD = 62.5000.

== KEY FK STRUCTURE FOR FUTURE RLS WORK ==

Sales chain is two-deep, not flat:
  sales(id)
    <- sale_items(sale_id)
        <- sale_lot_consumption(sale_item_id)
        <- sale_commissions(sale_item_id)
    <- sale_payments(sale_id)

sale_lot_consumption and sale_commissions hang off sale_items, NOT
sales directly. Their RLS policies use a two-hop join through
sale_items to reach the owning sales.seller_id.

== PATTERNS IN THIS PROJECT (match these) ==

- Server component fetches data -> client component renders.
- 'use server' actions return { ok, error? } or redirect.
- Toasts via sonner; AlertDialog for destructive confirms.
- Tabbed forms: Radix Tabs with forceMount + global CSS to hide
  inactive panels.
- URL state for list filters via searchParams.
- dnd-kit with useId() on DndContext for SSR.
- Server actions body limit 5mb in next.config.ts.
- Commit messages via @'...'@ | Set-Content to .commitmsg.txt,
  then git commit -F. Use -Encoding utf8.
- Dates shown with explicit 'en-GB' locale to avoid hydration
  mismatch.
- Inline edit pattern: Enter saves, Esc reverts.
- shadcn Select forbids "" — use sentinel like __all__ / __walkin__.
- PowerShell paths with brackets need -LiteralPath (e.g.
  app\(dashboard)\users\[id]\...).
- Sidebar nav items in lib/nav.ts (single source of truth).
- RBAC helpers in lib/auth/roles.ts + lib/auth/guard.ts.
- Every server action MUST have a guard. Every owner-only page MUST
  call requireOwner(). Pages for sellers/distributors call
  requireAdminCaller() then make role-aware decisions in the body.
- New DB migrations: drop into db/migrations/round-NN-name.sql,
  paired round-NN-name-rollback.sql, wrap in BEGIN/COMMIT, make
  idempotent (CREATE OR REPLACE, DROP POLICY IF EXISTS first).
- When a migration changes a shared table, GREP for callers FIRST.
  12.0.a learned this the hard way: shipped the schema, then
  discovered fetchCurrentExchangeRate (in lib/products.ts) and the
  settings/exchange-rates/actions.ts trio all needed updates. Now
  in the checklist.

== DEV SERVER GOTCHAS ==

- Turbopack dev cache can break specific routes (return 404 with no
  console errors) while the rest of the app keeps working. Hit this
  in Round 11.10 on five owner-facing sub-routes; resolved by editing
  any file in an affected route, which forced a rebuild that knocked
  all five loose. If a route 404s for no clear reason and there are
  no console errors, BEFORE investigating code: stop `npm run dev`,
  delete the `.next` folder, restart. Saves an hour of guard hunting.
- Sub-routes (e.g. /sales/[id], /settings/exchange-rates) seem more
  likely to hit this than root routes. Both static and dynamic
  segments can be affected.
- This dev-server bug does NOT affect production `next build`. Worth
  a smoke `npm run build` before any cutover anyway.

== POWERSHELL GOTCHAS ==

- @"..."@ heredocs eat ${...} and backticks. ALWAYS use @'...'@ for
  TS/JS with template literals.
- @'...'@ heredocs are LITERAL. Single quotes inside the body stay
  as single quotes — DO NOT double them. (Doubled them once and
  had to clean up; the close-out of Round 11.)
- PS 5.1's Set-Content -Encoding has no utf8NoBOM — only utf8.
  Cosmetic BOM on commit subject is harmless.
- DO NOT use $content.Replace(...) for multi-line text patches. It
  silently no-ops on whitespace mismatches. Use full file rewrites
  for SQL/migration files; line-walking for TS files.
- For paths with brackets, use -LiteralPath.
- Don't paste git status output back into PS — it tries to execute
  each line as a command.
- Long git output drops you into a pager (prompt is `:`). Press `q`
  to exit, NOT Ctrl+C.

== WORKFLOW ==

PowerShell on Windows, two windows (one running `npm run dev`, one
for commands). Files moved via `move` from Downloads — NEVER paste
long files into Notepad (truncation risk). Use @'...'@ here-strings
with Set-Content -LiteralPath -Encoding utf8 for file writes. Walk
one micro-step at a time and wait for "done" before the next.

== INFRA ==

SUPABASE_SERVICE_ROLE_KEY in .env.local. NEVER commit it (confirmed
not tracked via `git ls-files`). The only client allowed to use it
is lib/supabase/admin.ts, which has `import 'server-only'` at the
top. The admin client BYPASSES RLS — guards in lib/auth/guard.ts
carry the load for code paths that use it.

The ssr client (lib/supabase/server.ts) RESPECTS RLS as of Round
11.10.

== SEARCH ==

Use conversation_search liberally. Useful queries:
  "Gangaloo Round 12 money accounts spec"
  "monthly_exchange_rates currency primary key"
  "fetchCurrentExchangeRate currency parameter"
  "Round 11.10 RLS auth_role"
  "404 cluster Turbopack cache"
  "confirm_pos_sale SECURITY DEFINER bypass"

== PICK UP AT ==

Round 12.0.b — update lib/exchange-rates.ts, then settings actions,
then settings UI, then products consumer. Detailed sub-step plan
above under "12.0.b — WORK TO DO NEXT SESSION". After 12.0.b
ships, move to 12.2 (Money Accounts fetchers) per the spec at
docs/round-12-money-accounts.md.

Before starting 12.0.b, confirm dev server is clean (`npm run dev`
in a fresh terminal, hard-refresh /settings/exchange-rates as
owner — list should render, just don't try to create/edit/delete
a rate).
