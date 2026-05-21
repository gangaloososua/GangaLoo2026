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

NEVER use the "pick for me" pattern when the choice is technical and
the user has said they don't understand. Explain first, then ask.
Exception: when they say "choose for me, most accurate/correct" -
then pick and justify briefly. When using ask_user_input_v0 for a
technical choice, ADD an "explain first" option (used heavily and
well this session - the user took it several times).

DESIGN-FIRST: this session repeatedly turned up schema facts that
changed the plan (products have NO category column; product<->
category is many-to-many via product_categories with an is_primary
flag and up to 3 cats/product). ALWAYS verify schema with a
read-only query before assuming a column/shape exists. The type
checker (live + guarded) catches when an assumption was wrong.

DO NOT TRUST `BEGIN/ROLLBACK` in Supabase SQL editor when
state-changing RPCs are involved (esp. temp tables). The editor
WRAPS EVERY "RUN" IN A TRANSACTION; if you paste two statements and
the second raises, the first rolls back too. Smoke state-changing
RPCs ONE state-changer per Run. Verification SELECTs in the same
paste are fine. Negative tests get their OWN Run.

NOTE: Sequences DO NOT rollback (non-transactional by design).
NOTE: The editor only DISPLAYS the LAST result set when a Run has
multiple SELECTs. Run SELECTs one at a time, or UNION them into one
(used this session for resolver smokes - shows all rows).

== CRITICAL: TYPE-CHECKING - CLEAN + GUARDED (since Round 18) ==

History: app/bounce/page.tsx had a malformed <a> tag (PARSE error)
from Round 11. TypeScript SUPPRESSES ALL type errors project-wide
when any file has unrecoverable syntax errors. So every "tsc clean"
from Round 11-17 only meant "no NEW syntax errors" - real checking
was OFF ~6 rounds. Round 18 fixed bounce, fixed 26 latent errors,
installed a guard. Baseline is now a CONFIRMED-LIVE zero.

THE COMMIT GUARD (Round 18.5):
  - package.json script: "typecheck": "tsc --noEmit". Run with
    `npm run typecheck`.
  - .git/hooks/pre-commit runs typecheck before EVERY commit and
    BLOCKS on any error. Working all session (passed on the 3
    Round-19 commits).
  - ESCAPE HATCH: `git commit --no-verify` for deliberate WIP.
  - Hook is a /bin/sh script with LF endings (Git runs hooks under
    Git Bash). Lives in .git/hooks/ which is LOCAL, NOT in the repo.
    Fresh clone won't have it; re-create if needed.

LESSON: "tsc clean" is trustworthy only if tsc is actually checking.
SANITY PROBE: add `const __probe__: number = 'x'` to a file, re-run;
if no error, tsc isn't checking that file - hunt a syntax error.
ALWAYS remove the probe after. _tsc_*.txt is gitignored.

== STATE AS OF END OF LAST SESSION ==

Modules complete + committed: Auth, Dashboard shell, Categories,
Warehouses, People, Products, Settings (hub + Exchange Rates + Store
Config + Receipt), Sales/POS, Users, RBAC, Money Accounts, Purchases
READ (14a), Purchases WRITE (14b), Courier Payments (14c), ONLINE
ORDERS (15 FULL), discount engine 16 (customer_override), 17
(club_tier), 18 (TSC cleanup + guard), 19 (bulk) FULL + cleanup.

Discount engine: 3 of 5 kinds DONE (customer_override, club_tier,
bulk). Remaining: promotion (Round 20), logistics_surcharge (21).

Commits this session, newest last:
  470bbdf  Round 18: tsc cleanup (26->0) + pre-commit typecheck guard
  90d19df  Round 19: bulk (quantity) discount kind
  b8e138b  Round 19 cleanup: drop dead 'as const' from 5 ok-result actions
Last commit on origin/master: b8e138b.

