Continuing Gangaloo admin build (Next.js 16 + Turbopack + Netlify +
shadcn/ui + Supabase SSR + Tailwind v4). Project:
`C:\Users\Perkins\Documents\Apps\GangaLoo New 05-26\gangaloo-admin\`.
Migration SQLs in admin repo at `db\migrations\`.
Remote: https://github.com/gangaloososua/GangaLoo2026.git (private).

== STATE AS OF END OF LAST SESSION ==

Modules complete and committed: Auth, Dashboard shell, Categories,
Warehouses, People, Products, Settings (hub + Exchange Rates +
Store Config + Receipt), Sales/POS, Users, RBAC, Money Accounts,
**Purchases READ surface (Round 14a)**.

Round 14a (Purchases read surface): COMPLETE end-to-end.
  14a.0 spec               -- a3db84f
  14a.1 data layer         -- f223034
  14a.2.3a transport+partial -- 7c1c2b4
  14a spec amendment       -- d160eac
  14a.2 list page + types split -- f9c3739
  14a.3 detail page        -- 9e1f348
  14a.4 nav entry          -- 52697c2

Round 14b (Purchases write surface): IN PROGRESS
  14b.1 spec        -- f566dcf at docs/round-14b-purchases-write.md
  14b.0 migration scaffolding -- a2eb8e2 at db/migrations/
    NOT YET APPLIED TO DB. Apply is the immediate next step.
  14b.2-14b.5: pending.

== IMMEDIATE NEXT STEP ==

Apply the 14b.0 migration to the Supabase dev DB.

The forward migration is at
`db/migrations/round-14b-purchases-write.sql`. It does two
things, each in its own BEGIN/COMMIT:
1. Adds 'cancelled' and 'lost' to the purchase_status enum.
2. Adds usd_discount column (default 0); drops the generated
   usd_total column; re-creates usd_total with the new
   expression (subtotal + shipping + tax - discount).

Procedure:

1. Open Supabase SQL editor.
2. Paste the entire contents of round-14b-purchases-write.sql.
3. Execute. Should succeed silently. Both BEGIN/COMMIT blocks
   are independent; if part 1 succeeds and part 2 fails, the
   enum changes stay, the column changes roll back. That's
   acceptable.

Smoke after applying:

a) Confirm enum has 6 values:
   ```
   select unnest(enum_range(null::purchase_status))::text
   order by 1;
   ```
   Expect 6 rows: cancelled, complete, lost, paid_supplier,
   pending, received.

b) Confirm usd_discount column exists and usd_total still works:
   ```
   select id, usd_subtotal, usd_shipping, usd_tax,
          usd_discount, usd_total
   from purchase_orders
   order by ordered_at desc
   limit 3;
   ```
   Expect usd_discount = 0 on all rows, usd_total unchanged
   from pre-migration values.

c) Confirm /purchases list page still renders (lib/purchases.ts
   selects usd_total - regenerated value should reach the UI
   identically). Open http://localhost:3000/purchases as owner.
   Expect 196 orders, same totals as before.

d) Open any detail page. The Money card's USD section should
   render without crashing. Note: the form-input side will
   complain at TypeScript compile time when 14b.2 lands and
   imports PurchaseOrderRow expecting usd_discount; that's
   when we update PurchaseOrderRow in lib/purchases-types.ts
   to add the new field.

If anything in a-c fails, paste output, do NOT proceed to 14b.2.

If all four checks pass, the migration is good and we move
to 14b.2 (server actions).

== ROUND 14B PLAN (from spec, f566dcf) ==

14b.0 - DB migration. SCAFFOLDED at a2eb8e2. APPLY pending.
14b.1 - Spec on disk. DONE at f566dcf.
14b.2 - lib/purchases-actions.ts with six server actions:
        createPurchaseOrder, markPaidSupplier, markReceived,
        markComplete, markCancelled, markLost.
14b.3 - /purchases/new page. The big create-order form.
        Likely sub-split into 14b.3.1 (server shell),
        14b.3.2 (line-items editor), 14b.3.3 (validation
        + live USD calc + submit). Biggest sub-round.
14b.4 - Detail page action buttons + dialogs, per-state
        affordances per the table in the spec.
14b.5 - End-to-end smoke (create new order, mark paid,
        mark received, mark complete; second order with
        partial receive + cancel). Seller-404 of
        /purchases/new and the new actions.

After 14b.2 lands, also update:
- lib/purchases-types.ts: add usd_discount: number to
  PurchaseOrderRow.
- lib/purchases.ts: add 'usd_discount' to
  PURCHASE_ORDER_COLUMNS, add Number() coercion to
  coercePurchaseOrder.
- app/(dashboard)/purchases/[id]/page.tsx: surface
  usd_discount in the USD breakdown.

== KEY DECISIONS LOCKED FOR ROUND 14B ==

- Status enum gains 'cancelled' and 'lost'. Both TERMINAL.
  Reachable from different points in the ladder.
  cancelled = paid but never arrived; refund received.
  lost = partial receive accepted; missing units written off,
  per-unit landed cost recomputes across surviving units.
- derivedStatus stays UNCHANGED in purchases-types - it derives
  from the four ladder timestamps. cancelled and lost don't
  have their own timestamps; they piggyback on completed_at
  with status != complete. Audit mismatch panel renders
  amber - correct, not a bug.
- usd_discount on purchase_orders: numeric(12,2) NOT NULL
  DEFAULT 0. base + shipping + tax - discount = usd_total.
- Lot numbers: per-line, auto-incremented at receipt time
  (not pre-assigned per-order like the legacy system).
  Each physical receipt event produces its own lot row.
  Format: pure integer, max(existing numeric lot_numbers) + 1.
  Legacy non-numeric lot_numbers ("LOT-1903", "1751") are
  ignored when computing max. Partial receives create NEW
  lots on each call.
- Transport on create-order form: SHORTCUT field that writes
  to courier_payments + courier_payment_allocations
  atomically. ONE source of truth for transport amounts.
  Fixes the double-entry bug from the legacy system. If
  blank on create, transport stays null on lines; can be
  added later via 14c.
- Supplier picker: COMBOBOX (typeahead + create-on-blur).
  Free text matching kind='supplier' rows. New name on
  blur creates a new suppliers row with kind='supplier'.
  No other supplier fields collected at create time
  (a future suppliers admin can fill in contact info).
- Action affordances by state:
    pending       -> Mark paid, Cancel
    paid_supplier -> Mark received, Mark lost, Cancel
    received      -> Mark complete, Mark lost
    complete/cancelled/lost -> (terminal, no actions)
  Buttons that aren't allowed are NOT rendered (not disabled).

== DATA-LAYER OBSERVATIONS CARRIED FROM 14A ==

- exchange_rate = 0.0000 on unpaid migration rows (sentinel).
  Detail page treats 0 same as null for "is paid" check.
- isPaid() currently requires paid_at_dop NOT NULL. Some
  legacy complete orders have dop_paid_total set but
  paid_at_dop NULL (migration recorded amount, not date).
  Those render as "Not paid yet" on detail. One-line
  loosening of isPaid() would fix; deferred. Could fold
  into 14b.3 if it bothers during testing.
- "(unknown)" supplier rows in 14a list = supplier_id points
  at deleted suppliers row. v1 leaves as-is. New combobox
  prevents new orphans going forward.
- 182 of 196 orders flag status mismatch (93%). Migration
  didn't backfill completed_at on 'complete' rows. A one-shot
  SQL backfill of completed_at would clean it up. Out of
  14b scope but worth knowing.

== POWERSHELL HEREDOC BUG (CRITICAL, from 14a.2 work) ==

PowerShell @'...'@ heredocs piped to Set-Content EAT the
opening '<' character when it ends a line. Symptom: TypeScript
multi-line generics like:

  const x = new Map<
    string,
    Value
  >()

land on disk as:

  const x = new Map
    string,
    Value
  >()

Causing build errors like "Expected ',', got ';'" or
"Parenthesized expression cannot be empty."

WORKAROUNDS:
1. PREFERRED: write all generics on a single line.
   const x = new Map<string, Value>() -- safe.
2. PATCH AFTER THE FACT: regex with (?m) multiline mode:
   $pattern = '(?m)^(\s+const x = new Map)$'
   $replacement = '$1<'
   $new = $content -replace $pattern, $replacement
   Set-Content -LiteralPath $path -Value $new -Encoding utf8 -NoNewline

Search the file with `Select-String -Pattern "new Map$"`
to find all broken sites. Hit twice in 14a; cost ~15 minutes
total.

== TYPES-SPLIT PATTERN (REAFFIRMED 14a.2) ==

Client components MUST import types from lib/<thing>-types.ts,
NOT from lib/<thing>.ts. The server lib imports next/headers
transitively via createClient, which crashes when pulled into
a client bundle even though the type imports are erased at
compile time.

Current splits:
- lib/exchange-rates-types.ts + lib/exchange-rates.ts
- lib/store-config-types.ts + lib/store-config.ts
- lib/purchases-types.ts + lib/purchases.ts

When 14b.2 adds lib/purchases-actions.ts, that file should
NOT add new exports -- anything client components consume
goes in purchases-types.ts. The actions file imports types
from purchases-types itself.

== 14B SPECIFIC GOTCHAS TO REMEMBER ==

- createPurchaseOrder is the biggest action: header upsert,
  optional supplier creation, lines, optional inline supplier
  payment with allocation math, optional inline courier
  payment + allocation + transport-share math. Do it in
  ONE transaction (RPC-style) to avoid partial states if
  one of the legs fails. Supabase client doesn't directly
  expose transactions; the right pattern is a Postgres
  function (CREATE FUNCTION ... LANGUAGE plpgsql) that does
  the multi-step write, called via supabase.rpc(). Same
  pattern as confirm_pos_sale from the sales chain.
  Worth designing carefully before writing.

- markPaidSupplier and createPurchaseOrder's inline-payment
  mode share the SAME allocation math. Extract into a
  private helper from day one rather than duplicating.

- markReceived needs the lot_number generation. Pure
  select-max approach is fine for one-owner usage. If you
  want it to be a real sequence, that's an additional
  schema migration; out of 14b scope unless it bites.

- shadcn doesn't ship a Combobox primitive by default - it's
  a Command + Popover composition shown in their docs. The
  Sales POS already has a product search box; reuse that
  pattern shape if applicable for supplier and product
  pickers.

== POWERSHELL / DEV GOTCHAS (RECAP) ==

- @'...'@ heredoc eats '<' at line end (above). Single-line
  generics, or regex patch after.
- Turbopack dev cache can break specific routes. Resolved by
  stopping `npm run dev`, deleting `.next`, restarting.
- Newly created files with no importers won't trigger Turbopack
  compilation. Type errors first appear when a consumer imports.
- Commit messages via @'...'@ piped to Set-Content
  .commitmsg.txt then `git commit -F`. Cosmetic UTF-8 BOM
  on commit subject is harmless.
- For paths with brackets, use -LiteralPath.
- PS 5.1's Set-Content -Encoding has no utf8NoBOM, only utf8.

== INFRA ==

SUPABASE_SERVICE_ROLE_KEY in .env.local. Never committed
(confirmed via git ls-files). Only lib/supabase/admin.ts is
allowed to use it; has `import 'server-only'` at the top.
ssr client (lib/supabase/server.ts) respects RLS as of
Round 11.10.

== SEARCH ==

Use conversation_search liberally. Useful queries:
  "Round 14b spec migration usd_discount"
  "Round 14b createPurchaseOrder action"
  "purchase_status enum cancelled lost"
  "Round 14a.2 list page split client types"
  "PowerShell heredoc Map angle bracket eaten"
  "createPurchaseOrder Postgres function rpc"
  "shadcn combobox supplier picker"

== PICK UP AT ==

Round 14b.0 -- APPLY the migration committed at a2eb8e2.

Files on disk, NOT yet executed:
  db/migrations/round-14b-purchases-write.sql
  db/migrations/round-14b-purchases-write-rollback.sql

Procedure: open Supabase SQL editor, paste the forward
migration, execute. Then run the four smoke checks listed
in IMMEDIATE NEXT STEP above. If all four pass, proceed to
14b.2 (lib/purchases-actions.ts).

After applying, the IMMEDIATELY-FOLLOWING small commits
should be:
  1. Update PurchaseOrderRow in lib/purchases-types.ts to
     include usd_discount: number.
  2. Update PURCHASE_ORDER_COLUMNS in lib/purchases.ts to
     include 'usd_discount'.
  3. Update coercePurchaseOrder in lib/purchases.ts to
     Number()-coerce usd_discount.
These are the minimal type-side changes that keep 14a
compiling after the migration. They should ship as one
small post-migration commit BEFORE 14b.2 begins, so the
type system reflects the DB.
