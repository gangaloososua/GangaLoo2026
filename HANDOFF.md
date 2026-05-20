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

== CRITICAL: TYPE-CHECKING WAS SILENTLY OFF (NOW FIXED) ==

Discovered and fixed this session (commit f6ef24c). READ THIS.

app/bounce/page.tsx had a malformed <a> tag (missing the opening
'<a' before its href attribute) dating to Round 11. That is a PARSE
(syntax) error. TypeScript SUPPRESSES ALL semantic/type errors
project-wide when any file has unrecoverable syntax errors - it
only reports the syntax errors. So every "tsc --noEmit clean"
result from Round 11 through Round 17-engine only ever confirmed
"no NEW SYNTAX errors" - real type-checking was OFF for ~6 rounds.

The bounce fix restored type-checking, which immediately surfaced
26 PRE-EXISTING latent type errors (see below). Those are real but
were always there, masked. They are NOT yet fixed - they get a
dedicated cleanup round (now Round 18).

LESSON: "tsc clean" is only trustworthy if tsc is actually
type-checking. If a deliberately-broken probe line (e.g.
`const x: number = 'string'`) does NOT produce an error, tsc is
not checking that file - look for a syntax error elsewhere that's
poisoning the whole run. The verification pattern below now
captures the FULL error list and a total count, not a filtered
view, precisely so a masked state is visible.

== 26 PRE-EXISTING TYPE ERRORS (DEFERRED TO ROUND 18) ==

All latent, all masked until f6ef24c, NONE introduced by Round
16/17 feature work. Three groups:

  18x Supabase GenericStringError casts (TS2352/TS2698/TS2339):
    lib/money-accounts.ts (6), lib/online-orders.ts (5),
    lib/purchases.ts (2), lib/discount-rules.ts (1),
    app/(dashboard)/products/[id]/page.tsx (1),
    app/(dashboard)/courier-payments/new/page.tsx (1 - actually a
    MoneyAccount type mismatch, see below).
    These are the known Supabase typing quirk where a string-built
    .select() returns an error-union type the cast can't follow.
    Runtime-harmless (shipped + working many rounds). Fix pattern:
    cast through `unknown` first, or type the query result properly.

  5x action result-type mismatches (TS2322 '{ ok: true }' not
    assignable):
    app/(dashboard)/discount-rules/actions.ts (setRuleActive:120,
    deleteRule:164), app/(dashboard)/online-orders/actions.ts
    (markDispatched:194, markDelivered:219, cancel:251).
    Cause: `Ok<Record<string, never>>` doesn't accept a bare
    `{ ok: true }`. Fix: return `{ ok: true } as const` or adjust
    the Ok<> helper. (createCustomerOverrideRule and
    createClubTierRule are NOT affected - they return
    Ok<{ ruleId }> with the field present.)

  3x genuine latent bugs worth real attention (NOT just noise):
    app/(dashboard)/purchases/[id]/page.tsx (88, 94, 215 x2):
      comparisons against 'cancelled' / 'lost' that aren't in the
      PurchaseStatus union. Either the type is stale (missing those
      statuses) or these are dead branches. INVESTIGATE before
      blindly silencing.
    app/(dashboard)/purchases/[id]/actions-bar.tsx (47):
      imports 'LotRow' from @/lib/purchases-types but that member
      isn't exported. Find the right type name or add the export.

ROUND 18 = fix all 26, THEN install a tsc dev-loop guard (the user
asked for the guard). The guard must come AFTER the cleanup,
otherwise it blocks every commit against the 26. Guard options
discussed: an npm "typecheck" script (tsc --noEmit) wired into a
pre-commit hook that fails on ANY error. Keep it green post-cleanup.

== STATE AS OF END OF LAST SESSION ==

Modules complete and committed: Auth, Dashboard shell, Categories,
Warehouses, People, Products, Settings (hub + Exchange Rates +
Store Config + Receipt), Sales/POS, Users, RBAC, Money Accounts,
Purchases READ (14a), Purchases WRITE (14b), Courier Payments (14c),
ONLINE ORDERS (Round 15 FULL), SALE-DISCOUNT ENGINE Round 16 FULL
(customer_override), SALE-DISCOUNT ENGINE Round 17 FULL (club_tier).

