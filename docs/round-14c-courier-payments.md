# Round 14c — Courier payments and allocations

Round 14b shipped the purchases write surface (create, mark paid,
mark received, mark complete, mark cancelled, mark lost) with an
optional inline single-courier transport shortcut at create time.

This round adds the standalone courier-payments module: a list,
detail, and create surface, plus the ability to attach transport
to an existing purchase order after the fact. The migration data
has 36 courier payments allocated 275 times across purchase orders
(many-to-many). The new admin can READ that data via the 14a
detail page transport breakdown, but cannot create or edit a
courier payment that spans multiple orders. This round closes
that gap.

## Phasing recap

- 14a (DONE) — read surface
- 14b (DONE) — status transitions + creation + inline single-courier
  transport shortcut
- 14c (THIS round) — standalone courier payments + multi-PO
  allocation + retroactive transport attach
- 15 (later) — Online Orders, write-side cutover blocker

## Scope

In scope:
- /courier-payments list page (server + client). Paginated 50/page.
  Filters: courier, paid-on date range.
- /courier-payments/[id] detail page. Header (courier, paid_on,
  total DOP, payment account, notes) and per-PO allocation grid
  with link to each PO.
- /courier-payments/new create form. Multi-PO allocation grid;
  sum of allocations must equal payment total (±0.01 tolerance).
- "Add transport" button on /purchases/[id] for orders that need
  transport attached after the fact. Pre-fills the new courier-
  payment form with this PO pre-selected via ?prefill_po=<id>.
- RPC create_courier_payment — atomic insert into courier_payments
  + courier_payment_allocations + recompute dop_transport_share
  and dop_unit_landed_cost on every line of every affected PO.
  All-or-none semantics.
- Lot cost recompute on attach: existing inventory_lots for
  affected PO lines get unit_cost_dop rewritten for UNCONSUMED
  quantities only; already-consumed units keep original cost
  basis. Same model as mark_lost.
- TS server action wrapping the RPC.
- Nav entry "Courier Payments" between Purchases and Money
  Accounts, OWNER_ONLY.
- Seller-404 verification of all three new routes.

Out of scope (sign you are doing a different round; stop and re-spec):
- Editing or deleting existing courier_payments. v1 is write-once.
  Mistakes corrected by deleting in Supabase SQL and re-creating
  via the UI.
- Posting courier payments to public.transactions. Deferred to
  Round 19 (Accounting) with the rest of the purchases-ledger
  reconciliation work.
- Splitting an existing single-courier allocation into multiple
  rows.
- Multi-currency on the courier-payments side. DOP only.
- Discount column on courier_payments. Courier payments are net
  amounts.

## Decisions locked

### D1. Retroactive lot cost rewrite

When create_courier_payment attaches transport to a PO that is
already in received or complete status (inventory_lots already
exist), the RPC must:

1. Recompute dop_transport_share and dop_unit_landed_cost on
   every affected purchase_order_items row.
2. For each affected line, find the corresponding inventory_lots
   rows (joined via purchase_order_item_id).
3. For lots whose consumed_qty < received_qty, rewrite
   unit_cost_dop to the new landed cost. For lots already fully
   consumed, leave the original unit_cost_dop in place — it is
   already baked into recorded sale cogs.
4. For lots partially consumed: the stored unit_cost_dop reflects
   the NEW post-recompute cost; auditors reading historical sale
   cogs use the sale rows directly, not back-compute from the lot.

This matches the mark_lost lot-cost-recompute model from 14b.

### D2. Write-once

courier_payments rows cannot be edited or deleted via the new
admin in v1. To correct a mistake: delete the row + its
allocations + recompute affected POs via Supabase SQL, then
re-create through the UI. Edit/delete UI is a future round once
correction frequency is observed in practice.

### D3. "Add transport" from PO detail page

The detail page /purchases/[id] gets a new "Add transport" button
visible in any status. Clicking navigates to
/courier-payments/new?prefill_po=<id>. The new-form component
reads searchParams; if prefill_po is set, the allocations grid is
seeded with one row containing that PO.

This is the primary entry point for "courier bill just arrived
for an order we placed last week."

### D4. All-or-none in create_courier_payment

- p_allocations array: at least one row required.
- Sum of p_allocations[].dop_amount must equal p_dop_total within
  ±0.01. RPC RAISES if mismatch.
- Every p_allocations[].purchase_order_id must reference an
  existing PO row. FK constraint catches this.
- A PO can appear multiple times in p_allocations (multiple
  shipments split across one courier payment IS supported by the
  schema). Detail page lists all allocations per PO.
- p_courier_id must reference a suppliers row with kind = courier.
  RPC RAISES otherwise.

## Data model recap

courier_payments (existing table, no schema changes in 14c):
  - id uuid PK
  - courier_id uuid -> suppliers(id) (kind = courier)
  - paid_on date
  - dop_total numeric
  - payment_account_id uuid -> money_accounts(id)
  - notes text
  - created_at, updated_at timestamps

courier_payment_allocations (existing table, no schema changes):
  - id uuid PK
  - courier_payment_id uuid -> courier_payments(id) ON DELETE CASCADE
  - purchase_order_id uuid -> purchase_orders(id)
  - dop_amount numeric

purchase_order_items.dop_transport_share — recomputed by RPC.
purchase_order_items.dop_unit_landed_cost — generated column;
  becomes correct automatically once dop_transport_share is set.
inventory_lots.unit_cost_dop — rewritten by RPC for unconsumed
  lot quantities.

