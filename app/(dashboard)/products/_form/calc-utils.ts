// Pure helpers shared by calculator-tab.tsx (client) and actions.ts (server).
// No React, no 'use client' — safe to import from either side.

export type CostCalcState = {
  base_cost_usd: number | null
  shipping_usd: number | null
  tax_usd: number | null
  discount_usd: number | null
  exchange_rate: number | null
  transport_dop_per_unit: number | null
  margin_percent: number | null
  commission_percent: number | null
}

// Tiered round-up:
//   raw <= 3000 -> next 25
//   raw <= 5000 -> next 50
//   raw  > 5000 -> next 100
export function roundFinalPrice(raw: number): number {
  const step = raw <= 3000 ? 25 : raw <= 5000 ? 50 : 100
  return Math.ceil(raw / step) * step
}

export function computeFinalPrice(s: CostCalcState): {
  landed: number | null
  price: number | null
  priceRounded: number | null
} {
  const haveLanded =
    s.base_cost_usd != null &&
    s.shipping_usd != null &&
    s.tax_usd != null &&
    s.discount_usd != null &&
    s.exchange_rate != null &&
    s.transport_dop_per_unit != null

  if (!haveLanded) return { landed: null, price: null, priceRounded: null }

  const usdSub =
    s.base_cost_usd! + s.shipping_usd! + s.tax_usd! - s.discount_usd!
  const landed = usdSub * s.exchange_rate! + s.transport_dop_per_unit!

  const havePrice =
    s.margin_percent != null &&
    s.commission_percent != null &&
    s.commission_percent < 100

  if (!havePrice) return { landed, price: null, priceRounded: null }

  const price =
    (landed * (1 + s.margin_percent! / 100)) /
    (1 - s.commission_percent! / 100)
  return { landed, price, priceRounded: roundFinalPrice(price) }
}

// Light validator: returns the same object only if it has the expected shape
// (object whose known keys are number-or-null). Defensive against arbitrary
// JSON arriving at the server action.
export function parseCostCalcState(raw: unknown): CostCalcState | null {
  if (!raw || typeof raw !== 'object') return null
  const keys: (keyof CostCalcState)[] = [
    'base_cost_usd',
    'shipping_usd',
    'tax_usd',
    'discount_usd',
    'exchange_rate',
    'transport_dop_per_unit',
    'margin_percent',
    'commission_percent',
  ]
  const obj = raw as Record<string, unknown>
  const out: Partial<CostCalcState> = {}
  for (const k of keys) {
    const v = obj[k]
    if (v == null) {
      out[k] = null
    } else if (typeof v === 'number' && Number.isFinite(v)) {
      out[k] = v
    } else {
      return null
    }
  }
  return out as CostCalcState
}
