// Round 85 — Cart-level BUNDLE resolver (set price for products bought together)
//
// A bundle rule (discount_rules.kind = 'bundle') says: these products, in
// these quantities (discount_rule_bundle_items), cost delta_cents IN TOTAL
// when bought together. Owner decisions (2026-09-26):
//   - The bundle price is FINAL: bundled units get no other discount
//     (club tier, promotion, bulk, customer override). Units NOT used in a
//     bundle still get the normal per-line discounts.
//   - It REPEATS for every complete set in the cart (2 wigs + 2 phones =
//     2 bundles).
//   - It is NOT limited by the 30% cap.
//   - If the bundle price would NOT be cheaper than the units' current
//     price, the bundle is skipped (customer never pays more).
//
// Bundles can't be decided one line at a time (they need the whole cart),
// so this sits ON TOP of lib/discount-rules-resolver.ts: it first takes
// bundled units out of each line, then runs the normal per-line resolver on
// whatever units are left, and merges the two.
//
// The dormant SQL `resolve_line_discounts` is per-line and cannot express a
// bundle, so it is intentionally NOT mirrored there. The online store gets
// its own SQL version of this logic (keep the two in step).

import type { DiscountRuleRow } from '@/lib/discount-rules'
import {
  resolveLineDiscount,
  type AppliedDiscount,
} from '@/lib/discount-rules-resolver'

export type CartDiscountLine = {
  key: string // unique per cart line
  productId: string
  categoryId: string | null
  qty: number
  unitPriceCents: number
}

export type CartDiscountInput = {
  lines: CartDiscountLine[]
  customerId: string | null
  customerClubTier: string | null
  sourceWarehouseId: string | null
  rules: DiscountRuleRow[]
  at: Date
}

export type CartLineDiscount = {
  totalDiscountCents: number // positive; subtract from unit * qty
  applied: AppliedDiscount[]
  bundledQty: number // how many of this line's units went into bundles
}

function bundleIsLive(
  r: DiscountRuleRow,
  sourceWarehouseId: string | null,
  atMs: number,
): boolean {
  if (r.kind !== 'bundle' || !r.isActive) return false
  if (r.deltaCents == null || r.deltaCents <= 0) return false
  if (r.bundleItems.length < 2) return false
  if (r.startsAt && new Date(r.startsAt).getTime() > atMs) return false
  if (r.endsAt && new Date(r.endsAt).getTime() < atMs) return false
  // Store scope: blank = every store (same column promotions use).
  return r.scopeWarehouseId === null || r.scopeWarehouseId === sourceWarehouseId
}

export function resolveCartDiscounts(
  input: CartDiscountInput,
): Map<string, CartLineDiscount> {
  const atMs = input.at.getTime()

  // Units still free to join a bundle, per line.
  const free = new Map<string, number>()
  for (const l of input.lines) free.set(l.key, Math.max(0, Math.floor(l.qty)))

  const bundledQty = new Map<string, number>()
  const bundleDisc = new Map<string, number>()
  const bundleApplied = new Map<string, AppliedDiscount[]>()

  const bundles = input.rules
    .filter((r) => bundleIsLive(r, input.sourceWarehouseId, atMs))
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    })

  for (const rule of bundles) {
    // How many complete sets can the cart make right now?
    let sets = Infinity
    for (const item of rule.bundleItems) {
      const have = input.lines
        .filter((l) => l.productId === item.productId)
        .reduce((n, l) => n + (free.get(l.key) ?? 0), 0)
      sets = Math.min(sets, Math.floor(have / item.qty))
    }
    if (!Number.isFinite(sets) || sets < 1) continue

    // Work out which units go in (tentatively) and their current value.
    const take: Array<{ key: string; units: number; value: number }> = []
    let regular = 0
    for (const item of rule.bundleItems) {
      let need = item.qty * sets
      for (const l of input.lines) {
        if (need === 0) break
        if (l.productId !== item.productId) continue
        const avail = free.get(l.key) ?? 0
        const units = Math.min(avail, need)
        if (units <= 0) continue
        take.push({ key: l.key, units, value: units * l.unitPriceCents })
        regular += units * l.unitPriceCents
        need -= units
      }
    }

    const bundleTotal = (rule.deltaCents ?? 0) * sets
    const discount = regular - bundleTotal
    if (discount <= 0) continue // not cheaper: skip, leave units free

    // Commit: spread the discount across the bundled lines by value.
    let given = 0
    take.forEach((t, i) => {
      const share =
        i === take.length - 1
          ? discount - given
          : Math.floor((discount * t.value) / regular)
      given += share
      free.set(t.key, (free.get(t.key) ?? 0) - t.units)
      bundledQty.set(t.key, (bundledQty.get(t.key) ?? 0) + t.units)
      bundleDisc.set(t.key, (bundleDisc.get(t.key) ?? 0) + share)
      const list = bundleApplied.get(t.key) ?? []
      list.push({
        ruleId: rule.id,
        ruleKind: 'bundle',
        percent: null,
        amountCents: -share,
        capHit: false,
      })
      bundleApplied.set(t.key, list)
    })
  }

  // Normal per-line discounts on the units left over.
  const out = new Map<string, CartLineDiscount>()
  for (const l of input.lines) {
    const inBundle = bundledQty.get(l.key) ?? 0
    const rest = Math.max(0, l.qty - inBundle)
    const normal =
      rest > 0
        ? resolveLineDiscount({
            productId: l.productId,
            categoryId: l.categoryId,
            qty: rest,
            unitPriceCents: l.unitPriceCents,
            customerId: input.customerId,
            customerClubTier: input.customerClubTier,
            sourceWarehouseId: input.sourceWarehouseId,
            rules: input.rules,
            at: input.at,
          })
        : { totalDiscountCents: 0, applied: [] as AppliedDiscount[] }
    out.set(l.key, {
      totalDiscountCents: normal.totalDiscountCents + (bundleDisc.get(l.key) ?? 0),
      applied: [...(bundleApplied.get(l.key) ?? []), ...normal.applied],
      bundledQty: inBundle,
    })
  }
  return out
}
