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

When asking the user to read or write large generated code
blocks, briefly say what the file IS and what they'll do with
it BEFORE the code. The user has said "I do not understand
anything, what do I do with this ts file" when handed code
without context.

DO NOT TRUST `BEGIN/ROLLBACK` in Supabase SQL editor when
state-changing RPCs are involved (esp. with temp tables).
SMOKE-001 from Round 14c.2.3 persisted through a ROLLBACK
and required a separate cleanup pass. For RPC state-change
testing: either accept data will stick (and clean up after
with delete+recompute), or use throwaway test data you don't
mind keeping.

CTE-with-side-effects gotcha: a `WITH created AS (SELECT
public.foo(...))` followed by `SELECT FROM the_written_table`
in the same statement may not see the side effects (snapshot
isolation). Use a temp table instead:
  `CREATE TEMP TABLE _t ON COMMIT DROP AS SELECT public.foo(...) AS x;`

== STATE AS OF END OF LAST SESSION ==

Modules complete and committed: Auth, Dashboard shell, Categories,
Warehouses, People, Products, Settings (hub + Exchange Rates +
Store Config + Receipt), Sales/POS, Users, RBAC, Money Accounts,
Purchases READ (14a), Purchases WRITE (14b), Courier Payments (14c).
All work pushed to origin/master at ff8be28.

== ROUND 14c COMPLETE ==

  14c.1 spec        -- f0def94 at docs/round-14c-courier-payments.md
                       includes "Schema-name corrections" appendix
                       documenting the actual column names that
                       differ from the original spec draft
  14c.2 RPC         -- 7d9ecf3 (create_courier_payment)
                       Later fixed at ff8be28 to set dop_unit_landed_cost
                       explicitly (it is NOT a generated column,
                       contrary to handoff prior assumption)
  14c.3 server action  -- e518e81 (createCourierPayment in actions.ts)
  14c.4 data layer  -- aba4d5b (lib/courier-payments.ts), 4 fetchers
                       Plus listPurchaseOrdersForPicker appended in
                       a15e018.
  14c.5 list page   -- 92de510 (/courier-payments)
  14c.6 detail page -- 5e4e889 (/courier-payments/[id])
  14c.7 new form    -- a15e018 (/courier-payments/new, ~575-line
                       client form with multi-PO allocations grid)
  14c.8 prefill     -- 1798900 ("Add transport" button on PO detail
                       page links to ?prefill_po=<id> on the new
                       form, which seeds the first allocation row)
  14c.9 nav         -- a809f6e (Courier Payments between Purchases
                       and Money Accounts, Receipt icon, OWNER_ONLY)
        actions-bar fix -- 0a38ee7 (removed early-return that
                       hid the actions-bar on terminal-status POs,
                       so Add transport renders on complete/lost/
                       cancelled too — per spec, visible in any
                       status)

All three e2e scenarios from the spec passed:
  S1: single-PO retro attach (caught the generated-column bug)
  S2: multi-PO courier payment across 3 POs (correct rounding)
  S3: edit-by-recreate (cascade delete + replacement payment
      correctly overwrites stale shares)

== IMMEDIATE NEXT STEP ==

Round 15 (Online Orders). Sister-module to POS sales. The write-
side cutover blocker per the roadmap. Realistically multi-session.

Order suggested:
  15.0 spec to disk (docs/round-15-online-orders.md)
  15.1 schema verification + migrations if needed
  15.2 RPCs: create_online_order, mark_received_online,
       mark_dispatched, mark_delivered, mark_cancelled_online
  15.3 server actions wrapping the RPCs
  15.4 data layer lib/online-orders.ts
  15.5 list page
  15.6 detail page
  15.7 new form
  15.8 nav entry + seller-404 + e2e smoke

