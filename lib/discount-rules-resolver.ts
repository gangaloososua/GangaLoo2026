// Round 16.4 â€” TS resolver for line discounts
// Round 17  â€” club_tier support added
// Round 19  â€” bulk support added (product/category scope, walk-in capable)
// Round 20  â€” promotion support added; stale walk-in early return removed
//
// Mirrors the SQL function `public.resolve_line_discounts`
// (see db/migrations/round-20-promotion-01-resolver.sql for the
// current version).
// Used for cart-time live preview in both POS and online-order forms;
// SQL function is the authority at create-sale time.
//
// !!! KEEP IN LOCK-STEP WITH THE SQL FUNCTION !!!
// If SQL adds a new rule kind, this file must also handle it; if SQL
// changes the cap or stacking, change here too. Spec Â§5 is the
// shared design contract.
//
// Currently supports: customer_override (Round 16), club_tier (Round 17),
// bulk (Round 19), promotion (Round 20).

import type { DiscountRuleRow, DiscountRuleKind } from '@/lib/discount-rules'

const CAP_FACTOR = 0.70 // 30% off max â†’ 70% retained

// Sort key per rule kind. Lower = earlier in the stack. Round 17 puts
// club_tier first; customer_override layers on top. Future kinds slot
// in here (and the same constant must mirror SQL's CASE WHEN ordering).
const KIND_SORT_KEY: Record<DiscountRuleKind, number> = {
  club_tier: 0,
  customer_override: 1,
  bulk: 2,                // Round 19
  promotion: 3,           // Round 20
  logistics_surcharge: 4, // reserved for Round 21
}

export type AppliedDiscount = {
  ruleId: string
  ruleKind: DiscountRuleKind
  percent: number | null
  amountCents: number // negative for discount
  capHit: boolean
}

export type ResolveLineDiscountInput = {
  productId: string
  // Round 19: the line product's category, for bulk/category scope
  // matching. Pass null if the product has no category.
  categoryId: string | null
  qty: number
  unitPriceCents: number
  customerId: string | null
  // Round 17: customer's club_tier (from profiles.club_tier). Required.
  // Pass null for walk-in / unknown / 'none'-tier customers. When
  // null, club_tier rules can't fire (matches SQL guard).
  customerClubTier: string | null
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
  // No walk-in early return. Since Round 19 (bulk) and Round 20
  // (promotion) can fire without a customer, we let each kind's filter
  // decide. customer_override and club_tier still won't match a walk-in
  // (their guards below require a customer / a tier). Mirrors the SQL,
  // which dropped its p_customer_id IS NULL early return in Round 19.

  const atMs = input.at.getTime()

  // Effective tier: treat null and 'none' uniformly as "no tier match"
  // (Model A: 'none' = not yet enrolled, can't get tier discounts).
  const effectiveTier =
    input.customerClubTier && input.customerClubTier !== 'none'
      ? input.customerClubTier
      : null

  // Candidates: active rules matching by kind-specific scope, whose
  // date window contains `at`. Sort key mirrors the SQL ORDER BY:
  // kind sort key, then priority desc, then created_at asc.
  const candidates = input.rules
    .filter((r) => {
      if (!r.isActive) return false
      if (r.deltaPercent == null) return false
      if (r.startsAt && new Date(r.startsAt).getTime() > atMs) return false
      if (r.endsAt && new Date(r.endsAt).getTime() < atMs) return false

      if (r.kind === 'customer_override') {
        return (
          input.customerId !== null && r.scopeCustomerId === input.customerId
        )
      }
      if (r.kind === 'club_tier') {
        return (
          effectiveTier !== null && r.scopeClubTier === effectiveTier
        )
      }
      if (r.kind === 'bulk') {
        if (r.thresholdQty == null || input.qty < r.thresholdQty) return false
        const productMatch = r.scopeProductId === input.productId
        const categoryMatch =
          r.scopeCategoryId !== null &&
          input.categoryId !== null &&
          r.scopeCategoryId === input.categoryId
        // Store-wide bulk rule: both scopes null = applies to every product.
        const storeWideMatch =
          r.scopeProductId === null && r.scopeCategoryId === null
        return productMatch || categoryMatch || storeWideMatch
      }
      // Round 20: promotion â€” time-bound product deal. No customer, no
      // tier, no threshold â†’ fires for everyone incl. walk-ins. The
      // date-window filter above already bounds it (daily/weekly).
      if (r.kind === 'promotion') {
        return r.scopeProductId === input.productId
      }
      // Other kinds: not yet supported here. The SQL function will
      // produce the canonical audit at confirm time.
      return false
    })
    .sort((a, b) => {
      const aKey = KIND_SORT_KEY[a.kind] ?? 99
      const bKey = KIND_SORT_KEY[b.kind] ?? 99
      if (aKey !== bKey) return aKey - bKey
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