Round 16 (customer_override) COMPLETE - sub-rounds 16.0-16.6.
Round 17 (club_tier) COMPLETE - engine + admin UI, all verified.
Last commit 6e61fbc on origin/master.

Commits this session:
  ffbd39e  Round 16.5 online-orders cart auto-discount
  0d13bcd  Round 16.6 audit persistence + e2e
  f6ef24c  Fix bounce syntax error (RESTORED TYPE-CHECKING)
  50c0430  Round 17 club_tier engine (SQL resolver + TS mirror + carts)
  6e61fbc  Round 17.4 club_tier admin UI (kind picker + builder)

== SALE-DISCOUNT ENGINE DESIGN DECISIONS (LOCKED) ==

CRITICAL - drives all rule-kind rounds (16-21).

  Scope: ALL 5 rule kinds (customer_override, club_tier, bulk,
    promotion, logistics_surcharge), one kind per round.
  Stacking: MULTIPLICATIVE (compound; never exceeds 100%).
  Cap: 30% effective max per line (running factor floored at 0.70).
  Stack order (audit-row order): by KIND first, then priority DESC,
    then created_at ASC. Current kind order: club_tier (0),
    customer_override (1). Future kinds slot into KIND_SORT_KEY
    (TS) and the SQL CASE WHEN. (Locked this session: club_tier
    stacks before customer_override.)
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
  stay aligned. The TS resolver's input now includes
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
  6. tsc (now meaningful again), browser smoke, commit, push.

NOTE: logistics_surcharge is the odd one - it's an ORDER-LEVEL
surcharge (delta_cents, positive), not a per-line percent discount.
It will NOT fit the per-line resolver cleanly. Design first when you
reach it (Round 21).

== ROADMAP (UPDATED THIS SESSION) ==

16 - Sale-discount engine: customer_override (DONE)
17 - Sale-discount engine: club_tier (DONE)
18 - TSC CLEANUP: fix the 26 pre-existing type errors, then install
     a tsc dev-loop guard (pre-commit / npm script). NEW - inserted
     because the bounce fix revealed type-checking had been off.
19 - Sale-discount engine: bulk (qty threshold)
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

Round 18 - tsc cleanup + guard. Recommended order:

  18.1 Investigate + fix the 3 genuine bugs first (purchases status
       comparisons, LotRow export). These need understanding, not
       just silencing - the status type may be genuinely stale.
  18.2 Fix the 5 action result-type mismatches (likely a one-line
       Ok<> helper tweak or `{ ok: true } as const` in 5 spots).
  18.3 Fix the 18 GenericStringError casts (cast-through-unknown or
       proper result typing). Repetitive; can batch carefully.
  18.4 Confirm tsc reports ZERO errors (full count, not filtered).
  18.5 Install the guard: add "typecheck": "tsc --noEmit" to
       package.json scripts; wire a pre-commit hook (husky or a
       simple .git/hooks/pre-commit) that runs it and blocks on
       failure. Verify it stays green.

Then Round 19 (bulk) using the rule-kind pattern above.

