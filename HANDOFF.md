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
Rates + Store Config + **Receipt tab**), Sales/POS (Round 9),
Users (Round 10), RBAC (Round 11, all sub-rounds including RLS),
**Money Accounts (Round 12)**, **Settings Receipt tab (Round 13)**.

Round 12 (Money Accounts): COMPLETE.
Round 13 (Settings Receipt tab): COMPLETE.
Round 14a (Purchases read surface): SPEC LANDED. Application
work pending.

  14a.0 spec — DONE (a3db84f) at docs/round-14-purchases.md
  14a.1 lib/purchases.ts — NEXT
  14a.2 list page — pending
  14a.3 detail page — pending
  14a.4 nav entry — pending
  14a.5 smoke + seller-404 — pending

== WHAT TO BUILD NEXT (14a.1 — lib/purchases.ts) ==

Pure data layer for the Purchases read surface. No UI yet. The spec
on disk at docs/round-14-purchases.md is the source of truth; what
follows is the working summary.

File: `lib/purchases.ts` (single file; no types-split needed unless
a client component later imports types — at which point spin off
`lib/purchases-types.ts` per the established pattern).

Exports:

  PurchaseStatus type
    'pending' | 'paid_supplier' | 'received' | 'complete'

  PurchaseOrderRow type
    every column from purchase_orders + denormalised supplier_name
    and warehouse_name

  PurchaseOrderItemRow type
    every column from purchase_order_items + denormalised
    product_name and product_sku

  LotTrailEntry type
    { lot: {id, lot_number, qty_received, qty_remaining,
            unit_cost_dop, received_at},
      consumption: Array<{
        sale_id, sale_invoice_number, sale_occurred_at,
        qty_consumed, seller_id, seller_name }>
    }

  derivedStatus(po): PurchaseStatus            (pure)
    if completed_at set    -> 'complete'
    else if received_at    -> 'received'
    else if paid_at_dop    -> 'paid_supplier'
    else                   -> 'pending'

  statusMismatch(po): boolean                  (pure)
    po.status !== derivedStatus(po)

  listPurchaseOrders(opts):
    Promise<{rows: PurchaseOrderRow[]; total; page; pageSize}>
    Options: search?, status?, supplierId?, warehouseId?,
             dateFrom?, dateTo?, mismatchOnly?, page?, pageSize?
    Default page=1, pageSize=50.
    mismatchOnly applied in memory after fetch (avoids a SQL CASE
    expression for the audit).

  getPurchaseOrder(id):
    Promise<PurchaseOrderRow | null>

  getPurchaseOrderItems(orderId):
    Promise<PurchaseOrderItemRow[]>

  getLotTrailForOrder(orderId):
    Promise<Map<purchase_order_item_id, LotTrailEntry[]>>
    Joins inventory_lots -> sale_lot_consumption -> sale_items
    -> sales. The two-deep join the handoff documents under
    "KEY FK STRUCTURE FOR FUTURE RLS WORK" — used here for reads.

Suggested order of work for 14a.1:
  1. Types + pure helpers (derivedStatus, statusMismatch). Smoke
     via a quick eyeball.
  2. listPurchaseOrders. Smoke via SQL editor: pick three
     filter combos, verify counts match.
  3. getPurchaseOrder + getPurchaseOrderItems together — one
     order id, both calls. Smoke by reading what comes back.
  4. getLotTrailForOrder. This is the hard one. Pick an order
     that has at least one lot that has been at least partially
     consumed by a sale. Smoke by checking the map sizes match
     line items count and at least one lot has non-empty
     consumption.
  5. Single commit covering all of 14a.1. Each smoke check is
     just a Get-Content + a SQL eyeball; no React rendered.

== KEY DECISIONS LOCKED FOR ROUND 14 ==

- Phased: 14a (read), 14b (status transitions + receive +
  inventory_lots creation), 14c (courier payments + allocations
  + landed-cost recomputation). 14b and 14c happen IN THAT ORDER,
  with no Round 15 squeezed between them per user direction. After
  14c, Round 15 (Online Orders, write-side cutover blocker).
- Round 14a is read-only. Any UPDATE or INSERT against
  purchase_orders, purchase_order_items, inventory_lots,
  courier_payments, courier_payment_allocations is a sign you are
  doing 14b or 14c work. Stop and re-spec.
