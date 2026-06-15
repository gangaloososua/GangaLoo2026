// lib/us-orders.ts
// PURE, client-safe module for the US dropship orders admin (Phase 4).
// Types + helpers only — no server imports, safe in both server and client.

export type UsOrderStatus =
  | 'pending'
  | 'paid'
  | 'cancelled'
  | 'forwarded'
  | 'shipped'
  | 'completed'

export type UsOrderItem = {
  product_id: string
  name: string
  slug: string
  qty: number
  price_usd: number
}

export type UsTimelineEntry = { label: string; ts: string; method?: string }

export type UsOrder = {
  id: string
  createdAt: string
  customerName: string
  customerEmail: string
  customerPhone: string | null
  shipLine1: string
  shipLine2: string | null
  shipCity: string
  shipState: string
  shipZip: string
  shipCountry: string
  items: UsOrderItem[]
  subtotalUsd: number
  shippingUsd: number
  taxUsd: number
  totalUsd: number
  status: UsOrderStatus
  paymentMethod: string | null
  paymentRef: string | null
  paidAt: string | null
  supplierRef: string | null
  supplierCostUsd: number | null
  internalNotes: string | null
  timeline: UsTimelineEntry[]
  incomeTransactionId: string | null
  supplierTransactionId: string | null
}

export type MoneyAccountOption = {
  id: string
  name: string
  scope: string
  currency: string
}

export type AccountCategoryOption = {
  id: string
  name: string
  scope: string
}

// Stages the owner can advance an order through (after it is paid).
// pending/cancelled are not manual targets here; payment sets paid.
export const US_FULFILMENT_STAGES: UsOrderStatus[] = [
  'paid',
  'forwarded',
  'shipped',
  'completed',
]

export const US_STATUS_LABEL: Record<UsOrderStatus, string> = {
  pending: 'Pending payment',
  paid: 'Paid',
  cancelled: 'Cancelled',
  forwarded: 'Forwarded to supplier',
  shipped: 'Shipped',
  completed: 'Completed',
}

export function usd(n: number | null | undefined): string {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : 0
  return 'US$ ' + v.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function shortId(id: string): string {
  return id.slice(0, 8).toUpperCase()
}

// Profit = sale income - supplier cost (only meaningful once both are known).
export function usOrderProfit(o: UsOrder): number | null {
  if (o.supplierCostUsd == null) return null
  return o.totalUsd - o.supplierCostUsd
}
