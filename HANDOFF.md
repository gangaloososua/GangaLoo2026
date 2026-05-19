Continuing Gangaloo admin build (Next.js 16 + Turbopack + Netlify +
shadcn/ui + Supabase SSR + Tailwind v4). Project:
`C:\Users\Perkins\Documents\Apps\GangaLoo New 05-26\gangaloo-admin\`.
Migration SQLs in admin repo at `db\migrations\`.
Remote: https://github.com/gangaloososua/GangaLoo2026.git (private).

== INSTRUCTIONS TO THE NEXT SESSION ==

Go step by step. Give ONE PowerShell command (or one SQL paste,
or one git command) per response. Wait for the user's output
before giving the next step. The user prefers this rhythm over
batched instructions. Don't bundle "do X then Y and paste Z" -
do X, wait, then Y, wait, then Z.

When asking the user to write large generated code blocks, briefly
say what the file IS and what they'll do with it BEFORE the code.
The user has said "I do not understand anything, what do I do with
this ts file" when handed code without context.

The user has tap-pickable options enabled (ask_user_input_v0) and
prefers those for choices. Avoid jargon without explanation — the
user is the business owner, not the dev. When they say "i do not
understand", explain in plain language and re-offer.

NEVER use the "use the option that picks for me" pattern when the
choice is technical and the user has explicitly said they don't
understand. Explain first, then ask. The exception is when they
say "choose for me, take the most accurate" — then pick and
justify briefly.

DO NOT TRUST `BEGIN/ROLLBACK` in Supabase SQL editor when
state-changing RPCs are involved (esp. with temp tables).
SMOKE-001 from Round 14c.2.3 persisted through a ROLLBACK
and required a separate cleanup pass. CTE-with-side-effects
gotcha: `WITH created AS (SELECT public.foo(...))` followed by
`SELECT FROM the_written_table` may not see the side effects
(snapshot isolation). Use a temp table instead.

NEW THIS SESSION (Round 15.2.3 smoke): Supabase SQL editor WRAPS
EVERY "RUN" IN A TRANSACTION. If you paste two statements and the
second raises an exception, the first rolls back too. We lost
ONL-0002 this way during a bundled "create then attempt-bad-dispatch"
test. RULE: when smoke-testing state-changing RPCs, only put ONE
state-changing statement per Run. Verification SELECTs in the
same paste are fine (they don't error). Negative-test cases must
be in their OWN Run, separate from any preceding state-changers.

NOTE: Sequences DO NOT rollback (they are non-transactional by
design). The sales_onl_seq was already at 2 before the rollback;
the next online order minted was ONL-0003, not ONL-0002.

ALSO NEW: PowerShell pasted heredocs sometimes leave the prompt
stuck at `>>` waiting for a missing close-bracket. Press Ctrl+C
to escape, not Enter (which feeds more empty lines to the open
expression). If still stuck, close and reopen the window.

== STATE AS OF END OF LAST SESSION ==

Modules complete and committed: Auth, Dashboard shell, Categories,
Warehouses, People, Products, Settings (hub + Exchange Rates +
Store Config + Receipt), Sales/POS, Users, RBAC, Money Accounts,
Purchases READ (14a), Purchases WRITE (14b), Courier Payments (14c).
Round 15 (Online Orders) IN PROGRESS — sub-rounds 15.0 through 15.3
DONE. All pushed to origin/master at 71a3750.

== ROUND 15 PROGRESS ==

  15.0 spec               -- d438cb7 at docs/round-15-online-orders.md
                             Also bundled 3ef286e: 14c schema-name
                             corrections appendix that was sitting
                             unstaged from prior session.
  15.1 schema migration   -- 4aebeb1
                             ALTER TABLE sales ADD dispatched_at,
                             delivered_at (both timestamptz, nullable).
                             Migration applied to live DB and verified.
  15.2.1 create_online_order RPC  -- d333a4e
                             ~250 lines. Hardcodes source='online',
                             tracking_status='received'. ONL-NNNN
                             invoice format from new sales_onl_seq
                             (4-digit zero-padded). RBAC owner+admin
                             only. STRICT no-oversell guard
                             (insufficient_stock raise). Distributor
                             commission resolution from
                             warehouses.distributor_id +
                             distributor_commission_percent, with
                             profiles.commission_percent_override.
                             paid_cents set manually (no trigger on
                             sale_payments — confirmed via
                             information_schema.triggers).
                             Smoke: ONL-0001 (Montellano warehouse,
                             distributor=c23c1b44 at 5%, 1 unit
                             Ondulado 12a at 100000 cents). All
                             side effects verified.
  15.2.2 mark_dispatched + mark_delivered  -- 952707c
                             Bundled into one migration file (both
                             tiny, ~30 lines each, tightly coupled
                             by state). Sourcecode lives at
                             db/migrations/round-15-online-orders-
                             02-mark-dispatched-delivered.sql.
                             RBAC owner+admin; mark_dispatched
                             rejects pickup/in_store. Smoke: ONL-0001
                             received -> dispatched (with tracking
                             "TRACK-SMOKE-15.2.2-A") -> delivered.
                             Plus 5 negative-case smokes (POS sale,
                             already-delivered, pickup order all
                             correctly rejected with code 22023).
  15.2.3 mark_cancelled_online + SCHEMA FIX  -- bed3b43
                             ~160 lines RPC.
                             Atomic transaction with five effects:
                             stock reversal (qty restore + return_in
                             stock_movement), payment reversal
                             (compensating negative sale_payments
                             rows), commission void, sale row reset,
                             refund metadata stamped. Idempotency
                             guard on sale_status='cancelled'.
                             SCHEMA FIX BUNDLED: relaxed
                             sale_payments_amount_cents_check from
                             (amount_cents > 0) to (amount_cents <> 0).
                             Required to permit compensating negative
                             rows. Discovered during smoke testing.
                             Smoke: S2 (cancel unpaid pickup, ONL-0003,
                             no compensating payment needed),
                             S3 (cancel paid delivery, ONL-0004, +100000
                             original + -100000 compensation written,
                             payments_sum=0). Plus idempotency
                             rejection on second-cancel-attempt.
  15.3 server actions     -- 71a3750
                             app/(dashboard)/online-orders/actions.ts
                             ~240 lines, 4 actions wrapping the 4 RPCs.
                             Uses requireRole(['owner','admin'] as const)
                             from @/lib/auth/guard.
                             Return shape: { ok: true, ... } | { ok: false,
                             error: string }. Camel/snake-case mapping
                             between TS inputs and RPC payload params.
                             revalidatePath('/online-orders') and the
                             detail page after every action.
                             TypeScript check clean: 0 errors mentioning
                             online-orders.

== IMMEDIATE NEXT STEP ==

Round 15.4 (data layer). Sister to lib/courier-payments.ts and
lib/sales.ts. ~300 lines expected. Three or four fetcher functions:

  listOnlineOrders(filters)
  getOnlineOrderById(id)  -- with items, lot consumption, payments,
                              commissions, side panel data
  listOnlineOrdersByStatus(tracking_status)  -- optional, may merge
                              into listOnlineOrders with filter param

Modeled on lib/courier-payments.ts. ~1500 LOC at lib/sales.ts
also relevant (online orders share sub-tables with POS sales).
File goes at lib/online-orders.ts. No types file separation yet
(matches courier-payments convention; consider extracting if it
grows past 400 lines).

After 15.4:
  15.5 - list page  /online-orders
  15.6 - detail page  /online-orders/[id]
  15.7 - new form  /online-orders/new
  15.8 - nav entry + RBAC + e2e

== ROUND 15 DESIGN DECISIONS (FROM 15.0 SPEC) ==

Confirm or revisit at start of next session; user may want to revise.

  - Stock LOCKS at order creation (not at dispatch). Rationale:
    qty=1 items frequently. Only mark_cancelled_online releases.
  - ONL-NNNN invoice format, sales_onl_seq sequence. First was
    ONL-0001. Currently sequence at 4 (ONL-0001, ONL-0003, ONL-0004
    minted; ONL-0002 rolled back).
  - No couriers on outgoing online orders. Couriers are
    inbound-only (Round 14c). Online dispatch uses optional
    free-form tracking_number text field, no FK.
  - Inter-warehouse pickup fee = shipping_cents on the sale.
    Total_cents (generated col) includes it.
  - Cancel-when-paid writes compensating sale_payments rows
    (negative amount_cents). REQUIRED the schema fix in 15.2.3.
  - mark_received_online deferred until public shop integrates
    (creation IS receipt in v1).

== TEST DATA STILL IN DB ==

From 15.2 smokes (intentionally left, per project convention):

  ONL-0001 (c45011ba-f739-4608-acac-ac48f3aacf6d)
    Delivered, fully traced. Source/fulfillment = 2-Montellano.
    Product: Ondulado 12a, 1 unit, 100000 cents, unpaid.
    Verifies: full lifecycle received -> dispatched -> delivered.
  ONL-0003 (7a8da3fb-953f-4766-8dc2-3f045c207a78)
    Cancelled (was unpaid pickup). Source/fulfillment = 2-Montellano.
    Same product. Stock returned to lot. Commissions voided.
    Verifies: cancel-unpaid path.
  ONL-0004 (525169a0-369a-4ac4-a019-e42bd7143b89)
    Cancelled (was paid delivery, transfer to Banreservas Perkins).
    Same warehouse + product. 2 payment rows: +100000 original
    plus -100000 compensation with reference='CANCEL <id>'.
    Verifies: cancel-paid path with payment reversal.

8 legacy migrated online rows untouched (all status=paid, mostly
fulfillment=delivery, tracking_status=delivered with one legacy
"pending" — leave alone).

Plus 14b smoke fixtures and 14c smoke fixtures from prior sessions.

== KEY VERIFIED FACTS ==

  - public.sales is source of truth. NO separate online_orders table.
    source='online' rows are online orders.
  - tracking_status is TEXT, not an enum. v1 vocabulary:
    received | dispatched | delivered | cancelled
    Legacy: pending (one row, do not generate from v1).
  - sale_status enum: draft | confirmed | paid | partially_paid |
    refunded | cancelled. Drives payment lifecycle. Cancel is the
    only RPC that flips it to cancelled.
  - NO trigger on sale_payments. paid_cents is NOT self-maintained
    by inserts; the RPC must update it manually. Verified via
    information_schema.triggers (zero rows).
  - sale_payments_amount_cents_check is NOW (amount_cents <> 0)
    (was > 0). Permits compensating negative rows.
  - warehouses.distributor_id (uuid, nullable) and
    warehouses.distributor_commission_percent (numeric, default 0).
    profiles.commission_percent_override (nullable numeric) overrides
    the warehouse default for both sellers and distributors.

== KEY FILES TOUCHED THIS SESSION ==

  docs/round-15-online-orders.md             (15.0 spec)
  docs/round-14c-courier-payments.md         (appendix retro-commit)
  db/migrations/round-15-online-orders-01-schema.sql
  db/migrations/round-15-online-orders-02-create-online-order.sql
  db/migrations/round-15-online-orders-02-mark-dispatched-delivered.sql
  db/migrations/round-15-online-orders-02-mark-cancelled-online.sql
  db/migrations/round-15-online-orders-02-relax-sale-payments-check.sql
  app/(dashboard)/online-orders/actions.ts   (15.3 server actions)

== TYPESCRIPT VERIFICATION PATTERN ==

After writing or patching any .ts/.tsx file:
  npx tsc --noEmit 2>&1 | Select-String -Pattern "<filename>" -Context 0,2
Empty output = clean. First run slow (15-60s cold).

KNOWN PRE-EXISTING TS ERRORS: 4 errors in app/bounce/page.tsx
(unmatched JSX bracket, last touched commit 7839c9a from Round 11).
NOT introduced by Round 15. Filed; not fixed this round. Future
session should fix if it ever causes runtime issues — currently
silent because tsc errors but Next.js still serves the page.

== POWERSHELL GOTCHAS (UPDATED) ==

NEW THIS SESSION: prompt stuck at `>>` after pasted heredoc.
Means PowerShell still thinks an expression is open (e.g. a
missing close-paren or unclosed quote). Press Ctrl+C to escape.
Pressing Enter just feeds another empty line to the open
expression and prompt stays stuck. If Ctrl+C also fails,
close window and reopen.

NEW THIS SESSION: Set-Location does NOT update
[System.IO.Directory]::SetCurrentDirectory (process-level cwd),
which is what [System.IO.Path]::GetFullPath('relative-path')
resolves against. Result: WriteAllText('docs\foo.md') wrote to
C:\Users\Perkins\docs\foo.md instead of project. Fix: use
Join-Path $PWD.ProviderPath 'relative-path' OR explicitly call
[System.IO.Directory]::SetCurrentDirectory($PWD.ProviderPath)
at the start of any block that uses GetFullPath. The preamble
pattern used reliably:
  $ErrorActionPreference = 'Stop'
  Set-Location -LiteralPath $PWD.ProviderPath
  [System.IO.Directory]::SetCurrentDirectory($PWD.ProviderPath)

KNOWN: PowerShell `@'...'@` heredocs via [IO.File]::WriteAllText
with the no-BOM UTF-8 encoder produce LONE-LF line endings.
Any subsequent .Replace($old, $new) patches MUST use `n
separators in $old, not `r`n. Always probe BEFORE the replace:
  Write-Host "contains? $($raw.Contains($old))"
