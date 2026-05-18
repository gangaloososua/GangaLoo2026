# Round 14 — Purchases module

The new admin has no UI for purchases. Purchase data is fully migrated:
196 orders, 437 line items, 390 inventory lots, 36 courier payments
with 275 cross-order allocations. Sitting in the DB, unreadable from
the new admin.

This is the read-side cutover blocker. Without it, the new admin
can't audit where stock came from or trace a sale's lot trail.

## Phasing

Round 14 ships in three rounds, in order, no other round in between:

- **14a — Read surface (this round).** List + detail + lot trail.
  No writes. Unblocks read-side cutover.
- **14b — Status transitions (later round).** Mark paid / received /
  complete, with the financials each transition writes. Creates
  inventory_lots on receive.
- **14c — Courier payments and allocations (later round).** List +
  create courier payments; allocation UI; landed-cost recomputation.

Anything beyond these three is its own round, not slipped in.

## 14a scope

In scope:
- List page at `/purchases` (server + client component).
- Detail page at `/purchases/[id]`.
- Data layer at `lib/purchases.ts`.
- Nav entry in `lib/nav.ts` (OWNER_ONLY).
- Seller-404 verification of both routes.
- Status-mismatch audit (see below).

Out of scope (any of these slipping in is a sign we are doing 14b
or 14c work; stop and re-spec):
- Any UPDATE or INSERT against purchase_orders, purchase_order_items,
  inventory_lots, courier_payments, courier_payment_allocations.
- Status transition buttons or forms.
- Creating inventory_lots.
- Editing line items.
- Recomputing landed costs.
- Courier payment list, detail, or allocation editing.
- A separate /purchases/new route — explicitly not built.

## RBAC

Owner-only.
- `app/(dashboard)/purchases/page.tsx` -> `requireOwner()`.
- `app/(dashboard)/purchases/[id]/page.tsx` -> `requireOwner()`.
- No actions in this round (read-only), so no server-action guards.
- Nav entry has `roles: OWNER_ONLY` so sellers/distributors see no
  link. Direct-URL hits 404 via requireOwner.

## Data model recap

The spec assumes the schema as read at 14.0 / 14.0b. Anything
contradicting the schema is wrong; the schema is the source of truth.

**purchase_orders** — order header. USD on supplier side, DOP on
payment side.
- USD breakdown: usd_subtotal + usd_shipping + usd_tax = usd_total
- DOP breakdown: dop_paid_total + dop_bank_fee at exchange_rate,
  compared to official_rate_at_payment (the bank spread is data,
  not derived).
- Stage timestamps: ordered_at (required), expected_at, paid_at_dop,
  received_at, completed_at.
- Status enum: pending -> paid_supplier -> received -> complete.
- supplier_payment_account_id -> money_accounts(id): which DOP account
  bought the USD.
- legacy_lot_numbers (ARRAY) — pre-migration lot identifiers,
  informational only.

**purchase_order_items** — one row per product line.
- qty, usd_unit_cost, usd_line_total.
- DOP landed cost = dop_unit_cost_base + dop_bank_share +
  dop_transport_share = dop_unit_landed_cost.
- Per-line allocation of the order's bank fee and courier payments.

**inventory_lots** — bridge between purchases and sales.
- Each lot has product_id, warehouse_id, optional
  purchase_order_item_id (nullable — some lots predate the migration).
- qty_received vs qty_remaining: consumption tracked here.
- unit_cost_dop is the per-unit landed cost captured at receipt time;
  later changes to the PO line do NOT retroactively rewrite history.

**courier_payments** + **courier_payment_allocations** —
- One courier_payment can be allocated across many purchase_orders.
- Allocation rows: (courier_payment_id, purchase_order_id, amount_dop).
- 14a only reads these for the detail page's transport breakdown.

## Status-mismatch audit

Every order has a stored status and four timestamps. They are
expected to agree; migration data may not. The audit logic:
derivedStatus(po): PurchaseStatus =
if completed_at is set      -> 'complete'
else if received_at is set  -> 'received'
else if paid_at_dop is set  -> 'paid_supplier'
else                        -> 'pending'
statusMismatch(po): boolean =
po.status !== derivedStatus(po)