- Status-mismatch audit: detect-and-flag only. derivedStatus
  computed from timestamps; mismatches surface as amber pills
  on the list and a comparison panel on the detail page. SQL is
  the cleanup path; the UI does not write status corrections.
- Pagination: 50/page on the list, same as Sales. 196 orders in
  the DB (handoff originally said 74; schema check at 14.0b
  showed 196 — figure was stale).
- Detail page checks "base + bank + transport = landed" per line
  item and flags with a small amber dot. If smoke testing shows
  >10% of rows flagged, suppress the dot until a real audit pass
  is run on the migration data.
- legacy_lot_numbers (ARRAY column on purchase_orders) and the
  payment_receipts table are NOT surfaced in 14a.

== DATA MODEL FACTS LEARNED THIS SESSION ==

- purchase_status enum values, in order: pending, paid_supplier,
  received, complete.
- No supplier_payments table. The supplier payment data lives
  directly on purchase_orders (paid_at_dop, dop_paid_total,
  dop_bank_fee, exchange_rate, official_rate_at_payment,
  supplier_payment_account_id).
- courier_payments uses a separate allocations table
  (courier_payment_allocations) so one courier_payment can be
  split across many purchase_orders. 36 payments allocated 275
  times across orders — many-to-many is real.
- purchase_order_items.dop_unit_landed_cost = dop_unit_cost_base
  + dop_bank_share + dop_transport_share. Stored separately rather
  than only as a generated total so each component is auditable.
- inventory_lots.purchase_order_item_id is nullable. Some lots
  predate the migration of purchase data; they have NULL there.
- inventory_lots.unit_cost_dop is captured at receipt; changing
  the PO line's landed cost later does NOT retroactively rewrite
  the inventory.
- payment_receipts: table exists, contents unknown to this round.
  Surface noted; not investigated.

== ROADMAP ==

13 — Settings Receipt tab — DONE
14 — Purchases — IN PROGRESS
  14a — read surface (5 sub-rounds; 14a.0 done)
  14b — status transitions (later)
  14c — courier payments and allocations (later)
15 — Online Orders (substantial). Sister to POS sales. Same `sales`
     table, source='online'. Fulfillment workflow: paid → preparing
     → shipped → delivered. Owner-only per spec. **Write-side
     cutover blocker** — comes AFTER 14a/14b/14c, not before.
16 — Sale-discount auto-application (design first).
17 — Inventory / stock-movements UI. Sellers read; writes owner-only.
18 — Cashback / commissions reports. Depends on Round 14 data.
19 — Accounting / transactions module. Includes deferred
     money-account transfers from Round 12.
20 — Real-numbers dashboard.
21 — **Spanish UI (i18n).** Sellers are Dominican; the admin needs
     to be in Spanish before they use it for daily work. Scope:
     UI text only (labels, buttons, headers, toasts) plus date
     and number locale (`'en-GB'` -> `'es-DO'` throughout — the
     codebase explicitly uses 'en-GB' to avoid hydration
     mismatches, so each call site needs flipping).
     Whole-admin Spanish, not per-user — keeps the round simple.
     **Open question for the round:** pick an i18n library
     (next-intl vs react-intl, leaning next-intl as App-Router-
     native) with an eye toward reusing the same approach in the
     customer-facing store later. Don't lock into something
     admin-only.
     **Practical urgency:** sellers already have logins (Sophia
     rang a test sale). The deadline is "before sellers use the
     admin daily" — could move ahead of Round 20 if cutover
     timing pressures.

== CUTOVER STATUS ==

DB has frozen snapshot from cutoff: 135 sales (126 POS + 9 online),
all products, all people, etc. Anything entered in OLD system since
cutoff is NOT in new DB. Cutover decision still pending.

POS technically works in new system. Money Accounts is functional.
Receipt identity is configurable via the new admin.

Cutover blockers:
- **Read-side**: Round 14a (Purchases read surface). 196 orders +
  390 inventory lots are in the DB; no UI to view them. Without
  it, the new admin can't audit where stock came from or trace a
  sale's lot trail. **In progress — spec landed, application
  work next.**
- **Write-side**: Round 15 (Online Orders UI). If online orders
  keep coming in during the build, they accumulate without a UI
  to manage fulfillment.
