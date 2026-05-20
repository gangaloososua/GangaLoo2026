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
For files over ~200 lines, deliver as a download via present_files
rather than inline; user copies into project via Move-Item.

The user has tap-pickable options enabled (ask_user_input_v0) and
prefers those for choices. Avoid jargon without explanation - the
user is the business owner, not the dev. When they say "i do not
understand", explain in plain language and re-offer.

NEVER use the "use the option that picks for me" pattern when the
choice is technical and the user has explicitly said they don't
understand. Explain first, then ask. The exception is when they
say "choose for me, take the most accurate" - then pick and
justify briefly. When using ask_user_input_v0 for a genuinely
technical choice, consider adding an "explain first" option.

DO NOT TRUST `BEGIN/ROLLBACK` in Supabase SQL editor when
state-changing RPCs are involved (esp. with temp tables).
Supabase SQL editor WRAPS EVERY "RUN" IN A TRANSACTION; if you
paste two statements and the second raises an exception, the
first rolls back too. When smoke-testing state-changing RPCs,
only put ONE state-changing statement per Run. Verification
SELECTs in the same paste are fine. Negative-test cases must
be in their OWN Run, separate from any preceding state-changers.

NOTE: Sequences DO NOT rollback (non-transactional by design).

NOTE: The Supabase SQL editor only DISPLAYS the LAST result set
when a Run contains multiple SELECTs. To see each result, run
SELECTs one at a time (or combine into a single SELECT).

== CRITICAL: TYPE-CHECKING - NOW CLEAN *AND* GUARDED ==

History: app/bounce/page.tsx had a malformed <a> tag (a PARSE
error) from Round 11. TypeScript SUPPRESSES ALL semantic/type
errors project-wide when any file has unrecoverable syntax errors.
So every "tsc clean" from Round 11 to 17 only ever meant "no NEW
syntax errors" - real type-checking was OFF for ~6 rounds. The
bounce fix (commit f6ef24c) restored it and surfaced 26 latent
type errors.

ROUND 18 (this session) FIXED ALL 26 and installed a guard.
tsc now reports a CONFIRMED-LIVE zero (verified with a deliberate
probe line that DID produce an error - tsc is genuinely checking,
not silently passing).

NEW WORKFLOW - THE COMMIT GUARD (installed Round 18.5):
  - package.json now has a script: "typecheck": "tsc --noEmit".
    Run it any time with `npm run typecheck`.
  - .git/hooks/pre-commit runs `npm run typecheck` before EVERY
    commit and BLOCKS the commit (exit 1) on any type error.
    Tested in BOTH directions this session: blocks broken, allows
    clean.
  - ESCAPE HATCH: `git commit --no-verify` bypasses the hook for
    deliberate work-in-progress commits.
  - The hook is a /bin/sh script written with LF line endings
    (Git runs hooks under Git Bash, NOT PowerShell; CRLF would
    break it with a `\r` error). If you ever rewrite it from
    PowerShell, force LF via
    [System.IO.File]::WriteAllText(path, ($lines -join "`n")+"`n",
      [System.Text.UTF8Encoding]::new($false)).
  - The hook lives in .git/hooks/ which is LOCAL to this machine,
    NOT tracked in the repo. A fresh clone elsewhere won't have it;
    re-create it there if needed.

LESSON (still true): "tsc clean" is only trustworthy if tsc is
actually type-checking. If a deliberately-broken probe line
(`const __probe__: number = 'x'`) does NOT produce an error, tsc
is not checking that file - hunt for a syntax error elsewhere
poisoning the run. The guard makes a masked state much harder to
reach silently, but the probe is still the definitive check.

== LOOSE END FROM ROUND 18 (low priority) ==

The 5 action functions whose result type became `Ok<object>`
(setRuleActive, deleteRule in discount-rules/actions.ts;
markDispatched, markDelivered, cancel in online-orders/actions.ts)
still carry a `return { ok: true } as const`. The `as const` was an
EARLIER attempt that looked like it worked but did NOT fix the type
error (the real fix was Ok<Record<string,never>> -> Ok<object> on
the result-type aliases). The `as const` is now harmless dead
weight. A future tidy-up can drop those 5 `as const`s. Not urgent;
tree is clean and committed.

== STATE AS OF END OF LAST SESSION ==