ROUND 19 DETAIL (bulk discount; commit 90d19df):
  Concept: "buy N or more of a product OR (primary) category, get X%
  off." Stacks multiplicatively, 30% cap, kind sort position 2.
  Data layer was already bulk-ready: discount_rules has threshold_qty
  + delta_percent; DiscountRuleRow exposes thresholdQty;
  discount_rules_shape_check already accepts bulk. NO schema migration.
  SQL (db/migrations/round-19-bulk-01-resolver.sql, DEPLOYED):
    * NEW param p_category_id uuid DEFAULT NULL (7th arg).
    * REMOVED walk-in early-return: bulk needs no customer. WHERE
      clause decides per kind (override/club_tier don't match when
      customer/tier null).
    * bulk match: threshold_qty IS NOT NULL AND p_qty >= threshold_qty
      AND (scope_product_id = p_product_id OR (both category sides
      non-null AND scope_category_id = p_category_id)).
    * sort CASE: club_tier 0, customer_override 1, bulk 2.
    * Smoke-tested: product scope fires at qty>=threshold, [] below;
      category scope fires only when p_category_id passed; walk-in
      fires. Math verified (-208000, -90000).
  TS resolver (lib/discount-rules-resolver.ts): added categoryId to
    ResolveLineDiscountInput; bulk branch mirrors SQL; KIND_SORT_KEY
    already had bulk: 2.
  CATEGORY PLUMBING (the big thread):
    * products has NO category col. product<->category is M:N via
      public.product_categories (product_id, category_id, is_visible,
      is_primary, display_order). Up to 3 cats/product.
    * DESIGN (user): category-scoped bulk matches the PRIMARY category
      only (is_primary=true).
    * lib/sales.ts searchProductsForSale: added 3rd parallel batch
      query to product_categories (is_primary=true) -> categoryMap;
      added primary_category_id: string | null to ProductSearchResult.
    * BOTH order forms: added primary_category_id to CartLine, set on
      line creation, passed categoryId to all 3 resolveLineDiscount
      calls. The online form has a 2nd `productId: l.product_id` in
      the SUBMIT payload (items.map ~L462) that must NOT get
      categoryId - only the 3 resolver calls do. (Exactly-once anchor
      guard caught this.)
  ADMIN UI (rule-kind pattern):
    * discount-rules/new/page.tsx: 3rd RULE_KINDS entry.
    * .../new/bulk/page.tsx: NEW subroute, FETCHES products +
      categories, passes to form.
    * .../new/new-bulk-form.tsx: NEW. Product/category toggle +
      min-qty + percent/priority/dates. Mirrors new-club-tier-form.
    * actions.ts: NEW createBulkRule (Ok<{ruleId}>|Err). Validates
      name, exactly-one scope (product XOR category), thresholdQty
      int>=1, percent 0<p<100, dates, priority. Inserts kind:'bulk'.
    * User browser-smoke-tested: 3 kinds shown, form loads + submits.
  CLEANUP (b8e138b): removed dead `return { ok: true } as const` from
    the 5 ok-result actions. Was Round 18's ineffective first attempt;
    real fix was Ok<object>. tsc stayed clean (proves Ok<object>
    holds). No loose ends remain.
  TEST DATA: all Round-19 test rules DELETED end of session. Zero
    bulk rules remain.

== SALE-DISCOUNT ENGINE DESIGN DECISIONS (LOCKED) ==

  Scope: ALL 5 kinds, one per round.
  Stacking: MULTIPLICATIVE. Cap: 30% effective max/line (running
    factor floored 0.70). bulk obeys via the same kind-agnostic loop.
  Stack order (audit-row order): KIND first, then priority DESC, then
    created_at ASC. Kind order: club_tier(0), customer_override(1),
    bulk(2). Future kinds slot into KIND_SORT_KEY (TS) + SQL sort CASE.
  Manual override: PER-LINE. MANUAL WINS when seller types a discount;
    typing 0 restores auto.
  Audit: PER APPLIED RULE in sale_discount_applications; plus per-line
    manual and per-sale-level order discount.
  Engine: SHARED POS + online. Application: AT CART-ADD (live preview).
  Club-tier: MODEL A - 'none' = not enrolled, no discount. Resolver
    guards v_customer_tier <> 'none'.
  Bulk: no customer required (fires for walk-ins); category match uses
    PRIMARY category only.