- **Usability blocker (new)**: Round 21 (Spanish UI). The admin
  is currently English-only and sellers are Dominican. Cutover
  for sellers' daily work needs this; owner usage is unblocked.

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
  permits 'card'. Scopes in data: business + private. Schema
  permits 'mixed' (no rows currently). Owner-only per RLS.
  Round 12 UI:
    - balance_cents NEVER written from UI — only transactions.
      createAccount sets balance_cents = initial_balance_cents
      on insert; updateAccount strips currency, balance_cents,
      and initial_balance_cents from its update payload.
    - 'mixed' scope permitted by the action but only shown in the
      UI Select if the row already has it.
- monthly_exchange_rates: multi-currency as of 12.0.a. PK is
  (year, month, currency). One row currently: 2026-05 USD = 62.5000.
- store_config: jsonb value column, NO triggers, NO auto-update
  of updated_at. Writers must write updated_at explicitly.
  Receipt action does so; the existing Store Config UI probably
  does not (not audited). If a trigger-based auto-bump is added
  later, audit existing writers first.
- purchase_status enum: pending, paid_supplier, received, complete.

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

Round 14a uses this same join for reads:
  inventory_lots(id) -> sale_lot_consumption(lot_id?)
    -> sale_items(id) -> sales(id)

== EXCHANGE-RATES MODULE TOPOLOGY (post-12.0.b) ==

  lib/exchange-rates-types.ts — pure types and constants. Safe to
    import from client components. Exports: Currency,
    SUPPORTED_CURRENCIES, ExchangeRate, EffectiveRate,
    EffectiveRatesResult.

  lib/exchange-rates.ts — server-only fetchers. Re-exports types.
    Exports: fetchAllExchangeRates, fetchCurrentExchangeRate,
    fetchEffectiveRatesForCurrencies.

== MONEY-ACCOUNTS MODULE TOPOLOGY (post-Round 12) ==

  lib/money-accounts.ts — server-side data layer.
    Exports: MoneyAccountKind, MoneyAccountScope,
    MONEY_ACCOUNT_KINDS, MONEY_ACCOUNT_SCOPES,
    DEFAULT_VISIBLE_SCOPES, MoneyAccount, listAccounts,
    getAccount, currenciesFromAccounts, groupTagsFromAccounts.

  app/(dashboard)/money-accounts/actions.ts — createAccount,
    updateAccount. Both requireOwner(); share readForm helper.

  app/(dashboard)/money-accounts/account-form.tsx — shared client
    form. Optional account?: MoneyAccount prop drives create vs
    edit. Currency and initial-balance fields are disabled Inputs
    in edit mode (not Selects — disabled shadcn Select is
    unreadable); initial_balance uses name={undefined} when locked
    so it does not submit.

  app/(dashboard)/money-accounts/page.tsx — list (server fetch
    accounts then rates sequentially; rates needs currencies from
    accounts). Wraps list-table in Suspense.

  app/(dashboard)/money-accounts/list-table.tsx — grouped table.
    URL state: ?private=1, ?inactive=1, ?q=<search>, ?group=<tag>.
    Search debounced 300ms. DOP-equivalent grand total surfaces
    missing rates on an amber line.

== STORE-CONFIG / RECEIPT TOPOLOGY (post-Round 13) ==

  lib/store-config-types.ts — pure types and constants. Safe to
    import from client components. Exports: ConfigValueType,
    StoreConfigRow, StoreInfo, STORE_INFO_DEFAULTS.
    Mirrors the exchange-rates split pattern. Adding it was the
    fix for the "next/headers in client component" build error
    that bit us in Round 13.

  lib/store-config.ts — server-only fetchers. Re-exports types.
    Exports: fetchStoreConfig, fetchStoreInfo.

  app/(dashboard)/settings/receipt/actions.ts — upsertStoreInfo
    server action. Owner-only. Bulk upsert all four store_config
    rows (store_name, store_address, store_phone, store_rnc) with
    onConflict='key'. Writes updated_at explicitly per row
    (column has no auto-bump).

  app/(dashboard)/settings/receipt/page.tsx — server page,
    requireOwner + fetchStoreInfo, renders the client form.

  app/(dashboard)/settings/receipt/receipt-form.tsx — client form,
    four fields, sonner toast on save, no redirect.

== PATTERNS IN THIS PROJECT (match these) ==

- Server component fetches data -> client component renders.
- 'use server' actions return { ok, error? } or redirect.
  Both { success: true } and { ok: true } shapes are in the
  codebase; pick whichever matches the file being edited.
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
  mismatch. Round 21 (Spanish UI) will flip these to 'es-DO'
  globally — these call sites are the i18n surface for dates.
