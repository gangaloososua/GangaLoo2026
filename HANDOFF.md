Continuing Gangaloo admin build (Next.js 16 + Turbopack + Netlify +
shadcn/ui + Supabase SSR + Tailwind v4). Project:
`C:\Users\Perkins\Documents\Apps\GangaLoo New 05-26\gangaloo-admin\`.
Migration SQLs in admin repo at `db\migrations\`.
Remote: https://github.com/gangaloososua/GangaLoo2026.git (private).
Last pushed: a08b1bb (origin/master).

== INSTRUCTIONS TO THE NEXT SESSION ==

Go step by step. Give ONE PowerShell command (or one SQL paste, or
one git command) per response. Wait for the user's output before the
next step. The user prefers this rhythm; don't bundle "do X then Y
and paste Z" - do X, wait, then Y, wait.

When asking the user to write large generated code blocks, briefly
say what the file IS and what they'll do with it BEFORE the code.
For files over ~200 lines (or full-file rewrites), deliver as a
download via present_files; the user copies into the project via
Move-Item (use -Force when overwriting an existing file). Always back
up the file being replaced first (Copy-Item to .bak), then clean ALL
.bak before committing (Get-ChildItem -Recurse -File -Filter *.bak |
Remove-Item). A stray .bak slipped into a commit once (Round 23) -
clean them every time and check `git status` before staging.

The user has tap-pickable options (ask_user_input_v0) and prefers
those for choices. The user is the BUSINESS OWNER, not the dev -
explain in plain language, avoid jargon. ALWAYS add an "explain
first" option to technical multi-choice questions; the user uses it
heavily. When they say "choose for me, most correct" - pick and
justify briefly. The user refines design mid-build constantly (this
session: grouped category dropdowns, newest-first sort, category
picker per payout) - expect it and re-confirm scope before coding.
The user pushes hard and will keep going late; OFFER to stop at clean
checkpoints, especially before risky/central work.

DESIGN-FIRST: verify schema with a read-only query before assuming a
column/shape exists. This session that paid off repeatedly (e.g.
create_courier_payment does NOT touch balances; balances never
reconciled with the ledger; account_categories is a 2-level tree).

== SUPABASE SQL EDITOR GOTCHAS ==

- DO NOT trust BEGIN/ROLLBACK for state-changing RPCs: the editor
  wraps every Run in a transaction, so a 2nd-statement error rolls
  back the 1st too. Smoke ONE state-changer per Run. Verification
  SELECTs in the same paste are fine. Negative tests get their OWN
  Run. Sequences do NOT roll back. (Round 24e: a verify SELECT with
  ORDER BY inside a UNION arm errored and rolled back its whole Run -
  the DELETE didn't take. UNION ORDER BY can only see output cols;
  put per-arm ORDER BY in a scalar subquery instead.)
- The editor only DISPLAYS the LAST result set of a multi-SELECT
  Run. Run SELECTs one at a time, or UNION them into one. CAUTION:
  UNION columns must share a type - cast enums to ::text (a
  commission_status vs text mismatch errored this session).
- `check` is a reserved word; `FOR UPDATE` cannot combine with an
  aggregate (lock with PERFORM ... FOR UPDATE first, then SUM).
- pg_get_functiondef: use `select pg_get_functiondef(oid) from
  pg_proc where proname='...' and pronamespace='public'::regnamespace;`
- To find the enum type behind a column when typname guesses fail:
  select e.enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid
  where t.oid = (select atttypid from pg_attribute
    where attrelid='public.TBL'::regclass and attname='COL');
- FK target table: select confrelid::regclass from pg_constraint
  where conname='TBL_col_fkey';

== JWT IMPERSONATION FOR RPC SMOKES ==

SQL editor has auth.uid()=NULL by default; SECURITY DEFINER RPCs with
owner/admin gates reject. To smoke one (JWT + SELECT in the SAME Run):
  SET LOCAL request.jwt.claims =
    '{"sub":"3f135a05-76fb-4859-9009-3a0b606815c1","role":"authenticated"}';
  SELECT public.your_rpc(...);
User's auth_user_id: 3f135a05-76fb-4859-9009-3a0b606815c1
User's profile id:    17b11149-5480-4716-8a55-5f7905c94543

== TYPE-CHECKING - CLEAN + GUARDED ==

- `npm run typecheck` (tsc --noEmit). .git/hooks/pre-commit runs it
  before EVERY commit and BLOCKS on error. Escape: git commit
  --no-verify. Hook is local (not in repo). Every commit this session
  passed it; type-check was clean on first try every time.

== POWERSHELL EDIT PATTERNS ==

- USE THIS PATTERN (worked every time): detect newline once, count
  each anchor exactly once, write only if ALL == 1:
    $abs=(Resolve-Path -LiteralPath "path").ProviderPath
    Copy-Item -LiteralPath $abs -Destination "$abs.bak"   # if replacing
    $raw=[System.IO.File]::ReadAllText($abs)
    $nl = if ($raw -match "`r`n") {"`r`n"} else {"`n"}
    $edits=@(@{old="...";new="...$nl..."}, ...)
    $ok=$true; foreach($e in $edits){
      $c=([regex]::Matches($raw,[regex]::Escape($e.old))).Count
      if($c -ne 1){Write-Host "ABORT $c";$ok=$false}}
    if($ok){foreach($e in $edits){$raw=$raw.Replace($e.old,$e.new)}
      [System.IO.File]::WriteAllText($abs,$raw,
        [System.Text.UTF8Encoding]::new($false));Write-Host "OK"}
