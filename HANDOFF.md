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
Rates + Store Config — now multi-currency), Sales/POS (Round 9),
Users (Round 10), RBAC (Round 11, all sub-rounds including RLS),
**Money Accounts (Round 12, all sub-rounds incl. seller-404 verification)**.

ROUND 12 (Money Accounts): COMPLETE.

  12.0.a multi-currency schema — DONE
  12.0.b currency-aware lib + UI — DONE
  12.1 spec — DONE (docs/round-12-money-accounts.md)
  12.2 lib/money-accounts.ts — DONE
  12.3 list page — DONE (e1a4c59)
  12.4 create page + action — DONE (ad342e1)
  12.5 edit page + action — DONE (11d2a98)
  12.6 nav entry — DONE (rolled into 12.3 commit, between
       Warehouses and People with Wallet icon, OWNER_ONLY)
  12.7 seller-404 verification — DONE (no commit; verification
       only). Verified all three routes 404 for a seller session
       (`/money-accounts`, `/money-accounts/new`,
       `/money-accounts/[id]/edit`) and sidebar entry is hidden.

ZZ Test Account created during 12.4 smoke test was hard-deleted
via SQL after 12.7 verification — money_accounts is back to clean
production data.

== WHAT TO BUILD NEXT (ROUND 13 — SETTINGS RECEIPT TAB) ==

Small polish round. Named fields for store identity instead of
generic `store_config` key-value blobs.

Currently `store_config` is a flat key-value table the Store Config
UI edits as a generic editor. Round 13 introduces a "Receipt" tab
under Settings that surfaces a fixed set of named fields:

  - store_name
  - store_address
  - store_phone
  - store_rnc        (Registro Nacional de Contribuyente — DR tax id;
                     printed on every receipt)

Each field maps to the same `store_config` row by key, but the UI
treats them as first-class form fields with proper labels, types,
and validation rather than free-form key/value editing.

Scope notes:
- Owner-only. requireOwner() on the page and any actions.
- No schema change required — values still live in `store_config`.
- Probably a new sub-tab at /settings/receipt (sibling to
  /settings/exchange-rates and /settings/store-config).
- Out of scope: logo upload, receipt template / layout editor,
  per-warehouse override of these fields.

Order of work suggested for next session:
  13.1 — Pull current store_config keys; spec the field set on disk
        in docs/round-13-receipt-tab.md.
  13.2 — Server action: upsertReceiptFields({store_name, ...})
  13.3 — Page + form at app/(dashboard)/settings/receipt
  13.4 — Update Settings hub to include Receipt as a card
  13.5 — Smoke test: edit each field, refresh, value persists; verify
        existing store_config consumer (POS receipt rendering, if any)
        still reads the same keys.

Round 13 is intentionally tiny — a confidence-builder palate cleanser
between Round 12 (Money Accounts, just shipped) and Round 14 (Purchases,
substantial).

== ROADMAP THROUGH ROUND 20 ==