Before writing the spec, expect to verify column names on the
online_orders table the same way 14c did (don't assume!).
Online orders likely live in `public.sales` with `source='online'`
per the prior handoff, but verify.

== FINDINGS & DECISIONS FROM THIS SESSION ==

(In addition to ones from prior sessions.)

- DOP_UNIT_LANDED_COST IS NOT A GENERATED COLUMN. Prior handoff
  was wrong about this. Only usd_line_total on purchase_order_items
  is generated (expression: qty * usd_unit_cost). Confirmed via
  information_schema.columns is_generated query. Any RPC that
  changes per-unit cost components (base / bank_share / transport)
  MUST write dop_unit_landed_cost explicitly. Round 14b RPCs
  may have the same bug — TO VERIFY when next touching them.

- HEREDOC LINE ENDINGS: PowerShell @'...'@ heredocs paired with
  [System.IO.File]::WriteAllText produce LONE-LF line endings
  (166 LF, 1 CRLF in our 14c RPC file). Any subsequent .Replace()
  patch must use `n separator, NOT `r`n, or the probe returns
  False and the patch silently no-ops. ALWAYS use the probe:
    Write-Host "contains? $($raw.Contains($o))"
  before the .Replace() call. If it prints False, abort and
  re-examine actual whitespace before retrying. Saved an hour
  this session catching three silent failures.

- DOUBLED-QUOTE SNIFF: pattern "''" finds legitimate empty
  strings too (Select-String false positive). For real heredoc
  doubled-quote bugs, use pattern "''''" (four single quotes
  in a row, indicating a doubled '' that should have been
  one '). The empty-string '' is normal TS, not a problem.

- COURIER PAYMENTS DO NOT POST TO public.transactions either.
  Same gap as purchases (noted in prior handoff). Round 19
  Accounting will need to reconcile both.

- COURIER PAYMENTS ARE WRITE-ONCE in v1. No edit/delete UI.
  Mistake correction = SQL delete (cascade drops allocations),
  then re-recompute affected POs manually (NOT triggered by
  cascade), then create replacement via UI. The transport shares
  on affected POs go STALE after the cascade delete until
  something triggers a recompute. Documented as expected behavior
  in 14c spec.

- ACTIONS-BAR GATING: actions-bar.tsx had an early-return that
  hid the entire bar when no status-transition was applicable.
  Added "Add transport" needs to render on terminal-status POs
  (complete/lost/cancelled — the whole point is post-fact
  attachment), so the early return was removed at 0a38ee7.
  Note: status-transition AlertDialogs are gated individually
  via canPay / canReceive / canComplete / canLost / canCancel
  flags, so removing the early return only ever shows buttons
  that have a real action.

- SUPPLIER NAMES: many migrated suppliers have the literal
  string "(unknown)" as their name. The data layer's fallback
  string was also "(unknown)" — coincidentally identical. Not
  a bug, just data hygiene. Worth flagging to user if Round 17
  Inventory ever surfaces supplier names.

== POWERSHELL GOTCHAS (UPDATED) ==

NEW THIS SESSION: HEREDOC LINE-ENDING MISMATCH IN PATCH PROBES.
@'...'@ heredocs written via [IO.File]::WriteAllText with the
no-BOM UTF-8 encoder produce lone-LF line endings. Subsequent
.Replace($old, $new) patches against that file MUST use `n
separators in $old, not `r`n, or the probe silently fails.
Always probe BEFORE the replace:
   Write-Host "contains? $($raw.Contains($old))"
If False, abort.

DIAGNOSTIC: dump line-ending counts:
   $crlf = ([regex]::Matches($raw, "``r``n")).Count
   $lf   = ([regex]::Matches($raw, "(?<!``r)``n")).Count

(Note doubled-backtick in the diagnostic above — single
backtick in actual code.)

KNOWN STILL: PowerShell -LiteralPath needed for paths with
brackets like app\(dashboard)\purchases\[id]\.

KNOWN STILL: PS 5.1's Get-Content -Raw NORMALIZES line endings
to CRLF in memory. Workaround for writes:
  $abs = (Resolve-Path "path").ProviderPath
  $raw = [System.IO.File]::ReadAllText($abs)
  # ... do replacements with `n not `r`n ...
  [System.IO.File]::WriteAllText($abs, $raw,
    [System.Text.UTF8Encoding]::new($false))

== TYPESCRIPT VERIFICATION PATTERN ==

After writing or patching any .ts/.tsx file:
  npx tsc --noEmit 2>&1 | Select-String -Pattern "<filename>" -Context 0,2
Empty output = clean. First run slow (15-60s cold).

== INFRA RECAP ==

SUPABASE_SERVICE_ROLE_KEY in .env.local. Never committed.
Only lib/supabase/admin.ts uses it; has `import 'server-only'`.
ssr client (lib/supabase/server.ts) respects RLS.

Migration files all in db/migrations/. Round 14c additions:
  round-14c-courier-payments-rpc-01-create-courier-payment.sql

NO rollback files for RPCs - CREATE OR REPLACE FUNCTION is
idempotent.

Two PowerShell windows in use:
  Window 1: `npm run dev`, leave running
  Window 2: cd to project, git/file writes/tsc/etc

== TEST DATA STILL IN DB ==

From 14c e2e (left in place — same convention as 14b):
  - E2E-S2 (1 courier payment, 3 allocations across
    PO d91ec4d2, 20433d2b, c6d40b99) -- multi-PO scenario
  - E2E-S3 (1 courier payment, 1 allocation against
    PO 9544f895) -- final state after edit-by-recreate

Plus everything from 14b smoke testing (Test Receive, Test
Complete, Test Cancel, Test Cancel Refund, Test Pay,
Smoke Test 14b5 — see prior handoff).

These are useful as realistic test fixtures and don't interfere
with anything. Cleanup is optional.

== ROADMAP (rounds 15 through 21) ==

15 - Online Orders. Sister to POS sales. WRITE-SIDE CUTOVER
  BLOCKER. NEXT.
16 - Sale-discount auto-application (design first).
17 - Inventory / stock-movements UI. Damage/theft write-off
  (mark_lost is for shipping loss; 17 handles post-receipt
  damage/theft).
18 - Cashback / commissions reports.
19 - Accounting / transactions module. PURCHASES + COURIER
  PAYMENTS do not currently post to public.transactions.
  This module either extends those RPCs to write transaction
  rows, or its reports join across purchase_orders +
  courier_payments + sales directly. Design first.
20 - Real-numbers dashboard. Same data-source caveat as 19.
21 - Spanish UI (i18n). en-GB locale used throughout to avoid
  hydration mismatches; each call site needs flipping to es-DO.
  datetime-local inputs inherit browser locale (Perkins's
  browser is German); Round 21 should explicitly set Spanish.

== SEARCH ==

Use conversation_search liberally. Useful queries:
  "Round 14c create_courier_payment RPC"
  "Round 14c dop_unit_landed_cost generated column bug"
  "Round 14c heredoc line ending lone LF patch probe"
  "Round 14c actions-bar early return gating"
  "Round 14c spec courier payments allocations"
  "Round 14c e2e scenarios single multi recreate"
  "Round 14b mark_lost cost basis recompute"
  "Round 14b create_purchase_order generated column"
  "Supabase SQL editor only last statement output"
  "Supabase BEGIN ROLLBACK unreliable temp table"

== PICK UP AT ==

Round 15 (Online Orders). Start with spec to disk. Verify
schema first — the sales table is hypothesized to be source-
of-truth (source='online' rows) but VERIFY before assuming.

Round 14c is FULLY DONE. No outstanding loose ends. RPC fix
shipped, actions-bar gating fix shipped, all 9 sub-rounds
done, e2e verified for all three spec scenarios. Last
commit pushed: ff8be28.
