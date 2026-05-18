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

PowerShell snippets are preferred over describing file contents
in prose. The user runs them, pastes output, you verify, next
step. Match counts and Select-String spot-checks are good
verification.

Wrap state-changing SQL smoke tests in BEGIN/ROLLBACK so the
DB stays clean. Supabase SQL editor only shows the LAST
statement's output in a multi-statement query - so when chaining
"call RPC then SELECT to verify", expect the SELECT to be the
visible result, or run them as separate transactions.

== STATE AS OF END OF LAST SESSION ==

Modules complete and committed: Auth, Dashboard shell, Categories,
Warehouses, People, Products, Settings (hub + Exchange Rates +
Store Config + Receipt), Sales/POS, Users, RBAC, Money Accounts,
Purchases READ surface (Round 14a).

Round 14b (Purchases write surface): IN PROGRESS

  14b.1 spec        -- f566dcf at docs/round-14b-purchases-write.md
  14b.0 migrations: ALL APPLIED, type system in sync
    a2eb8e2 -- original scaffolding (status enum + usd_discount;
                part 1 enum committed, part 2 failed on view dep)
    fd6d3da -- fix migration: drop view, do column surgery,
                recreate view with usd_discount surfaced
    a6d72a9 -- types(14b.0): PurchaseOrderRow + fetchers add
                usd_discount in lib/purchases-types.ts and
                lib/purchases.ts
    1cde0dd -- db(14b.0.refund): 3 nullable cols on
                purchase_orders: dop_refund_total,
                refund_at_dop, refund_account_id (Q3 amendment)

  14b.2 RPCs (5 of 7 done):
    ebb3842 -- _allocate_supplier_payment (helper, shared math)
    123e3c7 -- mark_paid_supplier (pending -> paid_supplier)
    2344dc8 -- mark_received (paid_supplier|received -> received,
                creates inventory_lots, lot_number = max+1)
    a3c09f8 -- mark_complete (received -> complete)
    4e6adea -- mark_cancelled (pending|paid_supplier -> cancelled,
                optional refund recording)

  STILL PENDING in 14b.2:
    - mark_lost (received -> lost; recompute landed cost on
      surviving unconsumed lots, write off missing units)
    - create_purchase_order (the big atomic RPC: supplier
      upsert + header + lines + optional inline payment
      + optional inline transport)

  14b.3-14b.5: pending after 14b.2 completes.

8 commits ahead of origin/master. NOT YET PUSHED.

== IMMEDIATE NEXT STEP ==

Two options for the very next thing:

Option A: push the 8 unpushed commits first, then continue.
  `git push`
  Cosmetic UTF-8 BOMs on commit subject lines are harmless.

Option B: continue building, push later. Decide based on
  whether you want a checkpoint on the remote before more work.

Then resume Round 14b.2 with mark_lost. After that,
create_purchase_order. Then 14b.3 (the /purchases/new form).

== KEY DECISIONS LOCKED THIS SESSION ==

(Add to the ones already in the spec.)

- Q1 RPC architecture: HYBRID (option C). Single Postgres
  function for each action; shared math lives in PL/pgSQL
  helper (_allocate_supplier_payment). Real atomicity via
  Postgres transactions, no duplication. Same pattern as
  confirm_pos_sale from the sales chain.

- Q3 refund handling: AMENDED THE SPEC. mark_cancelled
  optionally records refund: dop_refund_total, refund_at_dop,
  refund_account_id added as three nullable columns on
  purchase_orders. App enforces "all three or none" rule;
  DB stays permissive. Refund amount NOT capped at
  dop_paid_total - currency drift between payment date and
  refund date is a real edge case.

- Bank fee math: derived inside the function as
  dop_paid_total - (usd_total * exchange_rate). NOT an
  input. User enters what bank actually charged in DOP; the
  function computes the "difference from naive prediction"
  as bank fee. Verified against legacy LOT-1929 single-line
  AND a synthetic two-line case.