13 — Settings Receipt tab (small, NEXT)
14 — **Purchases module (substantial — was missed in original
     roadmap). Owner-only.** Purchase data is fully migrated:
     74 orders from 437 legacy lines, 390 inventory lots fed
     from those. Tables: purchase_orders, purchase_order_items,
     supplier_payments, courier_payments (with allocations across
     orders). UI needs list + detail (line items + landed-cost
     breakdown + lot trail showing which sales consumed lots from
     this order). Add Purchases nav entry in lib/nav.ts with
     roles: OWNER_ONLY (currently absent — Round 11.4 nav table
     didn't include it). Pre-req for Round 18 (cashback reports).
15 — Online Orders (substantial). Sister to POS sales. Same `sales`
     table, source='online'. Fulfillment workflow: paid → preparing
     → shipped → delivered. Owner-only per spec (sellers have no
     relevant seller_id on customer-placed orders; revisit if
     assigned_to_id is added). **This is the write-side cutover
     blocker if you keep taking online orders during the build.**
16 — Sale-discount auto-application (design first). Schema has
     bulk_disc, club tier discounts, transfer_discount; unused at
     sale time. Multiple sensible designs — spec before code.
17 — Inventory / stock-movements UI. Manual adjustments, breakage,
     transfers, audits. Sellers can read (per spec); writes
     owner-only.
18 — Cashback / commissions reports. Needed before paying sellers.
     Cashback report depends on Round 14 Purchases data being
     browsable.
19 — Accounting / transactions module. Wraps payouts, transfers,
     manual entries. Schema tables exist; no UI. (Round 12 explicitly
     deferred money-account transfers to here.)
20 — Real-numbers dashboard. Current /dashboard placeholder gets
     real data: revenue, top products, low stock, commissions due.

== CUTOVER STATUS ==

DB has frozen snapshot from cutoff: 135 sales (126 POS + 9 online),
all products, all people, etc. Anything entered in OLD system since
cutoff is NOT in new DB. Cutover decision still pending.

POS technically works in new system. Money Accounts is functional.

Cutover blockers:
- **Read-side**: Round 14 (Purchases UI). 74 orders + 390 inventory
  lots are in the DB; no surface to view them. Without it, the new
  admin can't audit where stock came from or trace a sale's lot trail.
- **Write-side**: Round 15 (Online Orders UI). If online orders keep
  coming in during the build, they accumulate without a UI to manage
  fulfillment.

Delia, Estafany, Fabienne, and Sophia all have logins; only Sophia
has rung a real test sale.

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
- money_accounts: production rows across DOP/EUR/USD, 4 kinds
  in actual data (bank/cash/digital/credit_line), schema also
  permits 'card'. Scopes in data: business + private (one private
  row). Schema also permits 'mixed' (no rows currently). Owner-only
  per RLS. Round 12 UI:
    - balance_cents is NEVER written from the UI — only transactions
      move it. createAccount sets balance_cents = initial_balance_cents
      on insert; updateAccount strips currency, balance_cents, and
      initial_balance_cents from its update payload even if they
      arrive in FormData.
    - 'mixed' scope is permitted by the action but only shown in
      the UI Select if the row already has it (lets you save without
      a scope mismatch; doesn't expose mixed as a creation choice
      until we know what it means).
- monthly_exchange_rates: multi-currency as of 12.0.a. PK is
  (year, month, currency). Currently one row: 2026-05 USD = 62.5000.

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

== EXCHANGE-RATES MODULE TOPOLOGY (post-12.0.b) ==

Two files, intentional split:

  lib/exchange-rates-types.ts — pure types and constants. Safe to
    import from client components.
    Exports: Currency, SUPPORTED_CURRENCIES, ExchangeRate,
    EffectiveRate, EffectiveRatesResult.

  lib/exchange-rates.ts — server-only fetchers. Imports next/headers
    transitively via Supabase server client; MUST NOT be imported
    from client components.
    Re-exports the types from the types file for server-side
    callers' convenience.
    Exports: fetchAllExchangeRates, fetchCurrentExchangeRate(currency),
    fetchEffectiveRatesForCurrencies(currencies).

If a new client component needs the types, import from
lib/exchange-rates-types. If server code needs both, import from
lib/exchange-rates (which re-exports). Don't mix.

== MONEY-ACCOUNTS MODULE TOPOLOGY (post-Round 12) ==

  lib/money-accounts.ts — server-side data layer.
    Exports: MoneyAccountKind, MoneyAccountScope,
    MONEY_ACCOUNT_KINDS, MONEY_ACCOUNT_SCOPES,
    DEFAULT_VISIBLE_SCOPES, MoneyAccount,
    listAccounts({includePrivateAndMixed?, includeInactive?}),
    getAccount(id), currenciesFromAccounts, groupTagsFromAccounts.
    The constants are exported so client components can re-use
    them in dropdowns without redeclaring.

  app/(dashboard)/money-accounts/actions.ts — server actions
    ('use server'). Exports: createAccount, updateAccount. Both
    requireOwner(); both share the readForm helper.

  app/(dashboard)/money-accounts/account-form.tsx — shared client
    form. Optional account?: MoneyAccount prop drives create vs
    edit mode (same pattern as warehouse-form). In edit mode:
    current-balance panel above the form; currency and
    initial-balance fields rendered as disabled Inputs (not
    Selects — disabled shadcn Select is unreadable); the
    initial_balance field uses name={undefined} when locked so
    it does not submit at all.

  app/(dashboard)/money-accounts/page.tsx — list, server-side
    fetch of accounts then rates (sequential, not parallel — rates
    fetch depends on currenciesFromAccounts(accounts) for currency
    scoping). Wraps list-table in Suspense for useSearchParams.

  app/(dashboard)/money-accounts/list-table.tsx — grouped table.
    URL state: ?private=1, ?inactive=1, ?q=<search>, ?group=<tag>.
    Search debounced 300ms into ?q=. Grouped by currency
    (DOP, EUR, USD, then others alpha). DOP-equivalent grand
    total uses fetchEffectiveRatesForCurrencies; missing rates
    surfaced on a separate amber line and excluded from total.

== PATTERNS IN THIS PROJECT (match these) ==

- Server component fetches data -> client component renders.
- 'use server' actions return { ok, error? } or redirect.
  (Round 12 used { success: true } / { error: string } — same
  shape with a different success key. Both shapes exist in the
  codebase; warehouses uses { success }, money-accounts matches it.)
- Toasts via sonner; AlertDialog for destructive confirms.
- Tabbed forms: Radix Tabs with forceMount + global CSS to hide
  inactive panels.
- URL state for list filters via searchParams (Next 16:
  searchParams is Promise<...>, await it).
- dnd-kit with useId() on DndContext for SSR.
- Server actions body limit 5mb in next.config.ts.
- Commit messages via @'...'@ | Set-Content to .commitmsg.txt,
  then git commit -F. Use -Encoding utf8.
- Dates shown with explicit 'en-GB' locale to avoid hydration
  mismatch.
- Inline edit pattern: Enter saves, Esc reverts.
- shadcn Select forbids "" — use sentinel like __all__ / __walkin__.
- Disabled shadcn Select looks awful — use a disabled Input that
  displays the value instead (Round 12 currency-in-edit pattern).
- PowerShell paths with brackets need -LiteralPath (e.g.
  app\(dashboard)\money-accounts\[id]\edit).
- Sidebar nav items in lib/nav.ts (single source of truth).
- RBAC helpers in lib/auth/roles.ts + lib/auth/guard.ts.
- Every server action MUST have a guard. Every owner-only page MUST
  call requireOwner(). Pages for sellers/distributors call
  requireAdminCaller() then make role-aware decisions in the body.
- requireOwner uses notFound() (via requireRole), not redirect, on
  a non-owner caller. This is intentional — avoids leaking the
  existence of restricted surfaces. Sellers hitting /money-accounts
  get a vanilla 404, same as a typo'd URL.
- New DB migrations: drop into db/migrations/round-NN-name.sql,
  paired round-NN-name-rollback.sql, wrap in BEGIN/COMMIT, make
  idempotent (CREATE OR REPLACE, DROP POLICY IF EXISTS first).
- When a migration changes a shared table, GREP for callers FIRST.
  12.0.a learned this the hard way: schema shipped, then discovered
  fetchCurrentExchangeRate (in lib/products.ts at the time) AND
  the settings/exchange-rates/actions.ts trio all needed updates.
- Client-safe types live in lib/<thing>-types.ts when needed; the
  server fetchers re-export them. Avoids "module depends on
  next/headers in Pages Router" errors when client components want
  a type from a server-side lib.
- Update actions that should NOT touch certain columns: strip
  those columns from the update payload, don't rely on the form
  omitting them. Round 12 updateAccount strips currency,
  balance_cents, initial_balance_cents as defense in depth.

== DEV SERVER GOTCHAS ==

- Turbopack dev cache can break specific routes (return 404 with no
  console errors) while the rest of the app keeps working. Hit this
  in Round 11.10 on five owner-facing sub-routes; resolved by editing
  any file in an affected route. If a route 404s for no clear reason
  and there are no console errors, BEFORE investigating code: stop
  `npm run dev`, delete the `.next` folder, restart.
- Sub-routes (e.g. /sales/[id], /settings/exchange-rates) seem more
  likely to hit this than root routes.
- Turbopack only recompiles modules when something imports them.
  A newly created file with no importers will show no compile output;
  type-checking only happens when a consumer references it. Normal,
  not an error.
- This dev-server bug does NOT affect production `next build`. Worth
  a smoke `npm run build` before any cutover anyway.

== POWERSHELL GOTCHAS ==

- @"..."@ heredocs eat ${...} and backticks. ALWAYS use @'...'@ for
  TS/JS with template literals.
- @'...'@ heredocs are LITERAL. Single quotes inside the body stay
  as single quotes — DO NOT double them.
- PS 5.1's Set-Content -Encoding has no utf8NoBOM — only utf8.
  Cosmetic BOM on commit subject is harmless.
- DO NOT use $content.Replace(...) for multi-line text patches. It
  silently no-ops on whitespace mismatches.
- For paths with brackets, use -LiteralPath.
- Don't paste git status output back into PS — it tries to execute
  each line as a command.
- Long git output drops you into a pager (prompt is `:`). Press `q`
  to exit, NOT Ctrl+C.
- Regex-replace on TS imports is sharp: a too-greedy `-replace
  "ExchangeRateRow", "ExchangeRate"` once renamed an identifier
  inside an import that should have been removed entirely. Always
  verify the import block after such a pass.
- Add-Content collapses the trailing newline of the appended
  heredoc with the file's existing trailing newline, so Measure
  -Object -Line counts can come up a few lines short of the
  expected. Not a problem; just calibration.

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
  "Round 12 money accounts complete"
  "Round 13 receipt tab spec"
  "store_config keys"
  "lib/money-accounts listAccounts"
  "fetchEffectiveRatesForCurrencies"
  "Round 11.10 RLS auth_role"
  "warehouse-form pattern"

== PICK UP AT ==

Round 13 — Settings Receipt tab. Small polish round before Round 14
(Purchases). Named form fields for store_name, store_address,
store_phone, store_rnc that map to store_config keys.

Order of work suggested for next session:
  1. Pull current store_config keys via SQL — confirm what's there
     today and which keys (if any) are already in use by other
     code (POS receipt rendering, settings/store-config UI).
  2. Spec on disk at docs/round-13-receipt-tab.md.
  3. Server action upsertReceiptFields (owner-only).
  4. Page at /settings/receipt + form.
  5. Settings hub entry (Receipt card).
  6. Smoke test: persist + read-back + verify no existing consumer
     broke.