Modules complete and committed: Auth, Dashboard shell, Categories,
Warehouses, People, Products, Settings (hub + Exchange Rates +
Store Config + Receipt), Sales/POS, Users, RBAC, Money Accounts,
Purchases READ (14a), Purchases WRITE (14b), Courier Payments (14c),
ONLINE ORDERS (Round 15 FULL), SALE-DISCOUNT ENGINE Round 16 FULL
(customer_override), SALE-DISCOUNT ENGINE Round 17 FULL (club_tier),
TSC CLEANUP + GUARD (Round 18 FULL).

Round 18 (tsc cleanup + guard) COMPLETE - sub-rounds 18.1-18.5.
tsc baseline is now 0 errors, confirmed live, guarded at commit.
Last commit 470bbdf on origin/master.

Commits this session (Round 18):
  470bbdf  Round 18: tsc cleanup (26 -> 0) + pre-commit typecheck guard

Round 18 detail (all in commit 470bbdf):
  18.1  PurchaseStatus union was STALE - added 'cancelled' and
        'lost' (lib/purchases-types.ts). They were real statuses:
        markCancelled/markLost actions exist and call mark_cancelled
        / mark_lost RPCs, wired to UI buttons. NOT dead branches.
        This also auto-cleared the purchases/[id]/page.tsx status
        comparison errors (88/94/215).
  18.1  actions-bar.tsx imported nonexistent 'LotRow' - repointed to
        'LotTrailEntry' (the real return element of
        getLotTrailForOrder: Map<string, LotTrailEntry[]>) AND fixed
        a real field bug: l.qty_received -> l.lot.qty_received
        (qty_received is nested under .lot in LotTrailEntry).
  18.2  5 action result-type mismatches. Cause: Ok<T> = {ok:true} & T;
        with T = Record<string,never> the intersection demands
        "has ok:true AND has zero properties" - impossible to satisfy.
        Fix: changed those 5 result-type aliases from
        Ok<Record<string, never>> to Ok<object> (so {ok:true} & object
        accepts {ok:true}). Payload-carrying results like Ok<{ruleId}>
        were never affected. (Did NOT touch the shared Ok<> helper -
        it's duplicated in both files and serves the working results.)
  18.2  6th TS2322 was a DIFFERENT bug: courier-payments/new/page.tsx
        passed a lib/sales MoneyAccount[] to a form expecting a
        lib/money-accounts MoneyAccount[] (two same-named types).
        The form only reads a.id/a.name, so fix was repointing the
        FORM's import (new-courier-payment-form.tsx) to the lighter
        lib/sales MoneyAccount.
  18.3  9 GenericStringError / ParserError casts (the known Supabase
        dynamic-query typing quirk - runtime-harmless, shipped many
        rounds). Routed through `unknown`:
          lib/purchases.ts (2x as unknown as RawPurchaseOrder[])
          lib/discount-rules.ts (1x as unknown as RawRule[])
          lib/online-orders.ts (5x: RawSaleListRow[], RawSaleDetailRow,
            RawSaleItem[], RawSalePayment[], RawCommission[])
          lib/money-accounts.ts (2 sites, 6 errors: spreads of rows
            inferred as GenericStringError; typed the source via
            `as unknown as MoneyAccount` before spreading - site 2
            introduces a `const row` for clarity)
          app/(dashboard)/products/[id]/page.tsx (1x ParserError -
            caused by a CONDITIONAL select string, so the typed client
            can't statically parse it; `as unknown as {...}` is the
            honest fix - the select SQL itself is valid)
  18.4  Confirmed tsc = 0, raw output empty, probe-verified live.
  18.5  Installed npm typecheck script + blocking pre-commit hook;
        tested both directions; committed; pushed.

== SALE-DISCOUNT ENGINE DESIGN DECISIONS (LOCKED) ==

CRITICAL - drives all rule-kind rounds (16-21).

  Scope: ALL 5 rule kinds (customer_override, club_tier, bulk,
    promotion, logistics_surcharge), one kind per round.
  Stacking: MULTIPLICATIVE (compound; never exceeds 100%).
  Cap: 30% effective max per line (running factor floored at 0.70).
  Stack order (audit-row order): by KIND first, then priority DESC,
    then created_at ASC. Current kind order: club_tier (0),
    customer_override (1). Future kinds slot into KIND_SORT_KEY
    (TS) and the SQL CASE WHEN. (club_tier stacks before
    customer_override.)
  Manual override: PER-LINE (silences auto only on that line).
    MANUAL WINS when seller types in the discount field; typing 0
    restores auto.
  Audit: PER APPLIED RULE in sale_discount_applications. Also
    per-line manual override (is_manual=true) and per-sale-level
    order discount (sale_id, is_manual=true).
  Engine: SHARED POS + online (same rules feed both forms).
  Application: AT CART-ADD (live preview).
  Club-tier model: MODEL A - 'none' tier = not yet enrolled, gets
    NO tier discount. Admin builder blocks 'none'; the resolver
    guards it independently (v_customer_tier <> 'none').

== DUAL RESOLVERS - KEEP IN LOCK-STEP (CRITICAL FOR 19-21) ==

  SQL: public.resolve_line_discounts
    Latest: db/migrations/round-17-club-tier-01-resolver.sql
    (prior: 16.2 customer_override only). STABLE SECURITY DEFINER.
    Handles customer_override + club_tier. NOTE: the create-sale
    RPCs do NOT call this function - they trust the cart's
    breakdown for audit contents (16.6 design). This function is
    available for reports / future server-side preview.
  TS: lib/discount-rules-resolver.ts
    Cart-time live preview, called from both forms. MIRRORS the SQL
    algorithm exactly. Header carries a LOCK-STEP warning.
  When Rounds 19-21 add a new rule kind, BOTH FILES change together,
  PLUS the KIND_SORT_KEY map (TS) and the SQL ORDER BY CASE must
  stay aligned. The TS resolver's input now includes customerId,
  customerClubTier (string | null); future kinds may need more
  input fields (bulk needs qty - already passed; promotion needs
  category/date - date already passed, category via product lookup;
  logistics_surcharge is order-level, a DIFFERENT code path).

== HOW A NEW RULE KIND GETS ADDED (PATTERN FROM 16 + 17) ==

Round 17 was the template. For each remaining kind (bulk, promotion,
logistics_surcharge):

  1. Schema: CHECK the discount_rules_shape_check already covers it
     (it covers ALL 5 kinds as of 16.1 - verify with
     pg_get_constraintdef). Likely NO schema migration needed.
  2. SQL resolver: CREATE OR REPLACE resolve_line_discounts, add the
     new kind's candidate-matching branch + its KIND sort position.
  3. TS resolver: mirror the branch + KIND_SORT_KEY entry. Add any
     new input field the kind needs.
  4. Forms: pass any new input field to the 3 resolveLineDiscount
     calls in BOTH new-sale-form.tsx and new-online-order-form.tsx.
     (bulk needs nothing new - qty already passed. promotion needs
     the product's category - may need a lookup. logistics_surcharge
     is order-level - likely a separate resolver, not per-line.)
  5. Admin UI: add a RULE_KINDS entry in
     app/(dashboard)/discount-rules/new/page.tsx + a subroute
     /discount-rules/new/<kind>/page.tsx + a new-<kind>-form.tsx
     + a create<Kind>Rule action.
  6. tsc (now meaningful AND guarded), browser smoke, commit, push.
     The pre-commit hook will run tsc for you - if it blocks, the
     error is almost certainly yours (baseline is 0 now).

NOTE: logistics_surcharge is the odd one - it's an ORDER-LEVEL
surcharge (delta_cents, positive), not a per-line percent discount.
It will NOT fit the per-line resolver cleanly. Design first when you
reach it (Round 21).

== ROADMAP ==

16 - Sale-discount engine: customer_override (DONE)
17 - Sale-discount engine: club_tier (DONE)
18 - TSC cleanup (26 -> 0) + commit guard (DONE)
19 - Sale-discount engine: bulk (qty threshold)  <-- NEXT
20 - Sale-discount engine: promotion (time-bound + category scope)
21 - Sale-discount engine: logistics_surcharge (order-level; design
     first - different code path from per-line discounts)
22 - Inventory / stock-movements UI [damage/theft write-off note
     from the original plan]
23 - Cashback / commissions reports
24 - Accounting / transactions module [data-source caveat - design
     first; PURCHASES + COURIER PAYMENTS don't post to
     public.transactions; join-vs-extend unresolved]
25 - Real-numbers dashboard [same data-source caveat as 24]
26 - Spanish UI (i18n) - en-GB used throughout to avoid hydration
     mismatches; flip each call site to es-DO. datetime-local inputs
     inherit browser locale (Perkins's browser is German); set
     Spanish explicitly. Sellers Delia, Estafany, Fabienne have
     logins; Sophia ran a test sale. If sellers go live before the
     discount engine finishes, jump i18n ahead.

== IMMEDIATE NEXT STEP ==

Round 19 - bulk discount kind (qty threshold). Use the rule-kind
pattern above. The type net is now QUIET (baseline 0) and GUARDED,
so "is this error mine?" is easy to answer each step.

  19.0 Verify discount_rules_shape_check covers 'bulk' already
       (pg_get_constraintdef - it should, per 16.1). Confirm which
       columns the bulk kind requires (likely a qty threshold +
       delta_percent). Read the SQL resolver
       (round-17-club-tier-01-resolver.sql) and lib/discount-rules-
       resolver.ts side by side FIRST to see exactly where the new
       branch + KIND_SORT_KEY slot in.
  19.1 SQL resolver: add bulk branch + KIND position. CREATE OR
       REPLACE. Smoke it (no JWT needed - no auth gate; see below).
  19.2 TS resolver: mirror the branch + KIND_SORT_KEY entry. qty is
       already passed to the resolver, so likely no new form input.
  19.3 Admin UI: RULE_KINDS entry + /new/bulk/page.tsx +
       new-bulk-form.tsx + createBulkRule action.
  19.4 tsc (guard runs it), browser smoke, commit, push.

== TYPESCRIPT VERIFICATION PATTERN ==

Baseline is now 0. Capture FULL output + total count, not a
filtered view (a filtered view is what hid the masked state).

  npx tsc --noEmit 2>&1 | Out-String | Set-Content -LiteralPath "_tsc_full.txt" -Encoding utf8
  Write-Host "=== total error count ==="
  (Select-String -LiteralPath "_tsc_full.txt" -Pattern "error TS").Count
  Write-Host "=== by error code ==="
  Select-String -LiteralPath "_tsc_full.txt" -Pattern "error (TS\d+)" | ForEach-Object { $_.Matches[0].Groups[1].Value } | Group-Object | Sort-Object Count -Descending | Format-Table Count, Name -AutoSize

If your change adds errors, the total rises above 0 and your files
appear. Quicker: just `npm run typecheck` (same thing, exits non-zero
on any error). The pre-commit hook runs this automatically.

SANITY PROBE (if you suspect tsc isn't really checking a file): add
`const __probe__: number = 'x'` to it and re-run. If no error
appears, tsc is not checking that file - hunt for a syntax error
poisoning the run. ALWAYS remove the probe after.

_tsc_*.txt is gitignored. Scratch files won't be committed.

== POWERSHELL GOTCHAS ==

LINE ENDINGS matter for str_replace probes. Files Claude wrote via
create_file (downloaded + Move-Item'd) are LF. Files written by
PowerShell round-trips, or originally Windows-checked-in, are CRLF.
PowerShell here-string `r`n is CRLF. RULE: when patching a file
Claude generated this/last session, probe with `n. When patching an
older file, probe with `r`n. If a probe returns False, TRY THE OTHER
before abandoning. When in doubt, match on a single line WITHOUT
surrounding newlines. For multi-line probes that might be either,
probe LF first then fall back to CRLF in the same script (done this
session for the money-accounts spread fix).

ALL-OR-NOTHING MULTI-EDIT: probe N exact strings, print found?/True
for each, only write if ALL present. Used repeatedly this session;
very safe. For single-string edits, probe Contains() first, abort
if not found.

ONE-LINER str_replace via .NET (preserves LF, no BOM):
  $abs = (Resolve-Path -LiteralPath "path").ProviderPath
  $raw = [System.IO.File]::ReadAllText($abs)
  $old = "exact string"; $new = "replacement"
  Write-Host "found? $($raw.Contains($old))"
  if ($raw.Contains($old)) {
    [System.IO.File]::WriteAllText($abs, $raw.Replace($old,$new),
      [System.Text.UTF8Encoding]::new($false))
    Write-Host "wrote"
  } else { Write-Host "ABORT" }

COUNT occurrences before replace (e.g. when you expect exactly N):
  ([regex]::Matches($raw, [regex]::Escape($old))).Count

SQL into Supabase via clipboard:
  Get-Content -LiteralPath "path.sql" -Raw | Set-Clipboard
Then CLEAR the editor first, paste, Run (paste appends).

MULTI-FILE move + mkdir (semicolon-chained single line):
  $dl = "$env:USERPROFILE\Downloads"; New-Item -ItemType Directory -Force -Path "app\(dashboard)\x\sub" | Out-Null; Move-Item -LiteralPath "$dl\a.tsx" -Destination "app\(dashboard)\x\sub\page.tsx" -Force; Write-Host "done"

KNOWN: prompt stuck at >> after a pasted block. Ctrl+C to escape
(NOT Enter). If still stuck, close + reopen the window.

KNOWN: Set-Location does NOT update process cwd for
[System.IO.Path]::GetFullPath. Use Resolve-Path -LiteralPath then
.ProviderPath (used everywhere this session, works reliably).

KNOWN: PS 5.1 Get-Content -Raw normalizes to CRLF. For round-trip
writes use [System.IO.File]::ReadAllText + WriteAllText.

KNOWN: -LiteralPath needed for bracketed paths like
app\(dashboard)\...; in git add, quote the (dashboard) segment:
  git add app/"(dashboard)"/discount-rules/actions.ts
(git add -A also works and is simpler when staging everything.)

KNOWN: git warns "LF will be replaced by CRLF" when staging files
Claude wrote with LF. HARMLESS - just line-ending normalization on
checkout. Not an error.

== INFRA RECAP ==

Two PowerShell windows: Window 1 runs `npm run dev` (leave running);
Window 2 for git/file writes/tsc.

SUPABASE_SERVICE_ROLE_KEY in .env.local, never committed. Only
lib/supabase/admin.ts uses it (has import 'server-only'). ssr client
(lib/supabase/server.ts) respects RLS.

Auth guards (lib/auth/guard.ts):
  requireAdminCaller() -> CallerProfile (any non-customer)
  requireRole(allowed) -> role allowlist
  requireOwner()       -> OWNER_ROLES sugar
Discount rules use requireRole(['owner','admin'] as const).

== JWT IMPERSONATION FOR RPC SMOKES ==

SQL editor has auth.uid() = NULL by default, so SECURITY DEFINER
RPCs with RBAC gates reject. To smoke one:
  SET LOCAL request.jwt.claims =
    '{"sub":"<auth_user_id>","role":"authenticated"}';
  SELECT public.your_rpc(...);
User's auth_user_id: 3f135a05-76fb-4859-9009-3a0b606815c1
User's profile id:    17b11149-5480-4716-8a55-5f7905c94543
SET LOCAL is per-transaction; JWT and SELECT in the same Run.

NOTE: resolve_line_discounts is STABLE SECURITY DEFINER but has NO
auth gate (it reads rules + a tier; no writes), so it can be smoked
directly with no JWT.

== TEST DATA STILL IN DB ==

Sales fixtures (left intentionally per project convention):
  ONL-0001 Delivered, fully traced. Source/fulfillment=Montellano.
  ONL-0003 Cancelled unpaid pickup. Stock returned.
  ONL-0004 Cancelled paid delivery. Compensating payment row.
  ONL-0005 Round 15.7 Henriles delivery lifecycle (pre-discount).
  FAC-2891 16.6 POS audit: sale-level manual (10000) + line manual
    fallback (5000). KEEP.
  FAC-2892 16.6 POS audit: line auto attributed to TEST-16.4 (10%,
    5000). KEEP.
  ONL-0006 16.6 online audit, later CANCELLED via UI; audit row
    survived (cancelled, attribution intact). KEEP.

Discount rule fixtures:
  SMOKE-16.1 (774bbe2c-...) customer_override 10% on OPERATOR
    profile (Perkins). Won't fire in carts. Safe to delete.
  TEST-16.4 POS smoke 10% (17a1cd31-...) customer_override on
    Henriles. KEEP.
  TEST-17 bronze 5% (8ca9e1b5-...) club_tier on bronze. KEEP or
    delete - bronze no longer matches Henriles (she's silver now).
  'Silver tier 7%' club_tier on silver, created via the 17.4 admin
    UI. KEEP - matches Henriles.

Customer state:
  Henriles Bonhomme (profile cf125be7-...) is currently
    club_tier='silver'. She stacks 'Silver tier 7%' + TEST-16.4 10%
    = ~16.3% in any cart. For a clean baseline customer, reset her
    to 'none' or use a different customer for non-discount tests.

== KEY VERIFIED FACTS ==

- profiles.club_tier is the tier column (USER-DEFINED enum
  public.club_tier: none, bronze, silver, gold, platinum).
- discount_rules_shape_check already covers ALL 5 kinds (verified
  via pg_get_constraintdef). club_tier branch requires
  scope_club_tier + delta_percent. No schema migration was needed
  for Round 17.
- PurchaseStatus union (lib/purchases-types.ts) is now: pending,
  paid_supplier, received, complete, cancelled, lost (Round 18 added
  the last two). PURCHASE_STATUSES array matches.
- getLotTrailForOrder returns Map<string, LotTrailEntry[]>;
  LotTrailEntry has nested .lot (qty_received etc.) + .consumption[].
- Ok<T> = {ok:true} & T (duplicated in discount-rules/actions.ts and
  online-orders/actions.ts). For a no-payload success, the result
  type must be Ok<object>, NOT Ok<Record<string,never>>.
- TWO MoneyAccount types: lib/sales (minimal {id,name,kind}) and
  lib/money-accounts (rich). Components reading only id/name/kind
  should import from lib/sales.
- Supabase dynamic-query typing quirk: a .select() built from a
  variable/conditional string defeats the typed client (infers
  GenericStringError or ParserError). Fix: `as unknown as <RowType>`.
  Runtime-harmless.
- The TS resolver's amountCents is NEGATIVE (cents off); the RPC
  stores audit amount_cents POSITIVE (abs() in the 16.6 migration).
- POS action (sales/actions.ts) takes snake_case input, forwards as
  p_payload directly. Online action (online-orders/actions.ts) takes
  camelCase, translates field-by-field. Forms serialize the
  resolver's camelCase breakdown to snake_case before/at the action.
- The discount-rules /new route is a kind picker with subroutes
  (customer-override/, club-tier/). new-customer-override-form.tsx
  was NOT moved - subroutes import it via ../new-customer-override-form.
- public.sales is source of truth for both POS and online.
- tracking_status is TEXT, not enum.
- NO trigger on sale_payments. paid_cents updated by RPC manually.
- sale_payments_amount_cents_check allows negative (15.2.3).
- warehouses.distributor_id + distributor_commission_percent.
- profiles.commission_percent_override exists; NO
  discount_percent_override (per-customer discount goes via
  discount_rules customer_override kind).
- sale_discount_applications XOR constraints: sda_target_check
  (sale_id XOR sale_item_id), sda_source_check (is_manual XOR
  discount_rule_id). Insert ONE side only.
- discount_rules.delta_percent numeric (0.01-99.99). delta_cents
  integer (>0, surcharges only).
- "Discount Rules" nav uses Receipt icon.

== SEARCH ==

conversation_search queries for next session:
  "Round 18 tsc cleanup 26 to zero guard"
  "pre-commit hook typecheck npm script"
  "PurchaseStatus stale cancelled lost markLost"
  "LotRow LotTrailEntry actions-bar import fix"
  "Ok object Record never action result type"
  "GenericStringError unknown cast online-orders purchases"
  "MoneyAccount two types lib sales money-accounts"
  "Round 17 club_tier resolver KIND_SORT_KEY"
  "dual resolver SQL TS lock-step"
  "rule kind pattern bulk promotion logistics"
  "discount-rules new kind picker subroute"

== PICK UP AT ==

Round 19.0 - bulk discount kind. FIRST read the SQL resolver
(db/migrations/round-17-club-tier-01-resolver.sql) and
lib/discount-rules-resolver.ts side by side to see exactly where the
bulk branch + KIND_SORT_KEY entry slot in. Confirm
discount_rules_shape_check covers 'bulk' (pg_get_constraintdef) and
which columns it needs. Then follow the rule-kind pattern (SQL
resolver -> TS resolver -> admin UI -> tsc/smoke/commit).

The commit guard now runs tsc automatically; baseline is 0. Use
`npm run typecheck` for a quick check, or the full verification
pattern above when you want the by-code breakdown.

Last commit pushed: 470bbdf.
