Continuing Gangaloo admin build (Next.js 16 + Turbopack + Netlify +
shadcn/ui + Supabase SSR + Tailwind v4). Project:
`C:\Users\Perkins\Documents\Apps\GangaLoo New 05-26\gangaloo-admin\`.
Migration SQLs in admin repo at `db\migrations\`.
Remote: https://github.com/gangaloososua/GangaLoo2026.git (private).
Last pushed: 2b95c6d (origin/master).

== INSTRUCTIONS TO THE NEXT SESSION ==

Go step by step. Give ONE PowerShell command (or one SQL paste, or
one git command) per response. Wait for the user's output before the
next step. The user prefers this rhythm; don't bundle "do X then Y
and paste Z" - do X, wait, then Y, wait.

When asking the user to write large generated code blocks, briefly
say what the file IS and what they'll do with it BEFORE the code.
For files over ~200 lines (or full-file rewrites), deliver as a
download via present_files; the user copies into the project via
Move-Item. Always back up the file being replaced first
(Copy-Item to .bak), then clean the .bak before committing.

The user has tap-pickable options (ask_user_input_v0) and prefers
those for choices. The user is the BUSINESS OWNER, not the dev -
explain in plain language, avoid jargon. ALWAYS add an "explain
first" option to technical multi-choice questions; the user uses it
heavily. When they say "choose for me, most correct" - pick and
justify briefly. The user often refines the design mid-build (e.g.
asked for subcategory grouping, then per-warehouse columns) - expect
it and re-confirm scope before coding.

DESIGN-FIRST: verify schema with a read-only query before assuming a
column/shape exists. This session turned up facts that changed plans
(categories are a 2-level tree; products have NO category col - M:N
via product_categories.is_primary; NO reorder-level column anywhere;
NO pre-existing stock-adjust RPC). The commit guard catches wrong
assumptions, but verify first to save rounds.

== SUPABASE SQL EDITOR GOTCHAS ==

- DO NOT trust BEGIN/ROLLBACK for state-changing RPCs: the editor
  wraps every Run in a transaction, so a 2nd-statement error rolls
  back the 1st too. Smoke ONE state-changer per Run. Verification
  SELECTs in the same paste are fine. Negative tests get their OWN
  Run. Sequences do NOT roll back.
- The editor only DISPLAYS the LAST result set of a multi-SELECT
  Run. Run SELECTs one at a time, or UNION them into one.
- `check` is a reserved word - don't use it as a column alias
  (ORDER BY check fails). `FOR UPDATE` cannot be combined with an
  aggregate (SUM): lock rows with PERFORM ... FOR UPDATE first, then
  SUM separately (this bit us in adjust_stock; fixed).
- pg_get_functiondef needs the OID or exact signature; the
  '::regprocedure' cast on a name string can error. Use:
  select pg_get_functiondef(oid) from pg_proc where proname='...';

== JWT IMPERSONATION FOR RPC SMOKES ==

SQL editor has auth.uid()=NULL by default; SECURITY DEFINER RPCs
with RBAC gates reject. To smoke one (JWT + SELECT in the SAME Run,
SET LOCAL is per-transaction):
  SET LOCAL request.jwt.claims =
    '{"sub":"3f135a05-76fb-4859-9009-3a0b606815c1","role":"authenticated"}';
  SELECT public.your_rpc(...);
User's auth_user_id: 3f135a05-76fb-4859-9009-3a0b606815c1
User's profile id:    17b11149-5480-4716-8a55-5f7905c94543

== TYPE-CHECKING - CLEAN + GUARDED ==

- package.json script: "typecheck": "tsc --noEmit" -> `npm run typecheck`.
- .git/hooks/pre-commit runs typecheck before EVERY commit and BLOCKS
  on any error. ESCAPE HATCH: `git commit --no-verify`. Hook is a
  /bin/sh script with LF endings, lives in .git/hooks/ (LOCAL, not in
  repo - a fresh clone won't have it; re-create if needed).
- Baseline is a confirmed-live zero. Every commit this session passed
  the guard.

== POWERSHELL EDIT PATTERNS (work well) ==

- ONE-LINER .NET read/replace/write (preserves endings, no BOM):
  $abs = (Resolve-Path -LiteralPath "path").ProviderPath
  $raw = [System.IO.File]::ReadAllText($abs)
  detect: $nl = if ($raw -match "`r`n") { "`r`n" } else { "`n" }
  write: [System.IO.File]::WriteAllText($abs, $new,
         [System.Text.UTF8Encoding]::new($false))
