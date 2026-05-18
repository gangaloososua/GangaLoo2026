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
Users (Round 10), RBAC (Round 11, all sub-rounds including RLS).

ROUND 12 (Money Accounts): foundation complete, application layer
in progress.

  12.1 spec — DONE (docs/round-12-money-accounts.md)
  12.0.a multi-currency schema — DONE
  12.0.b currency-aware lib + UI:
    12.0.b.1 lib/exchange-rates.ts — DONE
    12.0.b.2 settings/exchange-rates/actions.ts — DONE
    12.0.b.3 settings/exchange-rates UI (page+table+dialog) — DONE
    12.0.b.4 Products consumer (lib/products + page + form tabs) — DONE
  12.2 lib/money-accounts.ts — DONE
  12.3 list page — NEXT
  12.4 create page + action — pending
  12.5 edit page + action — pending
  12.6 nav entry — pending
  12.7 end-to-end smoke + seller-404 verification — pending

== WHAT TO BUILD NEXT (12.3 — LIST PAGE) ==

Route: app/(dashboard)/money-accounts/page.tsx + list-table.tsx.

Server component fetches accounts AND rates in parallel:
  - listAccounts({ includePrivateAndMixed, includeInactive })
    from lib/money-accounts.ts. Filter values come from
    searchParams (URL-state pattern, same as Sales list).
  - fetchEffectiveRatesForCurrencies(currencies) from
    lib/exchange-rates, where `currencies` is the distinct set
    actually present in the fetched accounts (helper:
    currenciesFromAccounts).

requireOwner() at top. URL state: ?private=1, ?inactive=1,
?q=<search>, ?group=<tag>.

Client component (list-table.tsx) renders:
  - filter row: toggles for Show private + mixed, Show inactive;
    search input filtering name (substring, case-insensitive);
    Group dropdown built from groupTagsFromAccounts
  - table grouped by currency in order DOP, EUR, USD, then others
    alphabetical. Per-currency subtotal in each group header.
  - columns: Name | Kind (badge) | Group (dimmed) | Balance
    (right-aligned, currency-aware fmt) | Status (Active/Inactive
    badge) | Scope (Business/Mixed/Private — only shown when the
    private toggle is on) | Manage (link to /money-accounts/[id]/edit)
  - below the table, a single summary panel:
      "DOP-equivalent total: ₱X,XXX,XXX.XX"
      "Rates used: USD via 2026-05, EUR via 2026-04, ..." or similar
      "Missing rates: <currency>" lines for non-DOP currencies with
      no rate set in any month (their subtotal is NOT in the total).

Empty currency groups are hidden. DOP is the base — rate=1, not
displayed in "rates used".

Spec on disk at docs/round-12-money-accounts.md (lines 70-110 ish
for the list page section, exact wording is the source of truth).

== KEY DECISIONS LOCKED FOR ROUND 12 ==

- Scope handling: business-only default; private AND mixed behind
  a single toggle. (mixed is undocumented in the data model — no
  one knows what it means; treated like private until reason to
  separate.)
- Multi-currency totals: per-currency subtotals + DOP-equivalent
  grand total using current rate per currency.
- Stale-rate fallback: most recent prior month, surface which
  month is being used per currency in the rates-used line.
- CRUD scope: list + create + edit. No delete (is_active=false).
- Transfers: out of scope, deferred to Round 19.
- Edit form: initial balance, current balance, and currency are
  read-only post-creation.
- Round-trip already proven for multi-currency settings UI: create
  / edit / delete all work, USD and EUR coexist for the same month.

== MIGRATION CUTOVER STATUS ==

Unchanged. DB has frozen snapshot from cutoff: 135 sales (126 POS
+ 9 online), all products, all people, etc. Anything entered in
OLD system since cutoff is NOT in new DB. Cutover decision still
pending. POS technically works in new system. Delia, Estafany,
Fabienne, and Sophia all have logins; only Sophia has rung a real
test sale.

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
- money_accounts: 20 production rows across DOP/EUR/USD, 4 kinds
  in actual data (bank/cash/digital/credit_line), schema also
  permits 'card'. Scopes in data: business + private (one private
  row). Schema also permits 'mixed' (no rows currently). Owner-only
  per RLS.
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
  12.0.a learned this the hard way: schema shipped, then discovered
  fetchCurrentExchangeRate (in lib/products.ts at the time) AND
  the settings/exchange-rates/actions.ts trio all needed updates.
- Client-safe types live in lib/<thing>-types.ts when needed; the
  server fetchers re-export them. Avoids "module depends on
  next/headers in Pages Router" errors when client components want
  a type from a server-side lib.

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
  "Round 12.0.b multi-currency exchange rates"
  "lib/money-accounts listAccounts groupTagsFromAccounts"
  "fetchEffectiveRatesForCurrencies"
  "mixed scope account_scope"
  "exchange-rates-types client safe"
  "Round 11.10 RLS auth_role"

== PICK UP AT ==

Round 12.3 — Money Accounts list page. Spec lines for the list
section in docs/round-12-money-accounts.md are the source of truth;
key shape recapped above under "WHAT TO BUILD NEXT".

Order of work suggested for next session:
  1. Create app/(dashboard)/money-accounts/page.tsx (server component
     with requireOwner + parallel fetch of accounts and rates)
  2. Create app/(dashboard)/money-accounts/list-table.tsx (client
     component with filters and grouped table)
  3. Smoke test as owner: list renders, filters work, DOP total
     computes, rates-used line is correct.
  4. Add nav item to lib/nav.ts (12.6 — do early so the URL is
     reachable from the sidebar during testing).
  5. Then 12.4 (create) and 12.5 (edit) as separate sub-rounds.

The 12.7 seller-404 verification waits until 12.6 is in place
(it tests the sidebar visibility too).
