Continuing Gangaloo admin build (Next.js 16 + Turbopack + Netlify +
shadcn/ui + Supabase SSR + Tailwind v4). Project:
`C:\Users\Perkins\Documents\Apps\GangaLoo New 05-26\gangaloo-admin\`.
Migration SQLs in sibling `gangaloo-migration\`.
Remote: https://github.com/gangaloososua/GangaLoo2026.git (private).

== STATE AS OF END OF LAST SESSION ==

Modules complete and committed: Auth, Dashboard shell, Categories,
Warehouses, People, Products (all 6 tabs), Settings (hub + Exchange
Rates + Store Config), Sales/POS (Round 9), Users (Round 10).

ROUND 11 (RBAC) is IN PROGRESS. 15 of ~16 planned commits landed.
The app is now behaviourally RBAC-correct at the app layer:
every server-action export has a guard, every owner-only page
has requireOwner(), Sales is scoped to seller_id for non-owners,
Products costs and Calculator are hidden for non-owners, People
list is locked to role=customer for sellers.

Audit summary at end of session (from 11.9):
  4 / 4   categories/actions.ts
  5 / 5   people/actions.ts
 10 / 10  products/actions.ts
  5 / 5   sales/actions.ts
  3 / 3   settings/exchange-rates/actions.ts
  1 / 1   settings/store-config/actions.ts
  9 / 9   users/actions.ts
  6 / 6   warehouses/actions.ts
Total: 43 exports / 43 guards. login + logout intentionally
unguarded. Only users/actions.ts uses the admin (service-role)
Supabase client; the other 7 use the ssr client.

Canonical RBAC spec lives at `docs/rbac.md`. Source of truth.
Read it before adding any new module — every new write action
needs an appropriate require* guard, every new page surface
needs to be mapped to a role.

== ROUND 11 REMAINING ==

11.10 — RLS migration (NOT STARTED, planned for next session)
    Enable RLS at the DB layer with policies + auth_role() helper.
    NOT strictly necessary for safety — the app-layer guards are
    doing the work. RLS is defence in depth against direct client
    queries (future storefront, mobile app, accidental anon-client
    use). Caveat: lib/supabase/admin.ts (service role) bypasses
    RLS, so RLS does not defend against bugs in this codebase.
    Scope: write `gangaloo-migration/round-11-rls.sql`. Enable RLS
    on: profiles, sales, sale_items, sale_lot_consumption,
    sale_commissions, sale_payments, stock_movements,
    inventory_lots, purchases, purchase_items, purchase_payments,
    store_config, monthly_exchange_rates, money_accounts,
    transactions. Policies mirror the RBAC matrix. Helper SQL
    function `public.auth_role()` returns the caller's role
    from profiles (SECURITY DEFINER, set search_path = public).
    Apply via Supabase SQL editor. Smoke-test every page after.
    Estimated 60-90 minutes minimum. Has rollback risk; keep
    a transaction-wrapped rollback SQL handy.

11.11 — Promote 3 sellers (NOT DONE, operational only)
    Delia, Estafany, Fabienne exist as unlinked seller profiles.
    Use /users/new "Promote existing" tab on each, set a password,
    share credentials. ~5 min total. Can be done any time after
    11.10 lands (or before if user accepts the app-layer-only
    protection; the spec ships behaviourally complete without RLS).

== ROADMAP AFTER ROUND 11 ==

Honest priority order, with sizes:

Round 12 — Money Accounts module (small)
    Cash drawer, bank accounts. Unblocks fresh install (the
    /sales/new empty-state alert points at "Settings" generically
    because money accounts have no UI). Owner-only per spec.

Round 13 — Settings Receipt tab (small)
    Polish round. Named fields for store_name, store_address,
    store_phone, store_rnc, instead of generic store_config keys.

Round 14 — Purchases module (substantial — was MISSED in the
    original handoff)
    Owner-only. Purchase data is fully migrated: 74 orders from
    437 legacy lines, 390 inventory lots fed from those. Tables:
    purchase_orders, purchase_order_items, supplier_payments,
    courier_payments (with allocations across orders). UI needs
    list + detail (line items + landed-cost breakdown + lot trail
    showing which sales consumed lots from this order).
    Add a Purchases nav entry in lib/nav.ts with roles: OWNER_ONLY
    (currently absent — Round 11.4 nav table didn't include it).
    Pre-req for Round 18 (cashback reports).

Round 15 — Online Orders (substantial)
    Sister to POS sales. Same `sales` table, source='online'.
    Fulfillment workflow: paid → preparing → shipped → delivered.
    Owner-only per spec (sellers have no relevant seller_id on
    customer-placed orders; revisit if assigned_to_id is added).
    THIS is what blocks full cutover from the old system if you
    keep taking online orders during the build.

Round 16 — Sale-discount auto-application (design first)
    Schema has bulk_disc, club tier discounts, transfer_discount.
    Unused at sale time. Multiple sensible designs; pick before
    writing code.

Round 17 — Inventory / stock-movements UI
    Manual adjustments, breakage, transfers, audits. Sellers can
    read (per spec); writes are owner-only.

Round 18 — Cashback / commissions reports
    Needed before paying sellers. Cashback report depends on
    Round 14 Purchases data being browsable.

Round 19 — Accounting / transactions module
    Wraps payouts, transfers, manual entries. Schema tables exist;
    no UI.

Round 20 — Real-numbers dashboard
    The current /dashboard placeholder gets real data: revenue,
    top products, low stock, commissions due.

== MIGRATION CUTOVER STATUS ==

The DB has a frozen snapshot from the migration cutoff: 135 sales
(126 POS + 9 online), all products, all people, etc. Anything
done in the OLD system since the cutoff is NOT in the new DB.

Cutover options (decision pending):
  (a) Cut POS to new system NOW (already works; Sophia made a
      real sale through confirm_pos_sale). Keep online orders in
      the old system until Round 15 ships.
  (b) Keep both running, plan a delta-migration pass before final
      cutover.
  (c) Hybrid — what (a) effectively is during the build phase.

If you're still taking online orders in the old system, that
delta needs migrating before Round 15 considers the old system
retired. Same for purchases entered in the old system.

== DB CONTEXT (unchanged) ==

- profiles.auth_user_id is the bridge to auth.users; required for
  the confirm_pos_sale role gate to resolve role.
- Role enum: 'owner','admin','seller','distributor','customer'.
- Spec decision: customer is NOT served by this admin app —
  bounced to /bounce on login. admin is dormant (behaves as owner
  if ever created via SQL; never created via UI).
- Users UI only creates seller or distributor; admin promotion
  remains SQL-only.
- Owner cannot be banned, unlinked, or role-changed from /users
  (guarded in actions.ts).
- ZERO triggers on sales chain — app owns transactional logic.
- sale_items.line_total_cents + sales.total_cents are GENERATED
  columns.
- stock_movements.created_by FKs profiles.id NOT auth.users.id.
- sales_fac_seq is atomic but doesn't roll back; failed confirms
  leave invoice number gaps (acceptable).
- 34 tables. ALL with RLS currently DISABLED. Round 11.10 enables
  it on the ~15 sensitive ones.

== PATTERNS IN THIS PROJECT (match these) ==

- Server component (page.tsx) fetches data → passes to client
  component.
- 'use server' actions return { ok, error? } or redirect.
- Toasts via sonner; AlertDialog for destructive confirms.
- Tabbed forms use Radix Tabs with forceMount + global CSS
  [role="tabpanel"][data-state="inactive"] { display: none
  !important; }.
- URL state for list filters via searchParams.
- dnd-kit with useId() on DndContext for SSR.
- Server actions body limit raised to 5mb in next.config.ts.
- Commit messages via @'...'@ | Set-Content to .commitmsg.txt,
  then git commit -F. Use -Encoding utf8.
- Dates shown with explicit 'en-GB' locale to avoid SSR/client
  hydration mismatch.
- Inline edit pattern (store-config): Enter saves, Esc reverts.
- shadcn Select forbids "" as a value — use sentinel like __all__
  or __walkin__.
- Paths with brackets like app\(dashboard)\users\[id]\... need
  PowerShell -LiteralPath.
- Sidebar is components/sidebar.tsx; nav items are in lib/nav.ts
  (single source of truth — edit there, not in the Sidebar).
- RBAC helpers: lib/auth/roles.ts (Role, ADMIN_ROLES, OWNER_ROLES,
  isOwnerEquivalent, isAdminRole, isSellerRole) and
  lib/auth/guard.ts (requireAdminCaller, requireRole, requireOwner).
- Every server action MUST have a guard. Every owner-only page
  MUST call requireOwner() at the top. Pages accessible to
  sellers/distributors call requireAdminCaller() and then make
  role-aware decisions in the body.

== POWERSHELL GOTCHAS (learned the hard way) ==

- @"..."@ heredocs eat ${...} and backticks. ALWAYS use @'...'@
  for TS/JS with template literals.
- PS 5.1's Set-Content -Encoding has no utf8NoBOM — only utf8.
  Cosmetic BOM on commit subject is harmless.
- Set-Content -LiteralPath WORKS in 5.1.
- Pasting previous git status output back into PS makes it try to
  execute each line as a command. Annoying but harmless.
- DO NOT use regex to patch TypeScript with multi-line argument
  lists or multi-line imports. The line-walking approach
  (read into a List[string], find by name, walk to brace, insert)
  is bulletproof; regex is not. Three regex misfires in Round 11.6
  proved this — switched to line-walking after that and zero issues.
- For .Replace() (string method, not -replace operator), CRLF/LF
  line endings must match exactly. Safer to use line-walking on
  files read with Get-Content (no -Raw).
- Multi-line imports in some files (sales/actions.ts had
  `import {\n  searchProductsForSale,\n  type ProductSearchResult,\n}
  from '@/lib/sales'`) require an import-insert loop that scans
  past `from '...'` lines, not one that breaks on the first
  non-import line.
- When the function body brace isn't at end of the signature line
  but on the line right after `): TYPE {`, the regex
  `\([^)]*\)[^{]*\{` may match an EARLIER `{` (e.g. inside
  `rows: Array<{ ... }>` parameter type or inside an inline `if`
  block). Solution: require BOTH `)` and `{$` on the same matched
  line, OR use line-walking that explicitly checks for both.

== WORKFLOW ==

PowerShell on Windows, two windows (one running `npm run dev`,
one for commands). Files moved via `move` from Downloads —
NEVER paste long files into Notepad (truncation risk). Use
here-strings with Set-Content -LiteralPath -Encoding utf8 for
file writes. Walk one micro-step at a time and wait for "done"
before the next.

== INFRA ==

SUPABASE_SERVICE_ROLE_KEY is in .env.local. NEVER commit it
(confirmed not tracked via `git ls-files`). The only client
allowed to use it is lib/supabase/admin.ts, which has
`import 'server-only'` at the top. Never import lib/supabase/admin
into a client component.

== SEARCH ==

Use conversation_search liberally to find specifics from
previous chats. Useful queries:
  "Gangaloo Round 11 RBAC"
  "lib/auth/guard requireOwner"
  "line-walking patch products actions"
  "promoteProfileToUser"
  "confirm_pos_sale role gate"
  "FAC-2889"
  "purchase_orders supplier_payments courier_payments"

== PICK UP AT: [REPLACE THIS LINE] ==

Suggested options:

  - Round 11.10 — RLS migration (the most important security
    work remaining; biggest single SQL commit of the project)
  - Round 11.11 — Promote 3 sellers (5 minutes, no code,
    immediately useful)
  - Round 12 — Money Accounts module (small visible progress;
    unblocks payment recording UX)
  - Round 14 — Purchases module (substantial; pre-req for
    cashback reports)
  - Round 15 — Online Orders (substantial; needed for full
    cutover from old system)