- LESSON (cost 2 rounds twice): do NOT add "dual-newline" cleverness
  that counts both `n and `r`n forms - for single-line anchors the two
  strings are identical and it double-counts -> false ABORT. Keep the
  simple single-count pattern above.
- PREFER SINGLE-LINE anchors. Multi-line anchors break on mixed
  LF/CRLF. Files are mostly LF with the odd stray CRLF.
- For big files / full rewrites, regenerate the whole file (cat >
  here in the container) and deliver via present_files, rather than
  many fragile surgical anchors. Used for all the table/form rebuilds,
  and in Round 24e for all three full-function CREATE OR REPLACEs.
- New file (no overwrite): no .bak needed, just Move-Item. Overwrite:
  Copy-Item to .bak, then Move-Item -Force.
- KNOWN: German PS console prints "AUSFÜHRLICH" for -Verbose (= VERBOSE);
  harmless. "LF will be replaced by CRLF" git warning harmless.
  Em-dash shows as mojibake in console but stored correctly (UTF-8).
- Select-String over the repo: EXCLUDE node_modules or it hangs for
  ages. Scope to your dirs (app, lib, db) or pass -Include and a
  narrowed Get-ChildItem path. (Round 24e: an unscoped recursive
  Select-String appeared to "stick" - it was just grinding node_modules;
  Ctrl+C, then re-scope.)

== STATE: WHAT IS DONE ==

ROUND 23 - COMMISSIONS (report + payout tracking) - COMPLETE:
  Nav 'Commissions' (HandCoins, /commissions, OWNER_ONLY).
  Page app/(dashboard)/commissions/: owner/admin only. Two sections:
   - Owed: per-earner table, split "Ready to pay" (sale status=paid)
     vs "Awaiting collection" (confirmed|partially_paid), drill-down
     to the individual sales behind each total. Refunded sales
     excluded from owed.
   - Recent payouts: history of commission_payouts.
  "Record payment" dialog: tick which commission lines to pay
  (ready pre-ticked), pick money account, pick EXPENSE CATEGORY
  (added Round 24c), optional note.
  Data layer lib/commissions.ts: fetchCommissionsOwed,
  fetchCommissionDetail(earnerId), fetchPayoutHistory.
  Action recordCommissionPayout (commissions/actions.ts) -> RPC.

ROUND 24 - ACCOUNTING / LIVE LEDGER - IN PROGRESS (Stage 1 done,
Stage 2 SALES path done; only Purchases remains):
  DECISION (owner): the transactions table IS the live accounting
  ledger going forward. Every money event posts a row AND moves the
  account balance. Legacy opening-balance gaps are ACCEPTED and the
  owner corrects them MANUALLY via the manual tool - we do NOT try to
  reconcile the migration-day snapshot in code.

  24a POSTING ENGINE (db/migrations/round-24a-posting-engine.sql):
   - post_transaction(jsonb): owner/admin, atomic. Inserts one txn
     and does balance_cents += amount_cents. SIGN CONVENTION: income/
     inflow = POSITIVE amount, expense/outflow = NEGATIVE. Any
     source_* link -> is_manual=false; none -> is_manual=true.
     Payload: money_account_id, category_id, amount_cents (SIGNED),
     scope, occurred_at (opt, default now), description (opt),
     source_* (opt). No negative-balance block (no account blocks).
   - reverse_transaction(uuid): owner/admin, atomic. balance -=
     amount, then DELETE the row. Used by delete + edit.
   Smoke-tested both on Test account; reversed clean.

  24b MANUAL TRANSACTIONS TOOL - app/(dashboard)/accounting/:
   Nav 'Accounting' (BookOpen, /accounting, OWNER_ONLY).
   - page.tsx: owner/admin, reads URL filters, fetches + renders.
   - lib/transactions.ts: fetchTransactions(filters: account/category/
     type/from/to/search; cap 500), listAccountCategories() (returns
     parentId), listAccountsForFilter(). Sorted created_at DESC then
     occurred_at DESC = "newest ENTERED on top" (owner's explicit
     choice; legacy rows share import created_at so their internal
     order ~ import order, accepted).
   - actions.ts: addTransaction (post_transaction), deleteTransaction
     (reverse_transaction), editTransaction (reverse THEN post, so
     balance stays consistent). User types a POSITIVE amount; the
     category's TYPE decides the sign (expense/liability -> negative,
     else positive).
   - transaction-form.tsx: add/edit dialog. Category dropdown GROUPED
     by parent (parent = non-selectable heading; only leaf subs +
     childless top-levels are pickable; childless tops bucketed under
     "<Type> (general)"). Account, amount (RD$, always positive),
     date, scope, description.
   - transactions-table.tsx: ledger list, grouped category FILTER,
     account/type/date/search filters, Add button, per-row Edit/Delete
     (delete has a confirm dialog; income green +, expense red -; AUTO
     tag on non-manual rows).
   Browser-tested add/edit/delete; balances synced both ways; cleaned.

  24c COMMISSION PAYOUTS POST TO LEDGER (Stage 2 event 1)
   (db/migrations/round-24c-commission-payout-posts-ledger.sql):
   record_commission_payout now ALSO posts a commission EXPENSE via
   post_transaction (negative, source_commission_payout_id, AUTO),
   moving the balance. New required payload key 'category_id' (picked
   in the payout dialog; expense categories only). Smoke + live UI
   test done and reversed.

  24d COURIER PAYMENTS POST TO LEDGER (Stage 2 event 2)
   (db/migrations/round-24d-courier-payment-posts-ledger.sql):
   create_courier_payment DROPPED + recreated with 8th arg
   p_category_id (default null). PO landed-cost recompute block is
   BYTE-FOR-BYTE unchanged; only category validation + a trailing
   post_transaction call are new. Amount is in PESOS on
   courier_payments -> converted *100 to cents, posted NEGATIVE,
   dated to p_paid_at, linked source_courier_payment_id (AUTO).
   Frontend: courier-payments/new/page.tsx fetches expense cats;
   new-courier-payment-form.tsx has grouped category picker;
   courier-payments/actions.ts passes p_category_id.
   TESTED ON A REAL PAYMENT (see TEST DATA NOTES) - works.

  24e SALES POST TO LEDGER (Stage 2 events 3-5) - COMPLETE:
   (db/migrations/round-24e-sales-post-to-ledger.sql). Stage 2 SALES
   path done; only Purchases remains for Stage 2.
   - NEW HELPER post_sale_payment_to_ledger(p_money_account_id,
     p_category_id, p_amount_cents SIGNED, p_scope, p_occurred_at,
     p_description, p_source_sale_id, p_source_sale_payment_id,
     p_created_by) -> uuid. A trimmed twin of post_transaction: same
     row-lock + insert + balance += amount, BUT no owner/admin gate
     (sellers ring up POS sales and must NOT be blocked) and created_by
     is PASSED IN (not auth.uid()). No-ops on zero/null amount (protects
     the shipping-split rounding edge). is_manual=false always.
   - confirm_pos_sale: posting loop at end. One line per sale_payment
     into the account it landed in, category Shop Sales, credited to the
     selling user. Unpaid sale -> no payment rows -> posts nothing
     (correct). POS has NO cancel path; undo a POS sale's money BY HAND
     in the Accounting tool.
   - create_online_order: posting loop SPLITS each payment - product
     share -> Seller Sales, shipping share -> Shipping Revenue,
     proportional to the order; product share = REMAINDER so the two
     always sum to the exact payment (no drift). No-shipping order ->
     single Seller Sales line.
   - mark_cancelled_online: refund loop MIRRORS the order's original
     posted ledger lines as NEGATIVES (same account/category/amount,
     sign flipped), keyed off source_sale_id. Exact mirror, no re-split.
     Orders with no original lines (legacy / pre-24e) refund nothing
     (correct - they never posted income).
   - FRONTEND UNCHANGED: categories are chosen server-side (hard-wired
     ids), so the three RPC call sites pass no new input and read the
     same return. Verified call sites: sales/actions.ts
     (confirm_pos_sale ~448), online-orders/actions.ts (create ~116,
     cancel ~242). typecheck clean.
   - Smoked end-to-end on Test account + real product, ALL REVERSED:
     helper post x1; POS sale FAC-2893; online order ONL-0007 (split
     summed to exact payment); full create+cancel round-trip ONL-0008
     (4 lines net 0, balance returned to 10050).

== KEY VERIFIED SCHEMA FACTS (this session) ==

 - transactions (THE LEDGER): money_account_id, category_id (NOT NULL
   -> account_categories), amount_cents BIGINT (SIGNED: income +,
   expense -), scope (account_scope), occurred_at, description,
   source_sale_id / source_sale_payment_id / source_purchase_order_id
   / source_courier_payment_id / source_commission_payout_id /
   source_transfer_id (all nullable), is_manual, created_at,
   created_by (-> profiles.id), legacy_id, legacy_reference, is_initial.
   ALL existing rows are from the legacy import (frozen snapshot);
   nothing posted live before Round 24. Breakdown then: 525 manual,
   188 purchase, 155 sale, 82 other/unlinked, 9 commission payout, 0
   courier. (Courier, commission, AND sales now post live.)
 - account_categories: 2-LEVEL tree (parent_id). type (account_type:
   income|expense|asset|liability|equity), scope (account_scope:
   business|private|mixed), supplier_id, is_system, is_active,
   display_order. ONE is_system row: "Sales" (income) - LEFTOVER
   default, NOT under Revenue, sales do NOT use it (see income tree
   below). Some top-levels have NO children (e.g. income "Refunds")
   so "only subs pickable" would hide them -> rule used everywhere:
   leaf nodes pickable, parents WITH children are headings only.
   Commission expense cats: "Comission Ana/Delia/Joel/Micalove" under
   Business Expense. Courier expense subs (real names!): Liberty
   Express, Blumbox, Logic Paq, Hola, Amazon Prime under "Courier".
 - INCOME CATEGORY TREE (Round 24e): parent "Revenue"
   (d1092177-7efd-4972-87c8-5ffa0be5cfee) has children: Seller Sales
   (27ff0912-3dbf-4d07-9973-308f9c270e76), Shop Sales
   (870f61ba-ac8c-47bf-9ed0-52e935a78136), Shipping Revenue
   (0fb05271-ec32-4b80-9d6b-505b4ffc9bbe), App Revenue, Private
   Consumption, Orders Aliexpress/Amazon/Ebay/Shein/Temu. Mapping used:
   POS -> Shop Sales, online -> Seller Sales (+ shipping -> Shipping
   Revenue). These three ids are HARD-WIRED in the 24e functions.
 - SALE FUNCTIONS: confirm_pos_sale (POS) and create_online_order both
   record payments in sale_payments (each row: money_account_id +
   amount_cents + paid_at). NO "collect rest later" step - all customer
   money is recorded at sale creation. Only 3 fns touch sale_payments:
   the two creators + mark_cancelled_online (writes mirror-NEGATIVE
   payment rows on cancel, reference 'CANCEL <id>'; restores stock via
   return_in; voids pending commissions). POS has NO cancel fn. Online
   order total = subtotal - discount + shipping; POS has no shipping.
 - ENUMS: fulfillment_method = delivery | in_store | pickup.
   payment_method = card | cash | credit | mixed | paypal | stripe |
   transfer.
 - sale_payments cols: id, sale_id, method (payment_method),
   amount_cents (INT), money_account_id, paid_at (timestamptz),
   reference (text), receipt_id, created_at, legacy_id, legacy_receipt_id.
 - money_accounts: balance_cents BIGINT, initial_balance_cents,
   currency, scope (account_scope), kind (bank|card|cash|credit_line|
   digital), is_active, allow_negative, group_tag, legacy_id. NO
   trigger and NO function maintained balance before Round 24
   (createAccount sets balance=initial; code comment "only
   transactions move the balance"). Balances do NOT reconcile with
   initial+sum(transactions) - big gaps (accepted, fixed manually).
   List defaults to business scope; "Show private + mixed" toggle
   reveals private accounts (e.g. Cash DOP Privat). Read layer
   lib/money-accounts.ts (listAccounts, getAccount); edit at
   money-accounts/actions.ts (createAccount/updateAccount only -
   never writes balance directly).
 - sale_commissions: sale_item_id, earner_id (-> profiles.id),
   earner_role (enum seller|distributor), percent, amount_cents,
   status (commission_status: pending|paid|void), payout_id, created_at.
 - commission_payouts: earner_id, total_cents, money_account_id,
   paid_at, period_start, period_end, notes.
 - sale_items: sale_id, product_id, qty, unit_price_cents,
   discount_cents, line_total_cents, seller_commission_percent,
   distributor_commission_percent, cogs_cents.
 - sales: invoice_number, source, status, customer_id, seller_id,
   source_warehouse_id, fulfillment_warehouse_id, fulfillment_method,
   subtotal/discount/tax/shipping/total/paid/cogs/gross_profit _cents,
   sold_at, confirmed_at, paid_at, refunded_at, refund_reason, etc.
   (status values seen on pending commissions: paid, partially_paid,
   confirmed.)
 - PEOPLE vs USERS: both are VIEWS of the same `profiles` table
   (People = full contact list incl customers/distributors; Users =
   login accounts). People form/actions write `profiles`. profiles
   name col is full_name.
 - SUPPLIERS / COURIERS: a SEPARATE `suppliers` table (kind='courier'
   for couriers). NO UI anywhere edits suppliers (only pickers read
   via lib helpers like listCouriersForPicker). Courier names are
   messy legacy junk (numbers like 1781/1835, plus "Courier","LOT").
 - Functions now: confirm_pos_sale (posts ledger), create_online_order
   (posts ledger), mark_cancelled_online (posts refund mirror),
   create_purchase_order, mark_* lifecycle, resolve_line_discounts,
   adjust_stock, record_commission_payout (posts ledger),
   create_courier_payment (8-arg, posts ledger), post_transaction,
   reverse_transaction, post_sale_payment_to_ledger (NEW 24e helper).
 - Formatters lib/format.ts: formatDOP(cents) [es-DO], formatDate /
   formatDateTime [en-GB]. "never inline a new Intl call."
 - shadcn: Checkbox added (npx shadcn add checkbox). Select exports
   SelectGroup + SelectLabel. Dialog exports confirmed.

== COMMITS (newest last) ==
  Round 23/24a-d session started origin at 2b95c6d.
  807d1a4 Round 23: commissions data layer + record_commission_payout RPC
  365a9cc Round 23: commissions report + payout UI
  18fc2d2 Round 23: remove stray .bak backup file
  8443124 Round 24a: accounting ledger posting engine
  7fdfc85 Round 24b: manual transactions tool
  bf22365 Round 24c: commission payouts post to ledger
  fc8b609 Round 24d: courier payments post to ledger
  a08b1bb Round 24e: sales post to ledger (POS->Shop Sales,
          online->Seller Sales+Shipping split, cancel mirrors)
  origin/master tip: a08b1bb.

== TEST DATA NOTES ==
 - All SQL/UI smokes (engine, commission payout x2, manual LIVE TEST
   x3) were reversed. Test account restored to 10050 (RD$100.50).
 - ONE REAL TRANSACTION recorded and KEPT: a real courier payment via
   the new form - Cash DOP Privat -RD$149.00, courier "Courier",
   posted to the ledger (AUTO), balance Cash DOP Privat now
   RD$16,021.00. This is REAL - do NOT reverse.
 - Commission "088eb14b..." for Delia is RD$25.00 (a flawed diagnostic
   query once mis-read it as 102000 - the commission was never
   changed; our code never touches commission amounts).
 - Round 24e smokes ALL reversed (helper post x1; POS sale FAC-2893;
   online order ONL-0007; create+cancel ONL-0008). Test account back to
   10050. Sequences burned (do NOT roll back): FAC-2893, ONL-0007,
   ONL-0008.

== KNOWN COSMETIC / DEFERRED ==
 - Money Accounts page shows the "₱" symbol, not "RD$" - a separate
   formatting spot from the accounting pages (which use formatDOP =
   RD$). Tidy later.
 - Ledger description for the courier payment reads "Courier payment —
   Courier" because the courier's name literally is "Courier" (legacy).
   Improves once couriers are renamed.
 - Stray duplicate account_categories exist (two "Refunds", "Aldi",
   "Colmador", "Additional Stuff") - cleanup someday.

== ROADMAP (remaining) ==

 24 (FINISH ACCOUNTING STAGE 2 - automatic syncing) - SALES done in
    24e; ONE event remains:
    - PURCHASES -> ledger + balance. Post the expense when a PO is
      paid (status paid_supplier?). Similar to courier/commission.
      Decide category (per-supplier expense cats exist like Alibele,
      Aliexpress, Ali Coco) + which account. Verify the PO-paid fn
      read-only first. NOTE: post_sale_payment_to_ledger is sale-named
      (source_sale_* args); for purchases either add a parallel helper,
      generalise it, or just reuse post_transaction's shape.
 25 Real-numbers dashboard - live revenue/profit, now feasible as the
    ledger fills with real postings (sales now post live as of 24e).
 26 Spanish UI (i18n) - flip en-GB call sites to es-DO. JUMP AHEAD if
    sellers (Delia, Estafany, Fabienne; Sophia ran a test sale) go
    live before the rest is done.

 Smaller adds that surfaced:
  - COURIERS / SUPPLIERS management screen - there is NO UI to add or
    rename suppliers/couriers (separate `suppliers` table, not People).
    Courier names are messy legacy values. Build a small CRUD screen
    (or extend People to cover suppliers). User explicitly wants this
    "later".
  - Write-offs / shrinkage report (from adjustment_out movements).
  - "Add stock: use last lot cost" convenience in the stock-adjust form.

== PICK UP AT ==

Stage 2 of accounting: wire PURCHASES to post to the ledger - the LAST
Stage 2 event. When a PO is paid (status paid_supplier?), post the
EXPENSE (negative) and move the account balance. DESIGN-FIRST: read the
PO-paid function read-only first, then design with the user (tap
options, explain-first): which expense category (per-supplier cats
exist - Alibele, Aliexpress, Ali Coco), and which money account the
payment leaves. Decide whether to add a parallel ledger helper, reuse
post_transaction, or generalise post_sale_payment_to_ledger (currently
sale-named with source_sale_* args). Smoke reversibly in SQL, test in
the browser if the form needs a change, tsc/commit/push. After
Purchases, Stage 2 is fully done -> move to the real-numbers dashboard
(item 25). Follow the usual one-step-at-a-time rhythm throughout.