Both helpers are exported from `lib/purchases.ts` as pure functions.

The UI uses statusMismatch to:
- Show a small amber "status mismatch" badge in the list, in addition
  to the regular stored-status badge.
- Show a derived-vs-stored panel on the detail page (green check
  when agreeing, amber explainer when not).
- Optionally filter the list to mismatches only (URL state).

This is detect-and-flag, not detect-and-fix. SQL is the cleanup path
if needed; the UI does not write status corrections.

## Data layer (`lib/purchases.ts`)

Exports:

```ts
export type PurchaseStatus =
  | 'pending' | 'paid_supplier' | 'received' | 'complete'

export type PurchaseOrderRow = {
  // every column from purchase_orders
  // plus denormalised supplier_name, warehouse_name for the list
}

export type PurchaseOrderItemRow = {
  // every column from purchase_order_items
  // plus denormalised product_name, product_sku
}

export type LotTrailEntry = {
  lot: { id, lot_number, qty_received, qty_remaining,
         unit_cost_dop, received_at }
  consumption: Array<{
    sale_id, sale_invoice_number, sale_occurred_at,
    qty_consumed, seller_id, seller_name
  }>
}

export function derivedStatus(po): PurchaseStatus
export function statusMismatch(po): boolean

export async function listPurchaseOrders(opts: {
  search?: string            // supplier name, legacy_id, notes
  status?: PurchaseStatus    // stored status filter
  supplierId?: string
  warehouseId?: string
  dateFrom?: string          // ordered_at >=
  dateTo?: string            // ordered_at <=
  mismatchOnly?: boolean
  page?: number              // default 1
  pageSize?: number          // default 50
}): Promise<{ rows: PurchaseOrderRow[]; total: number; page; pageSize }>

export async function getPurchaseOrder(id: string):
  Promise<PurchaseOrderRow | null>

export async function getPurchaseOrderItems(orderId: string):
  Promise<PurchaseOrderItemRow[]>

export async function getLotTrailForOrder(orderId: string):
  Promise<Map<purchase_order_item_id, LotTrailEntry[]>>
  // grouped per item so the detail page can render under each line
```

Notes:
- listPurchaseOrders denormalises supplier and warehouse names with
  a follow-up query rather than a join, matching the warehouses
  pattern from Round 11.
- mismatchOnly filters in memory after fetch — the derivation is
  cheap, page sizes are small, the alternative is a SQL CASE
  expression we will not want to maintain.
- getLotTrailForOrder does the two-deep join through
  inventory_lots -> sale_lot_consumption -> sale_items -> sales.
  Distributor names not needed; seller is what's interesting.

## List page

Header: "Purchases", "Where the stock came from." + count.
No "New purchase" button (write side is 14b/14c).

Filters row (URL state, debounced search):
- search (?q=): supplier name / legacy_id / notes (case-insensitive)
- status (?status=pending|paid_supplier|received|complete)
- supplier (?supplierId=...) — dropdown of suppliers
- warehouse (?warehouseId=...) — dropdown of warehouses
- dateFrom / dateTo (?dateFrom=, ?dateTo=) — ordered_at bounds
- mismatch only (?mismatch=1)
- page (?page=...)

Pagination: 50 rows per page (196 orders total, so ~4 pages). Same
pattern as Sales list.

Columns:
- Ordered (date, en-GB)
- Supplier (with small badge for legacy_id if set)
- Warehouse
- Lines count (qty of distinct items, from a join count)
- USD total (right-aligned, 2dp)
- DOP paid (right-aligned, 2dp — blank if not paid yet)
- Status (badge: pending / paid_supplier / received / complete)
- Mismatch (small amber "⚠ mismatch" pill if statusMismatch(po), hidden
  column otherwise — appears only when the row has the issue)
- Manage (link to /purchases/[id])

Empty state: card with "No purchases match these filters."

## Detail page

Header: "Purchase {legacy_id or id-short}", subtitle with supplier
name + ordered_at.

Three regions stacked, in this order:

### 1. Header card (`Order overview`)

