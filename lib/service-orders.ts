// lib/service-orders.ts
// Shared types + money math for "service orders" (personal-shopper / encargos).
// PURE module: no server-only imports, so both server pages and client
// components can use it. All money is in CENTS.
//
// NOTE: computeTotals() mirrors the SQL function public.service_order_totals
// (db/migrations/round-50a-service-orders.sql). Keep the two in sync.

export type ServiceStage =
  | 'invoice'
  | 'ordered'
  | 'arrived'
  | 'notified'
  | 'responded'
  | 'ready'
  | 'completed'

export type ServicePlatform = 'amazon' | 'temu' | 'shein' | 'aliexpress' | 'other'

export type ServiceItem = { name: string; qty: number; price_cents: number }

export type ServicePayment = {
  id?: string
  kind: 'deposit' | 'final' | 'other'
  amount_cents: number
  ts: number
  note?: string
}

export type ServiceTimelineEntry = { label: string; ts: number }

export type ServiceOrder = {
  id: string
  created_at: string
  updated_at: string
  client_name: string
  client_phone: string
  platform: ServicePlatform
  source_ref: string | null
  items: ServiceItem[]
  description: string | null
  amount_cents: number
  source_shipping_cents: number
  delivery_fee_cents: number
  gangaloo_fee_cents: number
  financing_cents: number
  payments: ServicePayment[]
  stage: ServiceStage
  fulfilment: 'pickup' | 'delivery' | null
  delivery_date: string | null
  delivery_address: string | null
  delivery_note: string | null
  delivery_lat: number | null
  delivery_lng: number | null
  timeline: ServiceTimelineEntry[]
  internal_notes: string | null
  created_by: string | null
  source_sale_id: string | null
}

export type ServiceTotals = {
  subtotalCents: number
  sourceShippingCents: number
  gangalooFeeCents: number
  financingCents: number
  deliveryChargeCents: number
  totalCents: number
  paidCents: number
  balanceCents: number
}

export const DEFAULT_DELIVERY_FEE_CENTS = 20000 // RD$200

export const PLATFORMS: ServicePlatform[] = [
  'amazon',
  'temu',
  'shein',
  'aliexpress',
  'other',
]

export const STAGES: ServiceStage[] = [
  'invoice',
  'ordered',
  'arrived',
  'notified',
  'responded',
  'ready',
  'completed',
]

export function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export function subtotalCentsOf(o: ServiceOrder): number {
  if (Array.isArray(o.items) && o.items.length > 0) {
    return o.items.reduce((s, it) => s + num(it.qty) * num(it.price_cents), 0)
  }
  return num(o.amount_cents)
}

export function paidCentsOf(o: ServiceOrder): number {
  return (o.payments || []).reduce((s, p) => s + num(p.amount_cents), 0)
}

export function computeTotals(o: ServiceOrder): ServiceTotals {
  const subtotal = subtotalCentsOf(o)
  const paid = paidCentsOf(o)
  const deliveryCharge = o.fulfilment === 'delivery' ? num(o.delivery_fee_cents) : 0
  const total =
    subtotal +
    num(o.source_shipping_cents) +
    num(o.gangaloo_fee_cents) +
    num(o.financing_cents) +
    deliveryCharge
  return {
    subtotalCents: subtotal,
    sourceShippingCents: num(o.source_shipping_cents),
    gangalooFeeCents: num(o.gangaloo_fee_cents),
    financingCents: num(o.financing_cents),
    deliveryChargeCents: deliveryCharge,
    totalCents: total,
    paidCents: paid,
    balanceCents: Math.max(0, total - paid),
  }
}

export function productCount(o: ServiceOrder): number | null {
  if (Array.isArray(o.items) && o.items.length > 0) {
    return o.items.reduce((s, it) => s + num(it.qty), 0)
  }
  return null
}