- ALL-OR-NOTHING multi-edit: build array of @{old;new}, count each
  ([regex]::Matches($raw,[regex]::Escape($old))).Count, write only if
  ALL counts == 1, else ABORT untouched. Used constantly; very safe.
- PREFER SINGLE-LINE anchors. Multi-line anchors break on mixed
  LF/CRLF. Files here are mostly LF with the odd stray CRLF.
- EXACTLY-ONCE GUARD catches duplicate anchors (e.g. an identical
  <StockOnHandTable rows={stock} /> appeared in both seller branch
  and owner tab - count came back 2, aborted; fixed by anchoring with
  surrounding context).
- LINE-RANGE replacement (when a whole function span changes and text
  anchors are risky): ReadAllLines, slice $before/$after by index,
  splice new lines, join with $nl. Used to rewrite fetchStockOnHand.
- Append-guard: check for the actual declaration string
  ('export async function fooBar'), NOT a bare word that also appears
  in a comment (a comment mention of fetchStockMovements caused a
  false "ALREADY PRESENT").
- KNOWN: prompt stuck at >> after a pasted block -> Ctrl+C (not Enter).
- KNOWN: don't append a closing ``` code-fence to a command - PS
  chokes on stray backticks (happened once; Move-Item still ran).
- KNOWN: pasting prior console OUTPUT back into PS runs it as
  commands -> red errors; harmless, just re-run the real command.
- KNOWN: git "LF will be replaced by CRLF" warning is harmless.
- Em-dash in files shows as mojibake in the PS console but is stored
  correctly (UTF-8).

== STATE: WHAT IS DONE ==

DISCOUNT ENGINE - ALL 5 KINDS COMPLETE:
  customer_override, club_tier, bulk, promotion, logistics_surcharge.
  (logistics_surcharge was reframed: it is NOT a discount_rules kind
  in the end - see below.)

LOGISTICS / DELIVERY FEES (Round 21):
  Stored in store_config key 'delivery_fees' (jsonb): localDeliveryCents,
  nationalDeliveryCents, localCities[], warehousePickupFees[] (from->to
  pairs). Managed at Settings -> Delivery & Pickup Fees
  (app/(dashboard)/settings/delivery-fees/). Types + defaults in
  lib/store-config-types.ts (DeliveryFees, WarehousePickupFee,
  DELIVERY_FEES_KEY, DELIVERY_FEES_DEFAULTS); loader fetchDeliveryFees()
  in lib/store-config.ts; save action saveDeliveryFees in the page's
  actions.ts. Online order form auto-fills shipping_cents from these
  (city dropdown of local cities + "Other" one-off; cross-warehouse
  pickup pair fee; manual override wins via shippingManuallyEdited +
  "Use suggested" link). City match is accent/case/space-insensitive;
  unknown city -> national fee. POS sales form untouched (in-store).