- Distribution math: proportional to USD value per line,
  using usd_subtotal (sum of line totals) as the denominator,
  NOT usd_total. Shipping/tax/discount are header
  adjustments that shift dop_paid_total but the proportional
  share across lines is by raw line USD value. Verified
  against an actual two-line Aliafee order screenshot
  (96.78 USD line -> RD$5,981.42 / 143.83 USD line ->
  RD$8,889.32 / RD$14,870.74 total paid - matched exactly).

- New "landed cost" displayed in new system INCLUDES
  transport_share, unlike old system which hid transport
  in a separate column. Intentional improvement: ONE number
  = true cost.

- Lot numbers: max(existing-numeric)+1, sequential within
  one call. Pure SELECT-MAX, no row lock. Race accepted for
  one-owner usage per spec.

- mark_received jsonb input shape:
    [{"line_id": "uuid", "received_qty": numeric}, ...]
  Lines with received_qty = 0 silently skipped (no lot row).
  Whole call refused if NO line has received_qty > 0.
  Overshoot refused: existing-received + this-call <=
  ordered.
  Status guard accepts paid_supplier OR received (allows
  repeated partial-receive flow).

- mark_complete: pure acknowledgment, no inputs beyond order
  id. Per spec, "complete" means all units arrived AND
  transport paid - transport check NOT enforced (transport
  is 14c). User takes responsibility.

- mark_cancelled refund inputs use the typed-scalar approach
  (Q14=A) with "all three or none" enforced by counting nulls.

- Edit-supplier-payment: explicitly DEFERRED (Q4=a). Current
  mark_paid_supplier is strict pending-only. Edit feature
  comes later as a separate edit_supplier_payment RPC reusing
  the same _allocate_supplier_payment helper. Helper stays
  permissive precisely so this future RPC will not need code
  changes to the math.

== STILL TO BUILD IN 14b.2 ==

### mark_lost (next)

Per spec: "missing units written off, per-unit landed cost
recomputes across surviving units." Reached from received state.

Behavior to implement:
  - status guard: received only
  - For each line: lookup ordered qty vs total received qty
  - If received < ordered, the surviving units absorb the
    full line cost: their unit_cost_dop in inventory_lots
    goes UP by ordered/received ratio.
  - ONLY update unconsumed lots (qty_remaining > 0). Lots
    that have already been consumed by sales keep their
    original cost - retro-changing booked sale costs is
    messy and out of scope.
  - Update purchase_order_items.dop_unit_landed_cost to
    match new effective cost.
  - status -> 'lost', completed_at -> now()

Open question for the next session: should mark_lost take
the "loss" per line, or compute it automatically as
(ordered - received)? I lean automatic: any line where
not all units were received has its surviving units'
cost basis recomputed. Simpler API, no chance of bad
inputs.

### create_purchase_order (last RPC, biggest)

Multi-table atomic write. Inputs:
  - supplier name (typed string from combobox)
  - warehouse_id
  - ordered_at, expected_at, notes
  - lines: array of {product_id, qty, usd_unit_cost}
  - usd_shipping, usd_tax, usd_discount
  - optional inline payment: dop_paid_total, exchange_rate,
    official_rate_at_payment, supplier_payment_account_id,
    paid_at_dop
  - optional inline transport: amount_dop_total,
    courier_id, money_account_id, paid_at, description,
    reference

Logic:
  1. Resolve supplier_id: SELECT by name + kind='supplier',
     INSERT with that name if not found. Race accepted
     (one-owner usage).
  2. INSERT purchase_orders header (status='pending', or
     'paid_supplier' if inline payment provided).
  3. INSERT purchase_order_items rows.
  4. If inline payment: call _allocate_supplier_payment
     (which does the header update + line cost allocation
     atomically). This also flips status to 'paid_supplier'.
  5. If inline transport: INSERT courier_payments +
     courier_payment_allocations, then UPDATE
     purchase_order_items.dop_transport_share and recompute
     dop_unit_landed_cost.

Returns the new purchase_order_id so TS can redirect to
/purchases/[id] after submit.