== DUAL RESOLVERS - KEEP IN LOCK-STEP (CRITICAL 20-21) ==

  SQL: public.resolve_line_discounts
    Latest: db/migrations/round-19-bulk-01-resolver.sql (DEPLOYED).
    7 params: p_product_id, p_qty, p_unit_price_cents, p_customer_id,
    p_source_warehouse_id, p_at DEFAULT now(), p_category_id DEFAULT
    NULL. STABLE SECURITY DEFINER, NO auth gate -> smoke directly, no
    JWT. Handles customer_override + club_tier + bulk. The create-sale
    RPCs do NOT call it (trust the cart's breakdown, 16.6); it's for
    reports / server-side preview.
  TS: lib/discount-rules-resolver.ts
    Cart-time preview, both forms. MIRRORS SQL exactly. Input:
    productId, categoryId (Round 19, PRIMARY category), qty,
    unitPriceCents, customerId, customerClubTier, sourceWarehouseId,
    rules, at.
  Rounds 20-21: BOTH FILES change together, PLUS KIND_SORT_KEY (TS)
  and SQL sort CASE stay aligned.

== HOW A NEW RULE KIND GETS ADDED (PATTERN, REFINED THROUGH 19) ==

  1. Schema: shape_check covers all 5 kinds (verify
     pg_get_constraintdef). Likely NO migration. Check which existing
     columns the kind needs (bulk reused threshold_qty; promotion
     likely reuses scope_category_id + starts_at/ends_at - all exist).
  2. SQL resolver: CREATE OR REPLACE, add WHERE branch + sort CASE
     position. Deliver as a download, user saves to db/migrations/
     then pastes into Supabase. Smoke directly (no JWT).
  3. TS resolver: mirror branch + KIND_SORT_KEY entry. Add new input
     field if needed.
  4. Forms: if the kind needs a new per-line input, add to
     ResolveLineDiscountInput, CartLine type, line creation, the 3
     resolver calls in BOTH forms. WATCH the online form's 4th
     `productId:` (submit payload ~L462) - do NOT add resolver-only
     fields there. categoryId is ALREADY plumbed - promotion reuses
     it for category scope free.
  5. Admin UI: RULE_KINDS entry + /new/<kind>/page.tsx (fetch lists
     the form needs) + new-<kind>-form.tsx + create<Kind>Rule action
     (mirror createBulkRule).
  6. tsc (guarded), browser smoke, commit, push, delete test rules.

ROUND 20 (promotion) - DECIDE FIRST: roadmap says "time-bound +
category scope," but starts_at/ends_at already exist and the resolver
already applies the time window to ALL kinds. So promotion may be
close to "category/product scope, within a date window, X% off" =
bulk-minus-threshold. ASK THE USER what makes promotion distinct
(store-wide? no threshold? everyone incl walk-in?) before designing.
categoryId plumbing is DONE, so category-scoped promotion needs no
new form work - just resolver branch + admin UI.

ROUND 21 (logistics_surcharge) - the odd one. ORDER-LEVEL surcharge
(delta_cents, POSITIVE), not a per-line percent. Won't fit the
per-line resolver cleanly. DESIGN FIRST.

== ROADMAP ==

16 customer_override (DONE)  17 club_tier (DONE)
18 TSC cleanup + guard (DONE) 19 bulk (DONE)
20 promotion (time-bound + category scope)   <-- NEXT
21 logistics_surcharge (order-level; design first)
22 Inventory / stock-movements UI [damage/theft write-off note]
23 Cashback / commissions reports
24 Accounting / transactions module [data-source caveat - design
   first; PURCHASES + COURIER PAYMENTS don't post to
   public.transactions; join-vs-extend unresolved]
25 Real-numbers dashboard [same caveat as 24]
26 Spanish UI (i18n) - en-GB used throughout to avoid hydration
   mismatches; flip each call site to es-DO. datetime-local inputs
   inherit browser locale (Perkins's browser is German); set Spanish
   explicitly. Sellers Delia, Estafany, Fabienne have logins; Sophia
   ran a test sale. If sellers go live before the engine finishes,
   jump i18n ahead.

== IMMEDIATE NEXT STEP ==

Round 20 - promotion. FIRST read the SQL resolver
(db/migrations/round-19-bulk-01-resolver.sql) and
lib/discount-rules-resolver.ts side by side. THEN ask the user what
makes promotion distinct (the date window already applies to all
kinds, so nail the real difference first). Then rule-kind pattern.
categoryId is already plumbed through both forms.

== TYPESCRIPT VERIFICATION ==

Quick: `npm run typecheck` (exits non-zero on error; hook runs it).
Full breakdown:
  npx tsc --noEmit 2>&1 | Out-String | Set-Content -LiteralPath "_tsc_full.txt" -Encoding utf8
  (Select-String -LiteralPath "_tsc_full.txt" -Pattern "error TS").Count
  Select-String -LiteralPath "_tsc_full.txt" -Pattern "error (TS\d+)" | ForEach-Object { $_.Matches[0].Groups[1].Value } | Group-Object | Sort-Object Count -Descending | Format-Table Count, Name -AutoSize

Adding a required field to a shared input type (like categoryId on
ResolveLineDiscountInput) makes tsc point at EVERY call site - the
intended way to find all spots to update. Expect it, work through them.

== POWERSHELL GOTCHAS (EXPANDED THIS SESSION) ==

LINE ENDINGS - THE BIG ONE. Files here can be MIXED: lib/sales.ts
this session was ~536 LF + ~5 CRLF lines. A multi-line str_replace
anchor spanning an LF/CRLF boundary matches as NEITHER pure-LF nor
pure-CRLF. RULES:
  * Prefer SINGLE-LINE anchors (no embedded newline = ending can't
    bite). Rescued every stuck edit this session.
  * Insert after a line: replace "<line>`n" with
    "<line>`n<content>`n" using $n = "`n".
  * Detect: $crlf = ([regex]::Matches($raw,"`r`n")).Count ;
    $lf = ([regex]::Matches($raw,"(?<!`r)`n")).Count.
  * If a multi-line anchor returns False, try the other ending or
    break into single-line anchors. Dump region with "|$_|" markers
    to reveal whitespace/blank lines (a stray line between brace and
    first field broke a CartLine anchor this session).

EXACTLY-ONCE GUARD. When an anchor might appear >1 (e.g.
`productId: l.product_id,` is in BOTH a resolver call and a submit
payload), require count -eq 1 before writing; if 2, LOOK at both
before deciding. Caught a near-bug (categoryId nearly went into the
submit payload).

DO NOT USE -f FORMAT OPERATOR to build code strings. `||`, `{`, `}`
make -f throw "input string wrong format" (German: "Die
Eingabezeichenfolge hat das falsche Format"). Use + concatenation
with a $n/$c newline variable.

ALL-OR-NOTHING MULTI-EDIT (used constantly, very safe): array of
@{old;new}, probe every old (print found?/count), write only if ALL
present/exactly-once, then loop Replace.

ONE-LINER str_replace via .NET (preserves endings, no BOM):
  $abs = (Resolve-Path -LiteralPath "path").ProviderPath
  $raw = [System.IO.File]::ReadAllText($abs)
  Write-Host "found? $($raw.Contains($old))"
  if ($raw.Contains($old)) {
    [System.IO.File]::WriteAllText($abs, $raw.Replace($old,$new),
      [System.Text.UTF8Encoding]::new($false)); "wrote"
  } else { "ABORT" }

COUNT before replace: ([regex]::Matches($raw,
[regex]::Escape($old))).Count

SQL into Supabase via clipboard:
  Get-Content -LiteralPath "path.sql" -Raw | Set-Clipboard
CLEAR the editor first, paste, Run (paste appends).

MULTI-FILE move + mkdir (one line):
  $dl = "$env:USERPROFILE\Downloads"; New-Item -ItemType Directory -Force -Path "app\(dashboard)\x\sub" | Out-Null; Move-Item -LiteralPath "$dl\a.tsx" -Destination "app\(dashboard)\x\sub\page.tsx" -Force; "done"

PASTE A SNIPPET INTO AN EXISTING FILE: read snippet, strip its
preamble via IndexOf a marker, normalize endings to target file's,
Replace a divider/anchor with code+divider. Done this session to
insert createBulkRule before the setRuleActive divider.

KNOWN: prompt stuck at >> after a pasted block. Ctrl+C (NOT Enter).
KNOWN: Set-Location does NOT update cwd for
[System.IO.Path]::GetFullPath. Use Resolve-Path -LiteralPath +
.ProviderPath.
KNOWN: PS 5.1 Get-Content -Raw normalizes to CRLF. Use
ReadAllText/WriteAllText for round-trips.
KNOWN: -LiteralPath needed for bracketed (dashboard) paths. git
add -A is simplest.
KNOWN: git "LF will be replaced by CRLF" warning is harmless.

== INFRA RECAP ==

Two PowerShell windows: Window 1 `npm run dev` (leave running);
Window 2 for git/file writes/tsc/clipboard.

SUPABASE_SERVICE_ROLE_KEY in .env.local, never committed. Only
lib/supabase/admin.ts uses it (import 'server-only'). ssr client
(lib/supabase/server.ts) respects RLS.

Auth guards (lib/auth/guard.ts):
  requireAdminCaller() -> CallerProfile (any non-customer)
  requireRole(allowed) -> role allowlist
  requireOwner()       -> OWNER_ROLES sugar
Discount rules use requireRole(['owner','admin'] as const).
requireRole returns a caller with .id (created_by on inserts).

== JWT IMPERSONATION FOR RPC SMOKES ==

SQL editor has auth.uid()=NULL by default; SECURITY DEFINER RPCs with
RBAC gates reject. To smoke one:
  SET LOCAL request.jwt.claims =
    '{"sub":"<auth_user_id>","role":"authenticated"}';
  SELECT public.your_rpc(...);
User's auth_user_id: 3f135a05-76fb-4859-9009-3a0b606815c1
User's profile id:    17b11149-5480-4716-8a55-5f7905c94543
SET LOCAL is per-transaction; JWT + SELECT in the same Run.
NOTE: resolve_line_discounts has NO auth gate -> no JWT needed.

== TEST DATA STILL IN DB ==

Sales fixtures (left intentionally):
  ONL-0001 Delivered, fully traced (Montellano).
  ONL-0003 Cancelled unpaid pickup. Stock returned.
  ONL-0004 Cancelled paid delivery. Compensating payment row.
  ONL-0005 15.7 Henriles delivery lifecycle (pre-discount).
  FAC-2891 16.6 POS audit: sale-level manual + line manual fallback.
  FAC-2892 16.6 POS audit: line auto attributed to TEST-16.4.
  ONL-0006 16.6 online audit, later CANCELLED via UI; audit survived.

Discount rule fixtures:
  SMOKE-16.1 customer_override 10% on OPERATOR (Perkins). Won't fire
    in carts. Safe to delete.
  TEST-16.4 POS smoke 10% customer_override on Henriles. KEEP.
  TEST-17 bronze 5% club_tier. Henriles is silver now. KEEP/delete.
  'Silver tier 7%' club_tier on silver (17.4 UI). KEEP - matches her.
  (All Round-19 bulk test rules DELETED end of session.)

Customer state: Henriles Bonhomme (profile cf125be7-...) is
  club_tier='silver'. Stacks 'Silver tier 7%' + TEST-16.4 10% =
  ~16.3% in carts. For a clean baseline, reset her to 'none' or use a
  different customer.

== KEY VERIFIED FACTS ==

- profiles.club_tier enum public.club_tier: none, bronze, silver,
  gold, platinum.
- discount_rules_shape_check covers ALL 5 kinds. Columns: scope_
  product_id, scope_category_id, scope_warehouse_id, scope_club_tier,
  scope_customer_id, scope_source_warehouse_id,
  scope_fulfillment_warehouse_id, threshold_qty, delta_percent
  (numeric 0.01-99.99), delta_cents (int >0, surcharges only),
  priority, starts_at, ends_at, is_active, name (NOT NULL - every
  rule needs a name), created_by.
- products has NO category column. product<->category M:N via
  public.product_categories (product_id, category_id, is_visible,
  is_primary, display_order); up to 3 cats/product. Category-scoped
  kinds match the PRIMARY category (is_primary=true).
- ProductSearchResult (lib/sales.ts) includes primary_category_id:
  string | null, filled by a batched product_categories lookup.
- resolve_line_discounts: 7 params, no auth gate, bulk fires for
  walk-ins (NULL customer).
- Ok<T> = {ok:true} & T (duplicated in discount-rules/actions.ts and
  online-orders/actions.ts). No-payload success result type must be
  Ok<object>, NOT Ok<Record<string,never>>.
- TWO MoneyAccount types: lib/sales (minimal {id,name,kind}) and
  lib/money-accounts (rich). Read-only-id/name/kind imports use
  lib/sales.
- Supabase dynamic-query typing quirk: .select() from a variable/
  conditional string -> GenericStringError or ParserError. Fix:
  `as unknown as <RowType>`. Runtime-harmless.
- TS resolver amountCents NEGATIVE; RPC stores audit amount_cents
  POSITIVE (abs() in 16.6).
- POS action takes snake_case, forwards as p_payload. Online action
  takes camelCase, translates field-by-field.
- discount-rules /new is a kind picker with subroutes
  (customer-override/, club-tier/, bulk/). Forms one level up
  (new-<kind>-form.tsx), imported via ../new-<kind>-form.
- Online form has a 2nd `productId: l.product_id` in its SUBMIT
  payload (items.map ~L462) - NOT a resolver call. Don't add
  resolver-only fields there.
- public.sales source of truth for both. tracking_status TEXT. NO
  trigger on sale_payments (paid_cents set by RPC).
  sale_payments_amount_cents_check allows negative.
- warehouses.distributor_id + distributor_commission_percent.
  profiles.commission_percent_override exists; NO
  discount_percent_override.
- sale_discount_applications XOR: sda_target_check (sale_id XOR
  sale_item_id), sda_source_check (is_manual XOR discount_rule_id).
- "Discount Rules" nav uses Receipt icon.

== SEARCH ==

conversation_search queries:
  "Round 19 bulk discount quantity threshold"
  "primary category product_categories is_primary"
  "ProductSearchResult primary_category_id sales.ts"
  "resolve_line_discounts p_category_id walk-in bulk"
  "createBulkRule new-bulk-form scope toggle"
  "mixed line endings single-line anchor"
  "exactly-once anchor guard submit payload"
  "Round 18 tsc cleanup guard pre-commit"
  "Ok object Record never action result"
  "dual resolver SQL TS lock-step KIND_SORT_KEY"
  "rule kind pattern promotion logistics"

== PICK UP AT ==

Round 20 - promotion. Read both resolvers side by side, THEN ask the
user what makes promotion distinct from a date-bounded bulk/override
(the date window already applies to all kinds). categoryId already
plumbed. Then rule-kind pattern: SQL -> TS -> (forms only if new
input) -> admin UI -> tsc/smoke/commit/push -> delete test rules.

Guard runs tsc automatically; baseline 0. Last pushed: b8e138b.