INVENTORY MODULE - FULLY COMPLETE (Round 22 -> 22.9):
  Nav 'Inventory' (/inventory, Boxes icon, roles ALL) already existed.
  Role-aware page (app/(dashboard)/inventory/page.tsx): owners/admins
  get tabs Dashboard / Stock on hand / History / Adjust stock;
  sellers/distributors get ONLY the stock-on-hand view (no costs, no
  tabs). Owner check = isOwnerEquivalent(caller.role) from
  lib/auth/roles (NOT isAdminRole - that includes seller/distributor).

  Data layer: lib/inventory.ts. Functions:
   - fetchStockOnHand(warehouseId?) -> StockOnHandRow[] (productId,
     productName, warehouseId, warehouseName, categoryId(top-level),
     categoryName, qtyOnHand). Sums ALL lots incl. zero (so ran-out
     pairings appear); filter is >= 0.
   - fetchStockMovements(filters) -> ledger; filters warehouseId,
     productId, categoryId(parent rolls up subcats), kind, from/to;
     cap 500; joins product/warehouse/profiles(full_name).
   - fetchInventoryDashboardStats() -> totals (on-hand units/value,
     distinct products) + incoming units/value from OPEN POs
     (status pending|paid_supplier only, to avoid double-count).
   - fetchStockByWarehouse() / fetchStockByCategory() -> qty+value,
     category rolled to top-level parent.
   - fetchStockCountSheet({warehouseId?,includeOut?,categoryId?}) ->
     CountSheetRow[] tagged with BOTH parent and subcategory (for the
     print page's Parent->Subcategory nesting).
   - listCategoriesForFilter() -> CategoryOption[] (id,name,parentId);
     searchInventoryProducts(q,limit) -> id/name/sku (warehouse- and
     price-agnostic; NOT the sales searchProductsForSale).
  Actions (app/(dashboard)/inventory/actions.ts): searchLedgerProducts
  (owner/admin), recordStockAdjustment (owner/admin -> adjust_stock RPC).

  UI components in app/(dashboard)/inventory/:
   - inventory-dashboard.tsx: stat tiles + by-warehouse/by-category tables.
   - stock-on-hand-table.tsx: PIVOTED - one product row, a column per
     warehouse (per-cell red=0/amber<=threshold colours), Total col when
     >1 wh; warehouse + category dropdowns, "Low below" box, "show out of
     stock" toggle, product name links to history (owners), "Print count
     sheet" link. Used by BOTH owner stock tab and seller view (seller
     passes no enableHistoryLink).
   - movements-ledger.tsx: ledger table + filters (warehouse/category/
     type/from/to + type-to-search product) + "Export CSV" + Clear.
   - count-sheet/page.tsx + print-button.tsx: printable count sheet,
     per-product pivot with a System column per warehouse + Total,
     grouped Parent->Subcategory, landscape print, auto-opens dialog.
     Read-only (no Counted/Difference cols - earlier design iterated;
     final is system-qty-per-warehouse). Respects warehouse+category
     filters via URL (?warehouse=&category=&out=).
   - adjustment-form.tsx: product search + warehouse + Remove/Add toggle
     + qty + reason dropdown(Damaged/Theft/Lost/Expired/Count correction/
     Other)+note + unit-cost (Add only). Owner-only tab.

  adjust_stock RPC (db/migrations/round-22-9-adjust-stock.sql, DEPLOYED):
   - SECURITY DEFINER, owner/admin gate, atomic.
   - REMOVE: FIFO-consume inventory_lots (oldest received first,
     FOR UPDATE locks) at each lot's unit_cost_dop; writes one
     adjustment_out stock_movements row per lot (negative qty). HARD
     BLOCKS if requested qty > on hand (insufficient_stock error).
   - ADD: inserts a NEW inventory_lots row (lot_number 'ADJ-...') at a
     USER-TYPED unit cost; writes one adjustment_in movement (+qty).
   - reason+note combined into adjustment_reason as "Reason — note".
   - Mirrors confirm_pos_sale's FIFO mechanism exactly. Smoke-tested
     remove/add/over-remove-block; data restored after.

KEY VERIFIED SCHEMA FACTS:
 - inventory_lots is the authoritative live-stock source
   (qty_remaining, unit_cost_dop, lot_number, received_at). Sales
   consume it FIFO via confirm_pos_sale; sale_lot_consumption records it.
 - stock_movements.kind enum: purchase_in, sale_out, transfer_in,
   transfer_out, adjustment_in, adjustment_out, return_in, initial.
   qty_delta +in/-out; adjustment_reason text; created_by -> profiles.id.
 - categories: 2-LEVEL tree (parent_id null = top; 19 parents, 47 subs,
   no deeper). product<->category M:N via product_categories
   (is_primary, is_visible, display_order); up to 3 cats/product;
   category-scoped logic uses PRIMARY, rolled to top-level parent.
 - product_warehouse_settings has NO reorder/min-stock column (low-stock
   threshold is a UI-only adjustable box, default 5).
 - purchase_orders.status enum: pending, paid_supplier, received,
   complete, cancelled, lost. "Incoming" = pending|paid_supplier.
   purchase_order_items.dop_unit_landed_cost is the true landed peso cost.
 - sales: shipping_cents, fulfillment_method enum(in_store|pickup|
   delivery), source_warehouse_id, fulfillment_warehouse_id,
   shipping_city (free text, nullable).
 - store_config is key/value (key text, value jsonb). Complex-value rows
   are skipped by the generic editor; dedicated pages own them (Receipt
   uses store_name/address/phone/rnc; delivery_fees is one jsonb blob).
 - Auth guard (lib/auth/guard.ts): requireAdminCaller()->CallerProfile
   (.role,.id), requireRole(allowed), requireOwner(). roles.ts:
   isOwnerEquivalent(owner|admin), isAdminRole(owner|admin|seller|
   distributor), isSellerRole(seller|distributor). profiles name col is
   full_name.
 - Functions: confirm_pos_sale(jsonb), create_online_order,
   create_purchase_order, mark_* lifecycle, resolve_line_discounts,
   adjust_stock(jsonb). No transfer/stock-adjust fn existed before 22.9.

