# Round 15 — Online Orders

Sister module to POS sales (Round 9.x). Both write to `public.sales`; this
round handles `source='online'`. Write-side cutover blocker per roadmap.
Multi-session work; this spec covers all 8 sub-rounds.

## 1. Schema (verified 2026-05-19)

`public.sales` is source of truth. No separate `online_orders` table.
Online orders are `source='online'` rows. Sub-tables (`sale_items`,
`sale_payments`, `sale_lot_consumption`, `sale_commissions`) are shared
with POS.

Two state axes:

- **`sale_status` enum** — payment state, driven by `sale_payments`
  trigger: `confirmed -> partially_paid -> paid`. Set to `cancelled`
  only via `mark_cancelled_online`. Values: `draft | confirmed | paid
  | partially_paid | refunded | cancelled`.

- **`tracking_status` text** (NOT an enum) — fulfillment state, set
  explicitly by the four RPCs. v1 vocabulary:
  - `received` — order created, stock locked, awaiting fulfillment
  - `dispatched` — delivery only; goods left warehouse for customer
  - `delivered` — customer received (delivery) OR collected (pickup)
  - `cancelled` — order cancelled, stock returned

Migrated rows in DB: 8 online sales, all `status='paid' + fulfillment=
'delivery'`. tracking_status: 7 `delivered`, 1 `pending`. The `pending`
value is legacy; v1 does not generate it. Existing row is left alone.

`sale_source` enum: `pos | online`. `fulfillment_method` enum: `in_store
| pickup | delivery` (in_store atypical for online).

## 2. Schema additions

One migration: `db/migrations/round-15-online-orders-01-schema.sql`

```sql
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS dispatched_at timestamptz;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS delivered_at  timestamptz;
```

No new tables, no new enums.

## 3. Stock model

**Stock decrements at order creation**, not at dispatch. Rationale: we
frequently have qty=1 items; the lock must take effect the moment we
accept the order. Only `mark_cancelled_online` releases stock.

Mechanics: identical to POS confirm. FIFO consume across `inventory_lots`
(oldest `received_at` first) within `source_warehouse_id`. Write
`sale_lot_consumption` rows. Snapshot `unit_cost_dop` into `cogs_cents`.
Write `stock_movements` with `kind='sale_out'`, negative `qty_delta`,
`lot_id` populated, `sale_item_id` populated.

**Stock returns at cancel.** Compensating `stock_movements` with
`kind='return_in'`, positive `qty_delta`, same `lot_id` and `sale_item_id`
referenced from the original `sale_lot_consumption` rows. Restore
`qty_remaining` on the source lots. Set `cogs_cents=NULL` and
`gross_profit_cents=NULL` on the cancelled sale.

## 4. Payments

Identical to POS. `sale_payments` rows feed an existing trigger that
maintains `sales.paid_cents` and transitions `sale_status` between
`confirmed -> partially_paid -> paid`.

`create_online_order` accepts a `p_payments jsonb` array; can be empty
(online orders frequently unpaid at creation, paid on delivery).

## 5. Cancel-with-payments

When `mark_cancelled_online` runs on a sale with existing positive
payments, it writes compensating `sale_payments` rows: same
`money_account_id` and `method`, negative `amount_cents`, `paid_at=now()`,
`reference = 'CANCEL ' || original_payment.id::text`. The existing
trigger walks `paid_cents` back to zero. Final state: `sale_status=
'cancelled'`, `tracking_status='cancelled'`, `paid_cents=0`, stock
restored, commissions voided.

**Cancel is not refund.** v1 has no separate refund flow. Round 19
(Accounting) may introduce one with `refunded_at` + positive
adjustment payments. Flag for future.

## 6. Invoice numbers

Format: `ONL-NNNN`, 4-digit zero-padded, separate sequence from POS
`FAC-NNNN`. Sequence source:

```sql
SELECT COALESCE(
  MAX(NULLIF(substring(invoice_number FROM '^ONL-(\d+)$'), '')::int),
  0
) + 1
FROM public.sales
WHERE invoice_number LIKE 'ONL-%';
```

