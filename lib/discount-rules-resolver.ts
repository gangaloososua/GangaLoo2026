// Round 16.4 — TS resolver for line discounts
//
// Mirrors the SQL function `public.resolve_line_discounts`
// (see db/migrations/round-16-sale-discounts-02-resolver.sql).
// Used for cart-time live preview in both POS and online-order forms;
// SQL function is the authority at create-sale time.
//
// !!! KEEP IN LOCK-STEP WITH THE SQL FUNCTION !!!
// If SQL adds a new rule kind, this file must also handle it; if SQL
// changes the cap or stacking, change here too. Spec §5 is the
// shared design contract.
//
// v1 handles ONLY kind='customer_override', matching the SQL function.

import type { DiscountRuleRow, DiscountRuleKind } from '@/lib/discount-rules'

const CAP_FACTOR = 0.70 // 30% off max → 70% retained

export type AppliedDiscount = {
  ruleId: string
  ruleKind: DiscountRuleKind
  percent: number | null
  amountCents: number // negative for discount
  capHit: boolean
}

export type ResolveLineDiscountInput = {
  productId: string
  qty: number
  unitPriceCents: number
  customerId: string | null
  sourceWarehouseId: string | null
  rules: DiscountRuleRow[]
  at: Date
}

export type ResolveLineDiscountResult = {
  // Positive value; the cart subtracts this from line total.
  totalDiscountCents: number
  applied: AppliedDiscount[]
}

export function resolveLineDiscount(
  input: ResolveLineDiscountInput,
): ResolveLineDiscountResult {
  // Walk-in (no customer) can't match customer_override. Matches the
  // SQL guard on p_customer_id IS NULL.
  if (input.customerId == null) {
    return { totalDiscountCents: 0, applied: [] }
  }

  const atMs = input.at.getTime()

  // Candidates: active customer_override rules for this customer
  // whose date window contains `at`. Sort matches SQL ORDER BY
  // priority DESC, created_at ASC.
  const candidates = input.rules
    .filter(
      (r) =>
        r.isActive &&
        r.kind === 'customer_override' &&
        r.scopeCustomerId === input.customerId &&
        r.deltaPercent != null &&
        (!r.startsAt || new Date(r.startsAt).getTime() <= atMs) &&
        (!r.endsAt || new Date(r.endsAt).getTime() >= atMs),
    )
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    })

  if (candidates.length === 0) {
    return { totalDiscountCents: 0, applied: [] }
  }

  const lineTotal = input.unitPriceCents * input.qty

  // Compute running multiplicative factors.
  const runningFactors: number[] = []
  let runningFactor = 1.0
  for (const r of candidates) {
    runningFactor *= 1.0 - (r.deltaPercent ?? 0) / 100.0
    runningFactors.push(runningFactor)
  }

  // Cap check: if combined discount > 30%, scale per-rule contributions
  // proportionally so they sum to exactly the capped discount.
  const capHit = runningFactor < CAP_FACTOR
  const scale = capHit
    ? (1.0 - CAP_FACTOR) / (1.0 - runningFactor)
    : 1.0

  // Build per-rule applied array.
  const applied: AppliedDiscount[] = []
  let prevFactor = 1.0
  for (let i = 0; i < candidates.length; i++) {
    const r = candidates[i]
    const marginalFactor = (prevFactor - runningFactors[i]) * scale
    const marginalCents = Math.round(lineTotal * marginalFactor)
    applied.push({
      ruleId: r.id,
      ruleKind: r.kind,
      percent: r.deltaPercent,
      amountCents: -marginalCents, // negative = discount
      capHit,
    })
    prevFactor = runningFactors[i]
  }

  // Total discount as positive value (cart subtracts it).
  const totalDiscountCents = Math.abs(
    applied.reduce((acc, a) => acc + a.amountCents, 0),
  )

  return { totalDiscountCents, applied }
}
