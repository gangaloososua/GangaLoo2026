# Round 14b — Purchases write surface

Round 14a shipped the read surface (list + detail + lot trail).
This round adds the write actions: creating new purchase orders,
recording supplier payments, recording receipts (full or partial),
and the terminal-state transitions (complete, cancelled, lost).

Phasing recap (from 14a spec, unchanged):
- 14a (DONE) — read surface
- 14b (THIS round) — status transitions + creation + receive
- 14c (later) — courier payments UI + landed-cost recomputation

## Scope

In scope:
- Schema migration: two new status enum values (cancelled, lost),
  one new column (usd_discount), and replacement of the generated
  usd_total column to include discount.
- Six server actions: createPurchaseOrder, markPaidSupplier,
  markReceived, markComplete, markCancelled, markLost. All
  owner-only.
- /purchases/new page: a single form that creates a complete
  order header + line items, with optional inline supplier
  payment and optional inline transport (single-courier
  shortcut writing to courier_payments + allocations).
- Action buttons on the detail page (14a.3) wired up to open
  dialogs for the status-transition actions.
- Lot-number generation at receipt time (per-line, auto-
  incremented integer sequence).
- Seller-404 verification of /purchases/new and the new actions.

Out of scope (sign that we are doing 14c work; stop and re-spec):
- Courier-payments list page, courier-payment edit, multi-order
  allocation UI.
- Landed-cost recomputation when courier allocations change
  after the fact.
- Editing line items on existing orders after creation. v1 only
  supports edit-on-create; subsequent changes require cancel +
  recreate.
- A bulk-import or migration of additional legacy orders.

## Decisions locked

### Status enum: pending / paid_supplier / received / complete plus terminal cancelled, lost

The normal positive path is unchanged:
  pending -> paid_supplier -> received -> complete

Two terminal "did not work out" states are added:
  cancelled — order was paid but never arrived; refund received.
              Reachable from pending or paid_supplier.
  lost      — partial receive accepted as final; missing units
              written off. Reachable from received.

`complete` remains: all ordered units arrived, no missing pieces,
all transport paid. Per the user's mental model: complete means
"the order is fully done in the books, no follow-up expected."

The two new values are TERMINAL: no transitions out of them. SQL
is the cleanup path if a status flip needs reversing.

derivedStatus (in purchases-types.ts) stays as-is — it derives
from the four ladder timestamps. Cancelled and lost don't have
their own timestamps; they ride on completed_at being set with
status != complete. The audit mismatch panel on the detail page
gracefully shows "stored: cancelled, derived: received" with the
amber pill — accurate, not a bug.

### usd_discount on purchase_orders

The user enters orders as: base price + shipping + tax - discount
given = total paid in USD. Today's schema has no discount column;
the discount value is hidden in lower line costs or absorbed
elsewhere. Schema gains:

  alter table purchase_orders
    add column usd_discount numeric(12,2) not null default 0;

The existing generated usd_total column must be replaced because
its expression can't be altered:

  alter table purchase_orders drop column usd_total;
  alter table purchase_orders add column usd_total numeric(12,2)
    generated always as
      (usd_subtotal + usd_shipping + usd_tax - usd_discount)
    stored;

Backfill: nothing required. Existing rows get usd_discount = 0
by default; their usd_total recomputes to the same value.

### Lot numbers: per-line, auto-incremented at receipt