== TYPES-SIDE FOLLOW-UPS WHEN BUILDING TS LAYER ==

When lib/purchases-actions.ts lands (14b.2 TS work, after
all 7 RPCs exist in DB):

- DO NOT add new exports to lib/purchases-actions.ts itself
  beyond the async functions. Anything client components
  consume goes in purchases-types.ts. The actions file
  imports types from purchases-types itself.

- PurchaseOrderRow already has usd_discount (a6d72a9).
  Still needs dop_refund_total, refund_at_dop,
  refund_account_id added when consumed (the migration
  applied them but PurchaseOrderRow does not yet reflect
  them - waiting for TS consumer to surface them).

- PURCHASE_ORDER_COLUMNS in lib/purchases.ts likewise needs
  the three refund columns added when consumed. Detail
  page needs to surface refund info on cancelled orders.

== POWERSHELL HEREDOC + LINE-ENDING GOTCHAS (UPDATED 14b.0) ==

KNOWN: PowerShell @'...'@ heredoc piped to Set-Content EATS
the '<' character when it ends a line. Multi-line generics
must be single-line. Already in the spec.

NEW THIS SESSION: Get-Content -Raw in PS 5.1 NORMALIZES line
endings to CRLF in memory even when the file on disk is
LF-only. Detection like `$le = if ($content -match "`r`n")
{ "`r`n" } else { "`n" }` picks CRLF and then no patches
match against LF files.

WORKAROUND: read files with
  $abs = (Resolve-Path "path").ProviderPath
  $raw = [System.IO.File]::ReadAllText($abs)
  # ... do replacements ...
  [System.IO.File]::WriteAllText($abs, $raw,
    [System.Text.UTF8Encoding]::new($false))

This avoids PowerShell's CRLF translation entirely. Bytes
in = bytes out.

Confirmed via diagnostic regex:
  ([regex]::Matches($raw, "`r`n")).Count        -- CRLF
  ([regex]::Matches($raw, "(?<!`r)`n")).Count   -- lone LF

If both are non-zero, the file is mixed. PS 5.1
Set-Content -Encoding utf8 has no NoBOM option; use
WriteAllText with UTF8Encoding(false) instead.

== SUPABASE SQL SMOKE TESTING PATTERN ==

For RPCs that change state, wrap the test in
BEGIN/ROLLBACK so the DB stays clean. Multi-statement
queries in Supabase SQL editor only show the LAST
statement's output - so for "call function then SELECT to
verify", split into separate transactions or accept that
intermediate SELECTs are invisible.

Smoke test order this session:
  1. Check function registered: pg_proc lookup
  2. Test each RAISE guard in isolation (wrong inputs)
  3. Test success path with hand-computed expected values
  4. ROLLBACK at end

For mark_received and chained RPCs (mark_complete needs the
order to be in 'received' state), set up the precondition
WITHIN the same transaction by chaining the previous RPC
calls before the test, then ROLLBACK.

The migration data has 196 orders, of which 182 have status
mismatches (93%) - migration didn't backfill completed_at on
'complete' rows. Smoke tests pick truly pending orders by
status filter; for tests that need a 'paid_supplier' or
'received' starting state, set up via chained RPC calls in
the same transaction.

Useful test orders found this session:
  e5758b0a-4d7a-42b9-b606-a22fc6b97e28 (pending, $39.57,
    1 line, 1 unit) -- trivial single-line case
  dcb72974-3983-43f5-bb16-df682691a436 (pending, $356.40,
    2 lines: 4u and 1u) -- proportional distribution test

== INFRA RECAP ==

SUPABASE_SERVICE_ROLE_KEY in .env.local. Never committed.
Only lib/supabase/admin.ts uses it; has `import 'server-only'`
at the top. ssr client (lib/supabase/server.ts) respects RLS.

