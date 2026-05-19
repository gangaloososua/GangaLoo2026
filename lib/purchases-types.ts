// ============================================================
// Round 14 - Purchases module
//
// CLIENT-SAFE pure types and helpers. Safe to import from
// 'use client' components.
//
// The server-side fetchers live in lib/purchases.ts and
// re-export everything in this file. Existing server callers
// importing from @/lib/purchases keep working unchanged.
//
// Adding this split was the fix for the "next/headers in
// Pages Router" build error that surfaced when the list-table
// client component imported types from lib/purchases.ts -
// matches the exchange-rates and store-config patterns from
// prior rounds.
// ============================================================

// ---- status ------------------------------------------------

export type PurchaseStatus =
  | 'pending'
  | 'paid_supplier'
  | 'received'
  | 'complete'

export const PURCHASE_STATUSES: readonly PurchaseStatus[] = [
  'pending',
  'paid_supplier',
  'received',
  'complete',
] as const

// ---- row shapes --------------------------------------------

export type PurchaseOrderRow = {
  id: string
  supplier_id: string | null
  warehouse_id: string | null
  supplier_payment_account_id: string | null
  status: PurchaseStatus
  usd_subtotal: number
  usd_shipping: number
  usd_tax: number
  usd_discount: number
  usd_total: number
  dop_paid_total: number | null
  exchange_rate: number | null
  dop_bank_fee: number | null
  official_rate_at_payment: number | null
  dop_refund_total: number | null
  refund_at_dop: string | null
  refund_account_id: string | null
  ordered_at: string
  expected_at: string | null
  paid_at_dop: string | null
  received_at: string | null
  completed_at: string | null
  notes: string | null
  legacy_id: string | null
  legacy_lot_numbers: string[] | null
  created_at: string
  updated_at: string
  supplier_name: string | null
  warehouse_name: string | null
  refund_account_name: string | null
}

export type PurchaseOrderItemRow = {
  id: string
  purchase_order_id: string
  product_id: string
  qty: number
  usd_unit_cost: number
  usd_line_total: number
  dop_unit_cost_base: number | null
  dop_bank_share: number | null
  dop_transport_share: number | null
  dop_unit_landed_cost: number | null
  legacy_id: string | null
  created_at: string
  product_name: string | null
  product_sku: string | null
}

export type LotTrailEntry = {
  lot: {
    id: string
    lot_number: string | null
    qty_received: number
    qty_remaining: number
    unit_cost_dop: number | null
    received_at: string | null
  }
  consumption: Array<{
    sale_id: string
    sale_invoice_number: string | null
    sale_occurred_at: string | null
    qty_consumed: number
    seller_id: string | null
    seller_name: string | null
  }>
}

export type TransportAllocation = {
  allocation_id: string
  payment_id: string
  amount_dop: number
  paid_at: string
  courier_name: string | null
  money_account_name: string | null
  description: string | null
  reference: string | null
}

export type TransportSummary = {
  allocated_dop: number
  allocation_count: number
  allocations: TransportAllocation[]
}

export type PartialReceiveStatus = {
  ordered: number
  received: number
  is_partial: boolean
  is_unreceived: boolean
  is_complete: boolean
}

// ---- pure helpers ------------------------------------------

type StatusBearer = {
  status: PurchaseStatus
  paid_at_dop: string | null
  received_at: string | null
  completed_at: string | null
}

export function derivedStatus(po: StatusBearer): PurchaseStatus {
  if (po.completed_at) return 'complete'
  if (po.received_at) return 'received'
  if (po.paid_at_dop) return 'paid_supplier'
  return 'pending'
}

export function statusMismatch(po: StatusBearer): boolean {
  return po.status !== derivedStatus(po)
}

export function partialReceiveStatus(
  line: { qty: number },
  lots: LotTrailEntry[],
): PartialReceiveStatus {
  const ordered = Number(line.qty)
  const received = lots.reduce((s, e) => s + Number(e.lot.qty_received), 0)
  const is_unreceived = received === 0
  const is_complete = received >= ordered
  const is_partial = !is_unreceived && !is_complete
  return { ordered, received, is_partial, is_unreceived, is_complete }
}