If False, abort.

KNOWN: PS 5.1's Get-Content -Raw NORMALIZES line endings to CRLF
in memory. For writes:
  $abs = (Resolve-Path "path").ProviderPath
  $raw = [System.IO.File]::ReadAllText($abs)
  # ... do replacements with `n not `r`n ...
  [System.IO.File]::WriteAllText($abs, $raw,
    [System.Text.UTF8Encoding]::new($false))

KNOWN: -LiteralPath needed for paths with brackets like
app\(dashboard)\online-orders\.

== INFRA RECAP ==

Two PowerShell windows in use:
  Window 1: `npm run dev`, leave running
  Window 2: cd to project, git/file writes/tsc/etc

SUPABASE_SERVICE_ROLE_KEY in .env.local. Never committed.
Only lib/supabase/admin.ts uses it; has `import 'server-only'`.
ssr client (lib/supabase/server.ts) respects RLS.

Auth guard helpers at lib/auth/guard.ts:
  requireAdminCaller()  -> CallerProfile (any non-customer)
  requireRole(allowed)  -> generic role allowlist
  requireOwner()        -> sugar for OWNER_ROLES

For Round 15 we use requireRole(['owner','admin'] as const).

== JWT IMPERSONATION FOR RPC SMOKES ==

The Supabase SQL editor doesn't authenticate by default —
auth.uid() is NULL — so SECURITY DEFINER RPCs with RBAC gates
will reject. To smoke an RPC that calls auth.uid():

  SET LOCAL request.jwt.claims =
    '{"sub":"<auth_user_id>","role":"authenticated"}';
  SELECT public.your_rpc(...);

User's auth_user_id: 3f135a05-76fb-4859-9009-3a0b606815c1
User's profile id:    17b11149-5480-4716-8a55-5f7905c94543

SET LOCAL is per-transaction; the JWT and the SELECT must be in
the same Run.

== SEARCH ==

Use conversation_search liberally. Useful queries:
  "Round 15 online orders spec"
  "create_online_order RPC distributor commission"
  "mark_cancelled_online compensating sale_payments"
  "sale_payments_amount_cents_check relaxed"
  "Supabase SQL editor transaction rollback"
  "tracking_status text not enum"
  "sales_onl_seq invoice ONL-NNNN"
  "PowerShell heredoc lone-LF line ending"
  "JWT impersonation SET LOCAL request jwt claims"
  "Round 14c create_courier_payment RPC"

== PICK UP AT ==

Round 15.4 (data layer). Open the spec at docs/round-15-online-orders.md
(section 10) for the file layout. Model after lib/courier-payments.ts.
Verify column names against information_schema before writing fetchers
(same convention as 14c).

Round 15.3 is FULLY DONE. All 4 server actions written, type-check
clean. Last commit pushed: 71a3750.