No existing `ONL-` rows in DB. First online order = `ONL-0001`.

## 7. No couriers on online orders

Online orders do NOT link to courier-supplier rows. Couriers exist
exclusively on inbound purchase orders (Round 14c). For online dispatch,
the business handles delivery directly. `mark_dispatched` accepts an
optional `p_tracking_number text` (free-form carrier reference if any)
but no FK to suppliers.

## 8. Pickup with inter-warehouse fee

When `fulfillment_method='pickup'` and customer picks up from a
warehouse different from `source_warehouse_id`, the form passes a
positive `p_shipping_cents`. No new column — reuse `sales.shipping_cents`.
The fee flows into `total_cents` (existing generated column).

## 9. RPCs (4 in v1)

All RPCs are `security definer`, owned by `postgres`, granted to
`authenticated`. RBAC enforced at the server action layer, not the RPC.

### 9.1 `create_online_order`

Params:
- `p_customer_id uuid` (nullable for walk-in equivalent, atypical online)
- `p_seller_id uuid` (admin user keying it in)
- `p_source_warehouse_id uuid` (where stock pulls from)
- `p_fulfillment_warehouse_id uuid` (pickup point OR dispatch origin)
- `p_fulfillment_method fulfillment_method` (`pickup` | `delivery`)
- `p_lines jsonb` — `[{product_id, qty, unit_price_cents, discount_cents,
  seller_commission_percent, distributor_commission_percent}]`
- `p_discount_cents int` (order-level discount)
- `p_shipping_cents int` (delivery fee OR inter-warehouse pickup fee)
- `p_shipping_address text`, `p_shipping_city text`, `p_delivery_notes text`
- `p_payments jsonb` — `[{method, amount_cents, money_account_id, reference}]`
  (may be empty array)
- `p_sold_at timestamptz default now()`

Returns: `uuid` (new sale_id)

Effects:
- Insert `sales`, `source='online'`, `status='confirmed'`,
  `tracking_status='received'`, `confirmed_at=now()`
- Assign `invoice_number = 'ONL-' || lpad(next::text, 4, '0')`
- Insert `sale_items` from p_lines
- FIFO consume -> `sale_lot_consumption` + `stock_movements` (`sale_out`)
- Snapshot `cogs_cents` per item; sum into `sales.cogs_cents`;
  compute `gross_profit_cents`
- Insert `sale_commissions` (seller; distributor when applicable),
  status=`pending`
- Insert `sale_payments` from p_payments (trigger walks `paid_cents`)

### 9.2 `mark_dispatched`

Params: `p_sale_id uuid, p_tracking_number text default null`

Guards:
- `source='online'`
- `fulfillment_method='delivery'` (rejects `pickup` / `in_store`)
- `tracking_status='received'`
- `sale_status NOT IN ('cancelled','refunded')`

Effects: `tracking_status='dispatched'`, `dispatched_at=now()`,
`tracking_number=COALESCE(p_tracking_number, tracking_number)`,
`updated_at=now()`.

### 9.3 `mark_delivered`

Params: `p_sale_id uuid`

Guards:
- `source='online'`
- `tracking_status IN ('received','dispatched')` (pickup orders go
  straight from `received` to `delivered`, skipping dispatch)
- `sale_status NOT IN ('cancelled','refunded')`

Effects: `tracking_status='delivered'`, `delivered_at=now()`,
`updated_at=now()`.

### 9.4 `mark_cancelled_online`

Params: `p_sale_id uuid, p_reason text`

Guards:
- `source='online'`
- `tracking_status != 'delivered'` (cannot cancel after delivery;
  treat as future-round return)
- `sale_status != 'cancelled'` (idempotency)

Effects (in order, single transaction):
- For each `sale_lot_consumption`: `UPDATE inventory_lots SET
  qty_remaining = qty_remaining + qty_consumed WHERE id = lot_id`
- Insert compensating `stock_movements` rows: `kind='return_in'`,
  `qty_delta = +qty_consumed`, same `lot_id`, `sale_item_id` ref