- Inline edit pattern: Enter saves, Esc reverts.
- shadcn Select forbids "" — use sentinel like __all__ / __walkin__.
- Disabled shadcn Select looks awful — use a disabled Input that
  displays the value instead (Round 12 currency-in-edit pattern).
- PowerShell paths with brackets need -LiteralPath.
- Sidebar nav items in lib/nav.ts (single source of truth).
- RBAC helpers in lib/auth/roles.ts + lib/auth/guard.ts.
- Every server action MUST have a guard. Every owner-only page MUST
  call requireOwner(). Pages for sellers/distributors call
  requireAdminCaller() then make role-aware decisions in the body.
- requireOwner uses notFound() (via requireRole), not redirect, on
  a non-owner caller. Avoids leaking the existence of restricted
  surfaces.
- New DB migrations: drop into db/migrations/round-NN-name.sql,
  paired round-NN-name-rollback.sql, wrap in BEGIN/COMMIT, make
  idempotent.
- When a migration changes a shared table, GREP for callers FIRST.
- Client-safe types live in lib/<thing>-types.ts when needed; the
  server fetchers re-export them. Avoids "next/headers in Pages
  Router" errors when client components want a type from a
  server-side lib. Round 13 had to retrofit this for store-config
  mid-build; recognising the import-trace pattern fast saved time.
- Update actions that should NOT touch certain columns: strip them
  from the update payload, don't rely on the form omitting them.
- When a table has no auto-bump trigger on updated_at, the writer
  must include it in the payload. Don't assume Postgres does it
  for you (Round 13 caught this during smoke testing).
- jsonb columns accept raw string writes via PostgREST; the string
  gets coerced to a JSON scalar. Reads back as a JS string. Fine
  for now, but worth knowing it's happening (Round 13 finding).
- All hardcoded UI strings (labels, buttons, toasts, headers)
  are English today. Round 21 (Spanish UI) will need to extract
  these — keep them centralised-ish or at least findable, don't
  string-concatenate or compute strings dynamically.

== DEV SERVER GOTCHAS ==

- Turbopack dev cache can break specific routes (return 404 with no
  console errors) while the rest of the app keeps working. Resolved
  by stopping `npm run dev`, deleting `.next`, restarting.
- Sub-routes (e.g. /sales/[id], /settings/exchange-rates) seem more
  likely to hit this than root routes.
- Turbopack only recompiles modules when something imports them.
  A newly created file with no importers will show no compile output;
  type-checking only happens when a consumer references it.
- This dev-server bug does NOT affect production `next build`.

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
- Regex-replace on TS imports is sharp: a too-greedy `-replace`
  once renamed an identifier inside an import that should have
  been removed entirely. Always verify the import block after such
  a pass.
- Add-Content collapses the trailing newline of the appended
  heredoc with the file's existing trailing newline, so
  Measure-Object -Line counts can come up a few lines short of
  the expected. Not a problem; just calibration.
- PS 5.1's Select-String does NOT have -Recurse. Use
  Get-ChildItem -Recurse -Include ... | Select-String instead.

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
  "Round 14 purchases spec"
  "Round 14a list page detail page lot trail"
  "purchase_orders status enum"
  "courier_payment_allocations many-to-many"
  "inventory_lots purchase_order_item_id"
  "Round 13 receipt tab complete"
  "Round 12 money accounts complete"
  "fetchEffectiveRatesForCurrencies"
  "store-config-types client safe"
  "Round 21 Spanish UI i18n"

== PICK UP AT ==

Round 14a.1 — lib/purchases.ts. Data layer for the read surface.
Spec on disk at docs/round-14-purchases.md (commit a3db84f) is
the source of truth. Working summary recapped above under
"WHAT TO BUILD NEXT (14a.1 — lib/purchases.ts)".

Order of work suggested for next session:
  1. Types + pure helpers (derivedStatus, statusMismatch).
  2. listPurchaseOrders with the searchParams filter set.
  3. getPurchaseOrder + getPurchaseOrderItems.
  4. getLotTrailForOrder — the two-deep join. Smoke against an
     order known to have consumption.
  5. Single commit for all of 14a.1.

Before starting 14a.1, sanity-check the dev server: `npm run dev`
in a fresh terminal, navigate to /purchases — should 404 since
the route doesn't exist yet. That's normal. If it 500s or hangs,
that's the Turbopack cache bug; stop dev, delete .next, restart.