Alternatively, if the user wants to keep shipping discount kinds and
defer cleanup, Round 19 (bulk) can go first - but the type net stays
noisy (26 errors) until 18 is done, which makes "is this MY error?"
harder to answer each round. Recommend doing 18 next while the
discovery is fresh.

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
  TEST-17 bronze 5% (8ca9e1b5-...) club_tier on bronze. From the 17
    engine SQL smoke. KEEP or delete - bronze no longer matches
    Henriles (she's silver now).
  'Silver tier 7%' club_tier on silver, created via the 17.4 admin
    UI. KEEP - matches Henriles.

Customer state:
  Henriles Bonhomme (profile cf125be7-...) is currently
    club_tier='silver' (started 'none', set to 'bronze' in the 17
    engine smoke, then 'silver' in the 17.4 smoke). She now stacks
    'Silver tier 7%' + TEST-16.4 10% = ~16.3% in any cart. If you
    want a clean baseline customer, either reset her to 'none' or
    use a different customer for non-discount tests.

== KEY VERIFIED FACTS (THIS SESSION) ==

- profiles.club_tier is the tier column (USER-DEFINED enum
  public.club_tier with values: none, bronze, silver, gold,
  platinum).
- discount_rules_shape_check already covers ALL 5 kinds (verified
  via pg_get_constraintdef). club_tier branch requires
  scope_club_tier + delta_percent. No schema migration was needed
  for Round 17.
- The TS resolver's amountCents is NEGATIVE (cents off); the RPC
  stores audit amount_cents POSITIVE (abs() in the 16.6 migration).
- POS action (sales/actions.ts) takes snake_case input, forwards as
  p_payload directly. Online action (online-orders/actions.ts) takes
  camelCase, translates field-by-field. Forms serialize the
  resolver's camelCase breakdown to snake_case before/at the action.
- Discount-rules data layer (listDiscountRules) is forward-
  compatible across kinds (batch name resolution for all scope FKs).
- The discount-rules /new route is now a kind picker with subroutes
  (customer-override/, club-tier/). The existing
  new-customer-override-form.tsx was NOT moved - the subroute imports
  it via ../new-customer-override-form.

== KEY VERIFIED FACTS (UNCHANGED FROM PRIOR SESSIONS) ==

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

== KEY FILES TOUCHED THIS SESSION ==

Round 16.5:
  app/(dashboard)/online-orders/new/page.tsx
  app/(dashboard)/online-orders/new/new-online-order-form.tsx
Round 16.6:
  db/migrations/round-16-sale-discounts-04-rpc-audit.sql (NEW)
  app/(dashboard)/sales/actions.ts
  app/(dashboard)/sales/new/new-sale-form.tsx
  app/(dashboard)/online-orders/actions.ts
  app/(dashboard)/online-orders/new/new-online-order-form.tsx
Bounce fix:
  app/bounce/page.tsx
  .gitignore (_tsc_out.txt -> _tsc_*.txt)
Round 17 engine:
  db/migrations/round-17-club-tier-01-resolver.sql (NEW)
  lib/discount-rules-resolver.ts
  app/(dashboard)/sales/new/new-sale-form.tsx
  app/(dashboard)/online-orders/new/new-online-order-form.tsx
Round 17.4 admin UI:
  app/(dashboard)/discount-rules/new/page.tsx (rewritten as picker)
  app/(dashboard)/discount-rules/new/new-club-tier-form.tsx (NEW)
  app/(dashboard)/discount-rules/new/customer-override/page.tsx (NEW)
  app/(dashboard)/discount-rules/new/club-tier/page.tsx (NEW)
  app/(dashboard)/discount-rules/actions.ts (createClubTierRule)

== TYPESCRIPT VERIFICATION PATTERN (UPDATED) ==

CRITICAL: capture the FULL output + total count, not a filtered
view - a filtered view is exactly what hid the masked-types state.

  npx tsc --noEmit 2>&1 | Out-String | Set-Content -LiteralPath "_tsc_full.txt" -Encoding utf8
  Write-Host "=== errors in <files of interest> ==="
  Select-String -LiteralPath "_tsc_full.txt" -Pattern "<your files>" | ForEach-Object { $_.Line }
  Write-Host "=== total error count ==="
  (Select-String -LiteralPath "_tsc_full.txt" -Pattern "error TS").Count

Baseline total is currently 26 (the deferred pre-existing errors).
After Round 18 it should be 0. If your change adds errors, the total
rises above the current baseline AND your files appear in the
filtered view.

SANITY PROBE: if you suspect tsc isn't really checking a file, add a
deliberate `const __probe__: number = 'x'` to it and re-run. If no
error appears, tsc is not checking that file - hunt for a syntax
error poisoning the run (that's what bounce was).

_tsc_*.txt is gitignored (glob added this session). Scratch files
won't be committed.

== POWERSHELL GOTCHAS ==

LINE ENDINGS matter for str_replace probes. Files Claude wrote via
create_file (downloaded + Move-Item'd) are LF. Files written by
PowerShell round-trips, or originally Windows-checked-in, are CRLF.
PowerShell here-string `r`n is CRLF. RULE: when patching a file
Claude generated this/last session, probe with `n. When patching an
older file, probe with `r`n. If a probe returns False, TRY THE OTHER
before abandoning. (Bit us this session on new-sale-form.tsx.) When
in doubt, match on a single line WITHOUT surrounding newlines, or
use a regex that's newline-agnostic.

REGEX MULTI-INSERT (insert after every match, preserving each
match's own indent):
  $pattern = "(?m)^(\s*)customerId: resolverCustomerId,"
  $raw2 = [regex]::Replace($raw, $pattern,
    '${1}customerId: resolverCustomerId,' + "`n" +
    '${1}customerClubTier: resolverClubTier,')
  # verify before/after counts match expected
Captures leading whitespace in group 1, reuses it for the new line.
Used this session to patch 3 differently-indented call sites at once.

SQL into Supabase via clipboard:
  Get-Content -LiteralPath "path.sql" -Raw | Set-Clipboard
Then CLEAR the editor first, paste, Run (paste appends).

ONE-LINER str_replace (probe first, abort if not found):
  $abs = (Resolve-Path "path").ProviderPath
  $raw = [System.IO.File]::ReadAllText($abs)
  $old = "exact string"; $new = "replacement"
  Write-Host "contains? $($raw.Contains($old))"
  if ($raw.Contains($old)) {
    [System.IO.File]::WriteAllText($abs, $raw.Replace($old,$new),
      [System.Text.UTF8Encoding]::new($false))
    Write-Host "wrote"
  } else { Write-Host "ABORT" }

MULTI-EDIT all-or-nothing: probe N olds, only write if all present.

MULTI-FILE move + mkdir (semicolon-chained single line; creates
subdirs, renames during move):
  $dl = "$env:USERPROFILE\Downloads"; New-Item -ItemType Directory -Force -Path "app\(dashboard)\x\sub" | Out-Null; Move-Item -LiteralPath "$dl\a.tsx" -Destination "app\(dashboard)\x\sub\page.tsx" -Force; Write-Host "done"

KNOWN: prompt stuck at >> after a pasted block. Ctrl+C to escape
(NOT Enter). If still stuck, close + reopen the window.

KNOWN: Set-Location does NOT update process cwd for
[System.IO.Path]::GetFullPath. Use
[System.IO.Directory]::SetCurrentDirectory($PWD.ProviderPath).

KNOWN: PS 5.1 Get-Content -Raw normalizes to CRLF. For round-trip
writes use [System.IO.File]::ReadAllText + WriteAllText.

KNOWN: -LiteralPath needed for bracketed paths like
app\(dashboard)\...; in git add, quote the (dashboard) segment:
  git add app/"(dashboard)"/discount-rules/actions.ts

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
directly with no JWT - as done this session.

== SEARCH ==

conversation_search queries for next session:
  "bounce syntax error masked type checking"
  "26 pre-existing tsc errors GenericStringError"
  "tsc guard pre-commit dev loop Round 18"
  "Round 17 club_tier resolver KIND_SORT_KEY"
  "club_tier Model A none not enrolled"
  "discount-rules new kind picker subroute"
  "createClubTierRule action"
  "resolve_line_discounts club_tier branch SQL"
  "Henriles silver tier stacked 7% 10%"
  "dual resolver SQL TS lock-step"
  "rule kind pattern bulk promotion logistics"

== PICK UP AT ==

Round 18.1 - investigate the 3 genuine type bugs first
(purchases/[id]/page.tsx status comparisons, actions-bar LotRow
export). Read app/(dashboard)/purchases/[id]/page.tsx and the
PurchaseStatus type definition before deciding whether the type is
stale or the branches are dead. Then 18.2 (action result types),
18.3 (GenericStringError casts), 18.4 (confirm zero), 18.5 (install
guard).

Use the UPDATED tsc verification pattern (full output + total count).
Baseline total is 26; goal is 0, then guard.

Last commit pushed: 6e61fbc.