== COMMITS THIS SESSION (newest last) ==
  (Round 20/20.1 promotion + product picker were a PRIOR session;
   origin started this session at 4553ce5.)
  085de1f Round 21a: Delivery & Pickup Fees settings
  2343a9b Round 21b: auto-fill shipping on online orders
  d95cf92 Round 22: Inventory module (stock-on-hand + ledger)
  1b184a2 Round 22.1: ledger category + product filters
  4562e2b Round 22.2: inventory dashboard (tiles + breakdowns + tabs)
  ac9ccc4 Round 22.3: stock-on-hand grouped by category + filters
  e5dd374 Round 22.4: per-product drill-down
  09ed614 Round 22.5: low-stock highlighting
  d5e7fab Round 22.6: CSV export of ledger
  d2a5e87 Round 22.7: printable count sheet
  e109972 Round 22.8: pivot on-screen stock table (column per warehouse)
  2b95c6d Round 22.9: stock adjustment tool (adjust_stock RPC + UI)
  origin/master tip: 2b95c6d.

== TEST DATA NOTES ==
 - Round 22.9 smoke data fully cleaned + reversed (wax stick
   b28dbc44 at 1-Maranatha restored to 11; no ADJ- lots, no smoke
   movements left).
 - Delivery-fee / discount test fixtures from prior sessions may
   still exist; not audited this session.
 - If the user browser-tested adjustments on real products, those are
   real stock changes - reverse with an opposite adjustment if needed.

== ROADMAP (remaining; user has NOT picked next priority) ==

 23 Cashback / commissions reports - sale_commissions already records
    seller/distributor splits + status (pending). Surface who's owed
    what + payout tracking. Self-contained; good quick win.
 24 Accounting / transactions module - DESIGN-FIRST. PURCHASES and
    COURIER PAYMENTS do NOT post to public.transactions; join-vs-extend
    unresolved. Needs a design conversation before any code. Keystone
    for seeing the money picture.
 25 Real-numbers dashboard - the main dashboard with live revenue/
    profit. Depends partly on #24's data decisions.
 26 Spanish UI (i18n) - flip en-GB call sites to es-DO (en-GB was used
    throughout to avoid hydration mismatches). datetime-local inputs
    inherit browser locale (Perkins's browser is German) - set Spanish
    explicitly. JUMP THIS AHEAD if sellers (Delia, Estafany, Fabienne -
    they have logins; Sophia ran a test sale) go live before the rest
    is done.

 Smaller adds that surfaced this session (optional):
  - Write-offs / shrinkage report: total damage/theft/loss over a
    period, by reason (from the adjustment_out movements now recorded).
  - "Add stock" cost-basis convenience: offer "use last lot cost" in
    the adjustment form (currently always typed). Found-stock at zero
    cost is another option discussed but not built.

== PICK UP AT ==

Inventory module is DONE. Ask the user which roadmap item to start
(23-26 above, or a smaller add). #24 (accounting) needs a design chat
first; #23 (commissions) is the cleanest quick win; #26 (Spanish)
jumps ahead if sellers are going live. Then follow the usual rhythm:
verify schema read-only -> design with the user (tap options, explain
first) -> build in small steps -> tsc/smoke/commit/push.
