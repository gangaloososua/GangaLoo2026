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
Rates + Store Config), Sales/POS (Round 9), Users (Round 10).

ROUND 11 (RBAC): COMPLETE. All sub-rounds committed. App layer
(11.1-11.9), DB layer (11.10), promotions (11.11) all done.

Round 11.11 (THIS SESSION): promoted Estafany and Fabienne via
/users/new "Promote existing" tab. Delia was already promoted in
a prior session, so the previous handoff's "three pending" was
stale — it was two. Current state: owner + 3 sellers (Delia,
Estafany, Fabienne) have logins to the admin app. Sophia remains
the only one who has actually run a test sale through the new
system.

Pre-existing 404 cluster (THIS SESSION): closed, no code change
needed. Five owner-facing pages — /sales/[id], /products/[id],
/settings/exchange-rates, /settings/store-config, /users/new —
were 404'ing for the owner. Root cause: stale Turbopack dev cache,
NOT a bug in requireOwner() or any guard logic. Diagnosed by
adding console.log probes around requireOwner() in
/users/new/page.tsx — probes printed in order, page rendered 200,
and rebuilding the one file also unblocked all four other routes.
The DEBUG file write itself was reverted; nothing needed committing
for the fix. See "DEV SERVER GOTCHAS" below.

Canonical RBAC spec at `docs/rbac.md`. Source of truth.

== ROADMAP ==

Round 12 — Money Accounts module (small) — NEXT
Round 13 — Settings Receipt tab (small)
Round 14 — Purchases module (substantial; pre-req for Round 18)
    Note: purchase_orders + purchase_order_items already RLS'd.
    Real table names: purchase_orders, purchase_order_items,
    courier_payments, courier_payment_allocations, payment_receipts.
Round 15 — Online Orders (substantial; cutover blocker)
Round 16 — Sale-discount auto-application (design first)
Round 17 — Inventory / stock-movements UI
Round 18 — Cashback / commissions reports
Round 19 — Accounting / transactions module
Round 20 — Real-numbers dashboard

== MIGRATION CUTOVER STATUS ==

Unchanged in substance. DB has frozen snapshot from cutoff: 135 sales
(126 POS + 9 online), all products, all people, etc. Anything entered
in OLD system since cutoff is NOT in new DB. Cutover decision still
pending. POS technically works in new system (proven by Sophia's test
sale). With Delia, Estafany, and Fabienne now logged in, parallel
running is operationally feasible. Online orders still need Round 15
+ delta migration if keeping the old system live for them.

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
11.10. All previously working pages still work under RLS (verified
end of Round 11.10, re-verified after the 404-cluster fix).

== SEARCH ==

Use conversation_search liberally. Useful queries:
  "Gangaloo Round 11.10 RLS"
  "auth_role SECURITY DEFINER"
  "404 cluster Turbopack cache"
  "sale_lot_consumption two-hop join"
  "purchase_orders RLS"
  "confirm_pos_sale SECURITY DEFINER bypass"
  "Round 12 money accounts"

== PICK UP AT ==

Round 12 — Money Accounts module (small confidence-builder before
Round 14 Purchases).

Money accounts is the table of where money sits (cash drawer, bank
account, mobile wallet, etc). Already exists in DB and is RLS'd as
of 11.10 (owner-only). Sales payments and transactions reference
money_account_id.

No spec written yet — first step in Round 12 is a small design pass
covering: schema review, list/form shape, balance computation (sum
from transactions or stored on the row?), and whether to include a
transfer-between-accounts action in this round or defer.