Migration files all in db/migrations/. Pattern this round:
  round-14b-purchases-write.sql                  (original)
  round-14b-purchases-write-rollback.sql         (original rollback)
  round-14b-purchases-write-fix-view.sql         (fix for view)
  round-14b-purchases-refund.sql                 (refund cols)
  round-14b-purchases-refund-rollback.sql        (refund rollback)
  round-14b-purchases-rpcs-01-allocate-supplier-payment.sql
  round-14b-purchases-rpcs-02-mark-paid-supplier.sql
  round-14b-purchases-rpcs-03-mark-received.sql
  round-14b-purchases-rpcs-04-mark-complete.sql
  round-14b-purchases-rpcs-05-mark-cancelled.sql

NO rollback files for the RPCs - CREATE OR REPLACE FUNCTION
is idempotent and re-runnable. If we need to revert one, the
fix is to write a new version with the old behavior.

== ROADMAP (rounds 15 through 21) ==

15 - Online Orders (substantial). Sister to POS sales. Same
  `sales` table, source='online'. Fulfillment workflow:
  paid -> preparing -> shipped -> delivered. Owner-only per
  spec. WRITE-SIDE CUTOVER BLOCKER - comes AFTER 14a/14b/14c,
  not before.

16 - Sale-discount auto-application (design first). Schema
  has bulk_disc, club tier discounts, transfer_discount.
  Unused at sale time. Multiple sensible designs; pick
  before writing code.

17 - Inventory / stock-movements UI. Manual adjustments,
  breakage, transfers, audits. Sellers can read; writes
  owner-only.

18 - Cashback / commissions reports. Needed before paying
  sellers. Cashback report depends on Round 14 Purchases
  data being browsable.

19 - Accounting / transactions module. Includes the deferred
  money-account transfers from Round 12. Wraps payouts,
  transfers, manual entries.

20 - Real-numbers dashboard. The current /dashboard placeholder
  gets real data: revenue, top products, low stock, commissions
  due.

21 - Spanish UI (i18n). Sellers are Dominican; the admin needs
  to be in Spanish before they use it for daily work. Scope:
  UI text only (labels, buttons, headers, toasts) plus date and
  number locale ('en-GB' -> 'es-DO' throughout - the codebase
  explicitly uses 'en-GB' to avoid hydration mismatches, so each
  call site needs flipping). Whole-admin Spanish, not per-user.
  Open question for the round: pick an i18n library (next-intl
  vs react-intl, leaning next-intl as App-Router-native) with
  an eye toward reusing the same approach in the customer-facing
  store later. Don't lock into something admin-only.
  Practical urgency: sellers already have logins (Sophia rang
  a test sale). The deadline is "before sellers use the admin
  daily" - could move ahead of Round 20 if cutover timing
  pressures.

== SEARCH ==

Use conversation_search liberally. Useful queries:
  "Round 14b mark_paid_supplier mark_received"
  "Round 14b _allocate_supplier_payment math"
  "Round 14b mark_cancelled refund columns"
  "Round 14b lot_number generation max"
  "Round 14b RPC architecture hybrid pl/pgsql"
  "Round 14b create_purchase_order spec"
  "PowerShell Get-Content Raw CRLF normalization"
  "Round 14a.2 list page split client types"

== PICK UP AT ==

Round 14b.2 -- write mark_lost RPC next.

After mark_lost, write create_purchase_order (the big
atomic RPC). After that, the TS layer in
lib/purchases-actions.ts wraps all 7 RPCs as server actions
with requireOwner().

Then 14b.3 (/purchases/new form), 14b.4 (detail page
action buttons), 14b.5 (end-to-end smoke).

8 unpushed commits sitting locally:
  4e6adea db(14b.2): mark_cancelled
  a3c09f8 db(14b.2): mark_complete
  2344dc8 db(14b.2): mark_received
  123e3c7 db(14b.2): mark_paid_supplier
  ebb3842 db(14b.2): _allocate_supplier_payment
  1cde0dd db(14b.0.refund): add refund tracking columns
  a6d72a9 types(14b.0): add usd_discount
  fd6d3da db(14b.0): fix - drop dependent view

Next session SHOULD push first to checkpoint the work.