The old system pre-assigned one lot number per order and shared
it across all lines. The new system does NOT do this. Instead:
- No lot number on purchase_orders (the column doesn't exist).
- markReceived creates one inventory_lots row per line that
  received qty > 0.
- Each row gets a unique lot_number generated as
  max(existing-numeric-lot-numbers) + 1, allocated sequentially
  within the same receive call.
- Partial receives create NEW lots on subsequent calls (a line
  receiving 8 today and 2 next week produces lots 1953 and 1954,
  not "1953 twice").

Lot numbers older than this round (legacy "LOT-1903", or
non-numeric "1751") are ignored when computing the next integer.
Once the new system is running, all new lots follow the new
sequence, and the gap to legacy lots is acceptable historical
record.

### Transport on the create form: shortcut to courier_payments

The old system had a single "Transporte DOP" field on the order
form AND a separate transport-payments screen, which caused
double-entry. The new system has ONE source of truth for transport
amounts: courier_payment_allocations.

The create-order form has an OPTIONAL "Transport" section. If
the user fills it, the action atomically:
  1. creates one courier_payments row (courier_id, paid_at = now,
     money_account_id, amount_dop_total, description, reference)
  2. creates one courier_payment_allocations row pointing to the
     just-created order with the full amount_dop
  3. allocates dop_transport_share across the order's line items
     proportionally to usd_line_total
  4. writes dop_unit_landed_cost on each line: base + bank + transport

If the user leaves the transport section blank, no courier_payment
row is created and dop_transport_share stays null on lines.
Transport can be added later via the courier-payments UI in 14c.

This means the transport field on the create form is just a
shortcut to the same data path 14c will use. There's no
"phantom" transport column on purchase_orders. Data lives in
ONE place.

### Supplier picker: combobox, free-text with autocomplete

The old system used a free-text field with no autocomplete
("AliExpress, Temu...") leading to typo-driven duplicates. The
new system uses a combobox:
- Typeahead suggestions from existing suppliers in the DB
  (kind = 'supplier', not 'courier').
- Optional new-supplier-on-blur: if the typed value matches no
  existing supplier, the action creates a new suppliers row with
  kind='supplier' and the typed name. No other fields collected
  at creation time — supplier details can be filled in later
  via a future suppliers admin (not in 14b).

This addresses the existing-data issue we observed: two rows in
the 14a list page showed "(unknown)" supplier names because the
supplier_id pointed at a deleted suppliers row.

### Action UX summary

| From state       | Allowed actions                              |
|------------------|----------------------------------------------|
| (create)         | Save as pending / Save as paid (inline data) |
| pending          | Mark paid, Cancel                            |
| paid_supplier    | Mark received (partial OK), Mark lost, Cancel|
| received         | Mark complete, Mark lost                     |
| complete         | (none — terminal)                            |
| cancelled        | (none — terminal)                            |
| lost             | (none — terminal)                            |

Each action lives behind a button on the detail page that opens
a dialog. Buttons that aren't allowed for the current state are
not rendered (cleaner than disabled).

## Order of work (sub-rounds)

- **14b.0** — DB migration: enum values, discount column, regenerated
  usd_total. Spec + migration + rollback + smoke against current
  data.
- **14b.1** — This spec, on disk, commit.
- **14b.2** — Server actions in lib/purchases-actions.ts. Six
  exports. Each in a single transaction where multiple writes
  are involved (createPurchaseOrder is the biggest — supplier
  upsert, purchase_orders insert, purchase_order_items inserts,
  optional courier_payments + allocations + line allocations).
  All requireOwner().
- **14b.3** — /purchases/new page. The form. Biggest sub-round
  by far. Probably broken into 14b.3.1 (server page + form
  shell), 14b.3.2 (line-items editor), 14b.3.3 (live USD
  calculation + validation + submit).
- **14b.4** — Detail-page action buttons + dialogs. Per-state
  affordances per the table above.
- **14b.5** — End-to-end smoke as owner: create a new order from
  scratch matching one of your actual purchases, mark it paid,
  mark it received (full), mark it complete. Then a second order
  with partial receive + cancel. Seller-404 of /purchases/new.

## Risks called out

- Replacing a generated column drops + adds. This is technically
  a destructive operation, but usd_total has no FK dependencies
  (it's a computed value, not a key). Tested via a TRANSACTION
  block in the migration before any backfill question matters.
- markPaidSupplier and createPurchaseOrder's inline-payment mode
  share the same allocation math. Will be extracted to a private
  helper function to avoid duplication.
- The "create new supplier on blur" flow has a subtle race: two
  users typing the same new supplier name at once could create
  two rows. v1 accepts the race (unlikely with one owner using
  the system). v2 in a future round can add a unique constraint
  + UPSERT-with-name-match.
- Lot-number generation is a SELECT-MAX-then-INSERT, not a
  Postgres sequence. Two concurrent markReceived calls on
  different orders could both pick the same next integer.
  Acceptable for one-owner usage; if it becomes an issue,
  promote to a real sequence in a follow-up migration.

## Patterns to match (from prior rounds, reaffirmed for 14b)

- Server component fetches -> client component renders.
- 'use server' actions return { ok, error? } or redirect.
- requireOwner() on every action.
- Toasts via sonner; AlertDialog for terminal confirms.
- shadcn Select forbids ""; use __all__ / __new__ sentinels.
- Multi-line generics: SINGLE LINE only (the PowerShell heredoc
  bug from 14a will eat opening "<" if the line ends in it).
- Migration files: db/migrations/round-14b-name.sql paired with
  round-14b-name-rollback.sql, wrapped in BEGIN/COMMIT,
  idempotent (IF NOT EXISTS / IF EXISTS).
- New action file: lib/purchases-actions.ts (not extending
  lib/purchases.ts; actions and read-side fetchers stay split).