## Transport-share math

For each affected PO after allocation insert:
  total_transport_dop = SUM(courier_payment_allocations.dop_amount)
                        for this PO across all courier payments
  total_units = SUM(purchase_order_items.quantity_ordered) for PO
  per_unit_share = total_transport_dop / total_units
                   rounded to 4 decimal places

  For each item:
    dop_transport_share = per_unit_share * quantity_ordered
    dop_unit_landed_cost = dop_unit_cost_base + dop_bank_share
                         + (dop_transport_share / quantity_ordered)

Allocation is by quantity_ordered, not received. Lost / shortfall
units still bear transport share — same model as mark_lost.

## RPC signature

create_courier_payment(
  p_courier_id uuid,
  p_paid_on date,
  p_dop_total numeric,
  p_payment_account_id uuid,
  p_notes text,
  p_allocations jsonb
) RETURNS uuid

p_allocations shape:
  [{"purchase_order_id": "uuid", "dop_amount": 123.45}, ...]

All inserts + recomputes happen inside one transaction. RAISES on:
- p_dop_total <> SUM(p_allocations[].dop_amount) (±0.01 tolerance)
- p_allocations empty
- referenced PO not found
- p_courier_id not of kind = courier
- p_payment_account_id not found

## UI surface

### /courier-payments list page

Columns: paid_on, courier name, dop_total, # POs allocated,
payment account name.
Filters (URL state): courier, paid_on date range.
Pagination: 50/page.
Row link to /courier-payments/[id].

### /courier-payments/[id] detail page

Header card: courier name + link to supplier detail, paid_on,
dop_total, payment account, notes, created_at, updated_at.

Allocations table: PO link (legacy_id or new id), supplier name,
PO ordered_at, PO status, dop_amount allocated. Each row links
to /purchases/[id].

Sum-check footer: sum of allocations vs dop_total. Should always
match (±0.01); if not, amber warning pill.

### /courier-payments/new create form

Header fields:
  - courier (combobox; filter existing kind=courier suppliers,
    create-new at bottom — same pattern as supplier picker in 14b
    new-purchase form)
  - paid_on (date picker, defaults to today)
  - payment_account (combobox of money_accounts)
  - notes (textarea, optional)

Allocations grid:
  - Row: PO picker (combobox showing POs with derived label
    "ORDERED_AT — SUPPLIER — usd_total") + dop_amount input
  - Add row / remove row buttons
  - Live sum-of-allocations display below grid

dop_total input editable. Live validation highlights red if
sum-of-allocations differs from dop_total beyond tolerance.

Submit button disabled until:
  - courier set
  - paid_on set
  - payment_account set
  - at least one allocation row with both fields filled
  - sum of allocations equals dop_total (±0.01)

On submit: server action calls create_courier_payment RPC. On
success: revalidate /courier-payments and each affected
/purchases/[id], redirect to /courier-payments/[new_id].

## RBAC

Owner-only.
- /courier-payments/page.tsx -> requireOwner()
- /courier-payments/[id]/page.tsx -> requireOwner()
- /courier-payments/new/page.tsx -> requireOwner()
- Nav entry roles: OWNER_ONLY
- Server action wraps RPC; requireOwner() at top.

Seller-404 verification of all three routes before commit.

## Sub-rounds

- 14c.1 — Spec (THIS step).
- 14c.2 — RPC create_courier_payment with full all-or-none
  semantics + landed-cost + lot recompute.
- 14c.3 — TS server action wrapping the RPC.
- 14c.4 — Data layer lib/courier-payments.ts: list, detail,
  filter helpers, courier-picker source.
- 14c.5 — List page /courier-payments.
- 14c.6 — Detail page /courier-payments/[id].
- 14c.7 — New form /courier-payments/new (without prefill).
- 14c.8 — Prefill via ?prefill_po=<id> + "Add transport" button
  on /purchases/[id].
- 14c.9 — Nav entry + seller-404 verification + e2e smoke.

Roughly the size of 14b. Plan: 2-3 sessions.

## E2E smoke tests for 14c.9

Three scenarios to walk end to end before closing the round:

1. Single-PO retro attach. Pick a received PO with no existing
   transport. "Add transport" -> create courier payment with one
   allocation matching its expected transport. Verify:
   - PO detail page now shows transport DOP > 0
   - Per-line dop_transport_share recomputed
   - dop_unit_landed_cost recomputed (generated col)
   - inventory_lots.unit_cost_dop updated for unconsumed qty
   - Already-consumed lots (if any) unchanged
   - Sale cogs from those consumed lots unchanged

2. Multi-PO courier payment. Create one courier payment with
   3 PO allocations summing to dop_total. Verify all three POs
   recompute correctly.

3. Edit-by-recreate. Fix an allocation mistake by deleting the
   courier_payment row in SQL (CASCADE drops allocations) and
   creating a new one. Verify per-line shares recompute back to
   pre-allocation state during the gap, then to new state after
   the new payment.

## Open questions deferred

- Audit trail. No history table for who-changed-what-when on
  courier_payments. Deferred until owner count > 1.
- Courier payment receipt upload (scanned bill -> attach to row).
  Deferred to a future documents round.
- Bulk import of courier payments. Out of scope.
- Transactions ledger. Round 19 (Accounting) will add posting for
  purchases + courier payments together.
- Multi-courier per PO with allocation editing UI. Multi-courier
  IS supported on the data side (schema doesn't constrain it),
  but each courier payment is created as a separate row in this
  round. Editing UI is deferred.