Two-column layout:
- Left: Supplier, Warehouse, Notes
- Right: Stored status, Derived status, mismatch panel if any
- Bottom row: Ordered / Paid / Received / Completed timestamps as a
  small stage-bar (filled-or-dashed dots, en-GB dates)

### 2. Financials card (`Money`)

Three sub-sections side by side:

**USD side:**
- usd_subtotal
- + usd_shipping
- + usd_tax
- = usd_total (bold)

**DOP side (conditional on paid):**
- dop_paid_total
- + dop_bank_fee
- (effective rate = (dop_paid_total + dop_bank_fee) / usd_total)
- exchange_rate (stored)
- official_rate_at_payment (the spread vs effective is informative
  but not computed)
- supplier_payment_account_id -> money account name

If status is pending, this section reads "Not paid yet."

### 3. Line items table (`Items`)

Per row:
- Product (name + sku)
- Qty
- USD unit
- USD line total
- DOP unit cost base
- DOP bank share
- DOP transport share
- DOP unit landed (bold; verify base + bank + transport = landed in
  the UI, flag with a small amber dot if not — same audit pattern
  as the status mismatch)

Footer row: column totals where summable.

### 4. Lot trail (per line, expandable)

Under each line item row, a "Lots received" sub-table:
- Lot number, received_at, qty_received, qty_remaining, unit_cost_dop

Under each lot, if there is consumption, a further sub-list:
- Sale invoice number (linked to /sales/{sale_id})
- Sale date
- Qty consumed
- Seller name

If a lot has no consumption, it just shows the lot row with no
expanded list. If a line item has no lots (purchase_order_item_id
not yet linked from any inventory_lots row), the lot-trail section
for that line reads "No lots received."

This is the heart of the read surface — it's why the cutover blocker
is a *read*-side blocker. You can finally trace "this sale used stock
from that purchase."

## Order of work (sub-rounds)

- **14a.0** — Spec on disk (this file) + commit.
- **14a.1** — `lib/purchases.ts`: types, derivedStatus, statusMismatch,
  listPurchaseOrders, getPurchaseOrder, getPurchaseOrderItems,
  getLotTrailForOrder. No UI yet. Each function has one happy-path
  smoke check via the SQL editor before the commit.
- **14a.2** — List page + list-table client component.
- **14a.3** — Detail page (single page.tsx + small client subcomponents
  if needed for the lot-trail expandables).
- **14a.4** — Nav entry. Slotted after Warehouses, before Money
  Accounts (Purchases is upstream of stock, which is upstream of
  cash — reading left-to-right matches the operational order).
- **14a.5** — Smoke test end-to-end as owner + seller-404 verification
  of both routes.

Each step its own commit. Same micro-step rhythm as Round 12.

## Patterns to match

From prior rounds, applied here:
- Server component fetches data -> client component renders.
- URL state for list filters via searchParams.
- Sequential fetches when later fetches depend on earlier results
  (e.g. detail page fetches order, then items, then lot trail).
- Parallel fetches when independent (e.g. detail page can fetch
  supplier/warehouse names alongside items if useful).
- Search debounced 300ms, snake_case URL keys, sentinel values for
  Select "all" options.
- en-GB dates everywhere shown to user.
- requireOwner uses notFound() not redirect, so sellers see a vanilla
  404 indistinguishable from a typo'd URL.
- Disabled shadcn Select is unreadable — use disabled Input for
  displayed-but-not-editable values.

## Risks / unknowns called out

- The 196 vs 74 discrepancy from the handoff: handoff said 74,
  schema check says 196. 14a treats the schema's row count as truth.
  Mentioning in the next handoff that the legacy migration figure
  needs updating.
- legacy_lot_numbers (array column on purchase_orders) is not
  surfaced in 14a. If it turns out to be useful for visual continuity
  with the old system, surface in a follow-up.
- The "base + bank + transport = landed" audit on line items may
  catch a lot of false positives if migration computed these with
  different rounding than we expect. If smoke testing shows >10% of
  rows flagged, suppress the dot until a real audit pass is done.
- payment_receipts table exists per the 14.0b query, scope unclear;
  not touched in 14a.