- For each existing `sale_payments` row with `amount_cents > 0`,
  insert compensating row: negative `amount_cents`, same method/
  money_account_id, `reference='CANCEL ' || original.id::text`,
  `paid_at=now()`
- `UPDATE sale_commissions SET status='void' WHERE sale_item_id IN
  (...) AND status='pending'`
- `UPDATE sales SET status='cancelled', tracking_status='cancelled',
  cogs_cents=NULL, gross_profit_cents=NULL, refund_reason=p_reason,
  updated_at=now()`

### 9.5 Deferred to future round

`mark_received_online` — for when the public shop creates `draft`
rows that an admin reviews before locking stock. v1 admin keys orders
in directly so **creation IS receipt**. When shop integrates, add
`p_auto_receive boolean default true` param to `create_online_order`
and introduce `mark_received_online` for the false branch.

## 10. Code layout (mirrors 14c)

- `lib/online-orders.ts` — fetchers:
  - `listOnlineOrders(filters)`
  - `getOnlineOrderById(id)` — with items, lot consumption, payments, commissions
  - `listOnlineOrdersByStatus(tracking_status)`
- `lib/actions.ts` additions:
  - `createOnlineOrder`
  - `markOnlineOrderDispatched`
  - `markOnlineOrderDelivered`
  - `cancelOnlineOrder`
- Pages under `app/(dashboard)/online-orders/`:
  - `page.tsx` — list with status badges + filters
  - `[id]/page.tsx` — detail with status-transition action bar
  - `new/page.tsx` — form (multi-line items, payment tenders, shipping)
- Nav: insert between Sales and Purchases; visible to admin + owner.

## 11. RBAC

- `owner`: full access
- `admin`: full access
- `seller`: no (sellers work POS, not online)
- `distributor`: no
- `customer`: no

## 12. E2E scenarios

- **S1 — Delivery happy path:** Create with delivery, paid in full at
  creation, then dispatch, then deliver. Verify: `ONL-NNNN` invoice
  assigned, stock decremented, lot consumption recorded, COGS
  snapshotted, commissions inserted, `dispatched_at` + `delivered_at`
  set, `sale_status='paid'`, `tracking_status='delivered'`.

- **S2 — Pickup with inter-warehouse fee, cancel unpaid:** Create
  pickup order from warehouse A but customer picks up at B with
  `shipping_cents=500`. No payment at creation. Cancel before pickup.
  Verify: stock returned to original lots, commissions voided, no
  compensating payments needed (paid_cents was 0), tracking_status=
  'cancelled'.

- **S3 — Cancel with payment reversal:** Create delivery order paid
  in full at creation. Cancel before delivery. Verify: compensating
  `sale_payments` row written (negative), `paid_cents=0`, `sale_status=
  'cancelled'`, stock returned, commissions voided.

- **S4 — Invalid transitions:** Verify `mark_dispatched` rejects a
  pickup order; verify `mark_delivered` rejects an already-cancelled
  order; verify `mark_cancelled_online` rejects an already-delivered
  order.

## 13. Sub-round sequence

1. **15.0** — this spec (current step)
2. **15.1** — schema migration (`dispatched_at`, `delivered_at`)
3. **15.2** — RPCs (4 of them; deploy + smoke each individually)
4. **15.3** — server actions wrapping the RPCs
5. **15.4** — data layer `lib/online-orders.ts`
6. **15.5** — list page
7. **15.6** — detail page
8. **15.7** — new form
9. **15.8** — nav entry + RBAC + e2e (S1-S4)

## 14. Known unknowns / future items

- `mark_received_online` — defer until public shop integrates
- Refund flow distinct from cancel — for cases where delivered
  orders need partial money back
- `tracking_status='pending'` legacy row — leave alone; future cleanup
- Online -> POS conversion (customer walks in to pick up an online
  order) — not in v1
- Round 19 (Accounting): online orders, like POS sales, write to
  `sale_payments` but money_account balances are not currently
  reconciled. Same gap as purchases + courier payments.

## 15. Schema-name corrections appendix

(Added as columns are verified during implementation. Populate as we go,
same convention as Round 14c spec.)