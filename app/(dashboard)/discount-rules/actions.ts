'use server'

// Round 16.3 — Discount rules server actions
//
// Direct table writes (no RPC wrapper in v1). The requireRole gate
// is the security boundary. The schema CHECK constraint guards
// shape; this layer adds friendly validation messages before the
// CHECK would fire.
//
// Spec: docs/round-16-sale-discounts.md

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/guard'

// ----------------------------------------------------------------------
// Shared result shape
// ----------------------------------------------------------------------
type Ok<T> = { ok: true } & T
type Err = { ok: false; error: string }

// ----------------------------------------------------------------------
// createCustomerOverrideRule
// ----------------------------------------------------------------------

export type CreateCustomerOverrideRuleInput = {
  name: string
  customerId: string
  deltaPercent: number
  startsAt: string | null // ISO datetime
  endsAt: string | null // ISO datetime
  priority: number
}

export type CreateCustomerOverrideRuleResult = Ok<{ ruleId: string }> | Err

export async function createCustomerOverrideRule(
  input: CreateCustomerOverrideRuleInput,
): Promise<CreateCustomerOverrideRuleResult> {
  const caller = await requireRole(['owner', 'admin'] as const)

  const name = input.name.trim()
  if (!name) return { ok: false, error: 'Rule name is required' }
  if (!input.customerId) return { ok: false, error: 'Customer is required' }
  if (
    !Number.isFinite(input.deltaPercent) ||
    input.deltaPercent <= 0 ||
    input.deltaPercent >= 100
  ) {
    return {
      ok: false,
      error: 'Discount percent must be greater than 0 and less than 100',
    }
  }
  if (
    input.startsAt &&
    input.endsAt &&
    new Date(input.startsAt) > new Date(input.endsAt)
  ) {
    return { ok: false, error: 'Start date must be on or before end date' }
  }
  if (
    !Number.isFinite(input.priority) ||
    input.priority < 0 ||
    !Number.isInteger(input.priority)
  ) {
    return { ok: false, error: 'Priority must be a non-negative integer' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('discount_rules')
    .insert({
      kind: 'customer_override',
      name,
      is_active: true,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      scope_customer_id: input.customerId,
      delta_percent: input.deltaPercent,
      priority: input.priority,
      created_by: caller.id,
    })
    .select('id')
    .single()

  if (error) return { ok: false, error: error.message }

  revalidatePath('/discount-rules')
  return { ok: true, ruleId: (data as { id: string }).id }
}

// ----------------------------------------------------------------------
// createClubTierRule  (Round 17)
// ----------------------------------------------------------------------

export type CreateClubTierRuleInput = {
  name: string
  clubTier: string // bronze | silver | gold | platinum (never 'none')
  deltaPercent: number
  startsAt: string | null // ISO datetime
  endsAt: string | null // ISO datetime
  priority: number
}

export type CreateClubTierRuleResult = Ok<{ ruleId: string }> | Err

const ALLOWED_TIERS = ['bronze', 'silver', 'gold', 'platinum']

export async function createClubTierRule(
  input: CreateClubTierRuleInput,
): Promise<CreateClubTierRuleResult> {
  const caller = await requireRole(['owner', 'admin'] as const)

  const name = input.name.trim()
  if (!name) return { ok: false, error: 'Rule name is required' }
  if (!ALLOWED_TIERS.includes(input.clubTier)) {
    return { ok: false, error: 'Pick a valid club tier' }
  }
  if (
    !Number.isFinite(input.deltaPercent) ||
    input.deltaPercent <= 0 ||
    input.deltaPercent >= 100
  ) {
    return {
      ok: false,
      error: 'Discount percent must be greater than 0 and less than 100',
    }
  }
  if (
    input.startsAt &&
    input.endsAt &&
    new Date(input.startsAt) > new Date(input.endsAt)
  ) {
    return { ok: false, error: 'Start date must be on or before end date' }
  }
  if (
    !Number.isFinite(input.priority) ||
    input.priority < 0 ||
    !Number.isInteger(input.priority)
  ) {
    return { ok: false, error: 'Priority must be a non-negative integer' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('discount_rules')
    .insert({
      kind: 'club_tier',
      name,
      is_active: true,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      scope_club_tier: input.clubTier,
      delta_percent: input.deltaPercent,
      priority: input.priority,
      created_by: caller.id,
    })
    .select('id')
    .single()

  if (error) return { ok: false, error: error.message }

  revalidatePath('/discount-rules')
  return { ok: true, ruleId: (data as { id: string }).id }
}

// ----------------------------------------------------------------------
// createBulkRule  (Round 19; Round 61 adds optional source-warehouse scope)
// ----------------------------------------------------------------------
export type CreateBulkRuleInput = {
  name: string
  scopeKind: 'product' | 'category' | 'all'
  scopeProductId: string | null
  scopeCategoryId: string | null
  // Round 61: optional source-warehouse scope. null = applies at every
  // warehouse (default). When set, the rule only fires for a sale from
  // that source warehouse. Written to scope_source_warehouse_id.
  scopeSourceWarehouseId?: string | null
  thresholdQty: number
  deltaPercent: number
  startsAt: string | null // ISO datetime
  endsAt: string | null // ISO datetime
  priority: number
}
export type CreateBulkRuleResult = Ok<{ ruleId: string }> | Err

export async function createBulkRule(
  input: CreateBulkRuleInput,
): Promise<CreateBulkRuleResult> {
  const caller = await requireRole(['owner', 'admin'] as const)
  const name = input.name.trim()
  if (!name) return { ok: false, error: 'Rule name is required' }

  // Exactly one scope: product XOR category.
  if (input.scopeKind === 'product') {
    if (!input.scopeProductId) return { ok: false, error: 'Pick a product' }
  } else if (input.scopeKind === 'category') {
    if (!input.scopeCategoryId) return { ok: false, error: 'Pick a category' }
  } else if (input.scopeKind === 'all') {
    // Store-wide: no product/category needed. Both scopes save as null.
  } else {
    return { ok: false, error: 'Pick a product, a category, or all products' }
  }

  if (
    !Number.isFinite(input.thresholdQty) ||
    input.thresholdQty < 1 ||
    !Number.isInteger(input.thresholdQty)
  ) {
    return {
      ok: false,
      error: 'Minimum quantity must be a whole number of 1 or more',
    }
  }
  if (
    !Number.isFinite(input.deltaPercent) ||
    input.deltaPercent <= 0 ||
    input.deltaPercent >= 100
  ) {
    return {
      ok: false,
      error: 'Discount percent must be greater than 0 and less than 100',
    }
  }
  if (
    input.startsAt &&
    input.endsAt &&
    new Date(input.startsAt) > new Date(input.endsAt)
  ) {
    return { ok: false, error: 'Start date must be on or before end date' }
  }
  if (
    !Number.isFinite(input.priority) ||
    input.priority < 0 ||
    !Number.isInteger(input.priority)
  ) {
    return { ok: false, error: 'Priority must be a non-negative integer' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('discount_rules')
    .insert({
      kind: 'bulk',
      name,
      is_active: true,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      scope_product_id:
        input.scopeKind === 'product' ? input.scopeProductId : null,
      scope_category_id:
        input.scopeKind === 'category' ? input.scopeCategoryId : null,
      // Round 61: blank picker -> null = all warehouses.
      scope_source_warehouse_id: input.scopeSourceWarehouseId ?? null,
      threshold_qty: input.thresholdQty,
      delta_percent: input.deltaPercent,
      priority: input.priority,
      created_by: caller.id,
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }
  revalidatePath('/discount-rules')
  return { ok: true, ruleId: (data as { id: string }).id }
}

// ----------------------------------------------------------------------
// setRuleActive
// ----------------------------------------------------------------------

export type SetRuleActiveInput = {
  ruleId: string
  isActive: boolean
}

export type SetRuleActiveResult = Ok<object> | Err

export async function setRuleActive(
  input: SetRuleActiveInput,
): Promise<SetRuleActiveResult> {
  await requireRole(['owner', 'admin'] as const)

  if (!input.ruleId) return { ok: false, error: 'Rule id is required' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('discount_rules')
    .update({ is_active: input.isActive })
    .eq('id', input.ruleId)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/discount-rules')
  return { ok: true }
}

// ----------------------------------------------------------------------
// deleteRule
//
// Hard delete. Only allowed when no audit rows reference the rule
// (FK with no ON DELETE policy → DB rejects). Soft-deactivate via
// setRuleActive(false) for the common case.
// ----------------------------------------------------------------------

export type DeleteRuleInput = { ruleId: string }
export type DeleteRuleResult = Ok<object> | Err

export async function deleteRule(
  input: DeleteRuleInput,
): Promise<DeleteRuleResult> {
  await requireRole(['owner', 'admin'] as const)

  if (!input.ruleId) return { ok: false, error: 'Rule id is required' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('discount_rules')
    .delete()
    .eq('id', input.ruleId)

  if (error) {
    // Likely FK violation from sale_discount_applications. Surface a
    // friendly message instead of the raw DB error.
    if (
      error.message.toLowerCase().includes('foreign key') ||
      error.code === '23503'
    ) {
      return {
        ok: false,
        error:
          'This rule has audit records attached. Deactivate it instead of deleting.',
      }
    }
    return { ok: false, error: error.message }
  }

  revalidatePath('/discount-rules')
  return { ok: true }
}

// ----------------------------------------------------------------------
// createPromotionRule  (Round 20)
//
// A promotion is a time-bound % off a single product, for EVERYONE
// (incl. walk-ins), with NO minimum quantity. Product-scoped only.
// ----------------------------------------------------------------------
export type CreatePromotionRuleInput = {
  name: string
  scopeProductId: string
  deltaPercent: number
  startsAt: string | null // ISO datetime
  endsAt: string | null // ISO datetime
  priority: number
  // Online deal (optional). When dealSlot is set, this promotion is featured
  // on the online store as a Daily/Weekly deal with a countdown.
  scopeWarehouseId?: string | null // null = all stores
  dealSlot?: 'daily' | 'weekly' | null
  // Round 86: seller commission % while this promotion is live (null = normal).
  commissionPercent?: number | null
}
export type CreatePromotionRuleResult = Ok<{ ruleId: string }> | Err

export async function createPromotionRule(
  input: CreatePromotionRuleInput,
): Promise<CreatePromotionRuleResult> {
  const caller = await requireRole(['owner', 'admin'] as const)
  const name = input.name.trim()
  if (!name) return { ok: false, error: 'Rule name is required' }
  if (!input.scopeProductId) return { ok: false, error: 'Pick a product' }
  if (
    !Number.isFinite(input.deltaPercent) ||
    input.deltaPercent <= 0 ||
    input.deltaPercent >= 100
  ) {
    return {
      ok: false,
      error: 'Discount percent must be greater than 0 and less than 100',
    }
  }
  if (
    input.startsAt &&
    input.endsAt &&
    new Date(input.startsAt) > new Date(input.endsAt)
  ) {
    return { ok: false, error: 'Start date must be on or before end date' }
  }
  if (
    !Number.isFinite(input.priority) ||
    input.priority < 0 ||
    !Number.isInteger(input.priority)
  ) {
    return { ok: false, error: 'Priority must be a non-negative integer' }
  }

  // Online deal guards: a featured online deal needs a valid slot and an end
  // time (the countdown target). scope_warehouse_id is optional (null = all).
  if (input.dealSlot != null && !['daily', 'weekly'].includes(input.dealSlot)) {
    return { ok: false, error: 'Deal type must be daily or weekly' }
  }
  if (input.dealSlot != null && !input.endsAt) {
    return { ok: false, error: 'An online deal needs an end date and time' }
  }
  if (
    input.commissionPercent != null &&
    (!Number.isFinite(input.commissionPercent) ||
      input.commissionPercent < 0 ||
      input.commissionPercent > 100)
  ) {
    return { ok: false, error: 'Deal commission must be between 0 and 100' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('discount_rules')
    .insert({
      kind: 'promotion',
      name,
      is_active: true,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      scope_product_id: input.scopeProductId,
      scope_warehouse_id: input.scopeWarehouseId ?? null,
      deal_slot: input.dealSlot ?? null,
      delta_percent: input.deltaPercent,
      priority: input.priority,
      commission_percent: input.commissionPercent ?? null,
      created_by: caller.id,
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }
  revalidatePath('/discount-rules')
  return { ok: true, ruleId: (data as { id: string }).id }
}

// ----------------------------------------------------------------------
// createCouponRule  (Round 42)
//
// A coupon is an order-level discount unlocked by a CODE typed at
// checkout. Admin picks EITHER a percentage OR a fixed RD$ amount.
// Optional store (scope_source_warehouse_id; null = all stores) and
// optional channel (scope_channel: 'pos' | 'online'; null = both).
// Coupons do not use priority — the checker picks by specificity.
// Uniqueness (active code per store+channel) is enforced by the DB
// index; a 23505 is surfaced as a friendly message.
// ----------------------------------------------------------------------
export type CreateCouponRuleInput = {
  name: string
  code: string
  amountType: 'percent' | 'fixed'
  deltaPercent: number | null // when amountType = 'percent'
  deltaCents: number | null // when amountType = 'fixed' (RD$ in cents)
  scopeSourceWarehouseId: string | null // null = all stores
  scopeChannel: 'pos' | 'online' | null // null = both channels
  startsAt: string | null // ISO datetime
  endsAt: string | null // ISO datetime
}
export type CreateCouponRuleResult = Ok<{ ruleId: string }> | Err

// Letters, digits, dot, dash, underscore; 2–40 chars; no spaces.
const COUPON_CODE_RE = /^[A-Za-z0-9._-]{2,40}$/

export async function createCouponRule(
  input: CreateCouponRuleInput,
): Promise<CreateCouponRuleResult> {
  const caller = await requireRole(['owner', 'admin'] as const)

  const name = input.name.trim()
  if (!name) return { ok: false, error: 'Rule name is required' }

  const code = input.code.trim().toUpperCase()
  if (!code) return { ok: false, error: 'Coupon code is required' }
  if (!COUPON_CODE_RE.test(code)) {
    return {
      ok: false,
      error:
        'Code can use letters, numbers, dot, dash and underscore (2–40 characters, no spaces)',
    }
  }

  let delta_percent: number | null = null
  let delta_cents: number | null = null
  if (input.amountType === 'percent') {
    const p = Number(input.deltaPercent)
    if (!Number.isFinite(p) || p <= 0 || p > 100) {
      return {
        ok: false,
        error: 'Percent must be greater than 0 and at most 100',
      }
    }
    delta_percent = p
  } else if (input.amountType === 'fixed') {
    const c = Number(input.deltaCents)
    if (!Number.isFinite(c) || c <= 0 || !Number.isInteger(c)) {
      return { ok: false, error: 'Fixed amount must be greater than zero' }
    }
    delta_cents = c
  } else {
    return { ok: false, error: 'Pick a percentage or a fixed amount' }
  }

  if (
    input.scopeChannel != null &&
    !['pos', 'online'].includes(input.scopeChannel)
  ) {
    return { ok: false, error: 'Channel must be POS, online, or both' }
  }
  if (
    input.startsAt &&
    input.endsAt &&
    new Date(input.startsAt) > new Date(input.endsAt)
  ) {
    return { ok: false, error: 'Start date must be on or before end date' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('discount_rules')
    .insert({
      kind: 'coupon',
      name,
      code,
      is_active: true,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      scope_source_warehouse_id: input.scopeSourceWarehouseId || null,
      scope_channel: input.scopeChannel ?? null,
      delta_percent,
      delta_cents,
      created_by: caller.id,
    })
    .select('id')
    .single()

  if (error) {
    // Unique-index violation -> duplicate active code for this store+channel.
    if (
      error.code === '23505' ||
      error.message.toLowerCase().includes('duplicate')
    ) {
      return {
        ok: false,
        error:
          'An active coupon with that code already exists for this store and channel. Use a different code, or deactivate the old one first.',
      }
    }
    return { ok: false, error: error.message }
  }

  revalidatePath('/discount-rules')
  return { ok: true, ruleId: (data as { id: string }).id }
}
// ----------------------------------------------------------------------
// updatePromotionRule
//
// Edit an existing promotion rule in place (reuse a daily/weekly deal by
// swapping product, %, store, slot and dates) instead of creating a new
// rule each time. Mirrors createPromotionRule's validation exactly.
// Promotion-only: refuses to touch a row of any other kind.
// ----------------------------------------------------------------------
export type UpdatePromotionRuleInput = {
  ruleId: string
  name: string
  scopeProductId: string
  deltaPercent: number
  startsAt: string | null // ISO datetime
  endsAt: string | null // ISO datetime
  priority: number
  scopeWarehouseId?: string | null // null = all stores
  dealSlot?: 'daily' | 'weekly' | null
  // Round 86: seller commission % while this promotion is live (null = normal).
  commissionPercent?: number | null
}
export type UpdatePromotionRuleResult = Ok<{ ruleId: string }> | Err

export async function updatePromotionRule(
  input: UpdatePromotionRuleInput,
): Promise<UpdatePromotionRuleResult> {
  await requireRole(['owner', 'admin'] as const)

  if (!input.ruleId) return { ok: false, error: 'Rule id is required' }
  const name = input.name.trim()
  if (!name) return { ok: false, error: 'Rule name is required' }
  if (!input.scopeProductId) return { ok: false, error: 'Pick a product' }
  if (
    !Number.isFinite(input.deltaPercent) ||
    input.deltaPercent <= 0 ||
    input.deltaPercent >= 100
  ) {
    return {
      ok: false,
      error: 'Discount percent must be greater than 0 and less than 100',
    }
  }
  if (
    input.startsAt &&
    input.endsAt &&
    new Date(input.startsAt) > new Date(input.endsAt)
  ) {
    return { ok: false, error: 'Start date must be on or before end date' }
  }
  if (
    !Number.isFinite(input.priority) ||
    input.priority < 0 ||
    !Number.isInteger(input.priority)
  ) {
    return { ok: false, error: 'Priority must be a non-negative integer' }
  }
  if (input.dealSlot != null && !['daily', 'weekly'].includes(input.dealSlot)) {
    return { ok: false, error: 'Deal type must be daily or weekly' }
  }
  if (input.dealSlot != null && !input.endsAt) {
    return { ok: false, error: 'An online deal needs an end date and time' }
  }
  if (
    input.commissionPercent != null &&
    (!Number.isFinite(input.commissionPercent) ||
      input.commissionPercent < 0 ||
      input.commissionPercent > 100)
  ) {
    return { ok: false, error: 'Deal commission must be between 0 and 100' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('discount_rules')
    .update({
      name,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      scope_product_id: input.scopeProductId,
      scope_warehouse_id: input.scopeWarehouseId ?? null,
      deal_slot: input.dealSlot ?? null,
      delta_percent: input.deltaPercent,
      priority: input.priority,
      commission_percent: input.commissionPercent ?? null,
    })
    .eq('id', input.ruleId)
    .eq('kind', 'promotion') // safety: never edit a non-promotion row here
    .select('id')
    .single()

  if (error) return { ok: false, error: error.message }
  if (!data) {
    return { ok: false, error: 'Promotion rule not found.' }
  }

  revalidatePath('/discount-rules')
  return { ok: true, ruleId: (data as { id: string }).id }
}

// ----------------------------------------------------------------------
// createBundleRule  (Round 85)
//
// A bundle is a SET TOTAL PRICE for specific products bought together
// (e.g. 1 wig + 1 shampoo = RD$6,000). The price is stored in
// delta_cents; the products + quantities go in
// discount_rule_bundle_items. Owner decisions: the bundle price is
// final (no other discounts on bundled units), repeats per complete
// set, and is NOT limited by the 30% cap.
// ----------------------------------------------------------------------
export type CreateBundleRuleInput = {
  name: string
  items: Array<{ productId: string; qty: number }>
  priceCents: number // set total price for ONE complete bundle
  scopeWarehouseId: string | null // null = all stores
  startsAt: string | null // ISO datetime
  endsAt: string | null // ISO datetime
}
export type CreateBundleRuleResult = Ok<{ ruleId: string }> | Err

export async function createBundleRule(
  input: CreateBundleRuleInput,
): Promise<CreateBundleRuleResult> {
  const caller = await requireRole(['owner', 'admin'] as const)
  const name = input.name.trim()
  if (!name) return { ok: false, error: 'Rule name is required' }

  const items = input.items.filter((i) => i.productId)
  // Round 87: 2+ items in TOTAL (2 different products, or e.g. 3x one).
  if (items.length < 1) {
    return { ok: false, error: 'Pick at least one product' }
  }
  if (items.reduce((n, i) => n + (Number(i.qty) || 0), 0) < 2) {
    return { ok: false, error: 'A bundle needs at least 2 items in total' }
  }
  const ids = new Set(items.map((i) => i.productId))
  if (ids.size !== items.length) {
    return { ok: false, error: 'Each product can only be in the bundle once' }
  }
  for (const i of items) {
    if (!Number.isInteger(i.qty) || i.qty < 1) {
      return { ok: false, error: 'Each quantity must be a whole number of 1 or more' }
    }
  }
  if (!Number.isInteger(input.priceCents) || input.priceCents <= 0) {
    return { ok: false, error: 'Bundle price must be more than 0' }
  }
  if (
    input.startsAt &&
    input.endsAt &&
    new Date(input.startsAt) > new Date(input.endsAt)
  ) {
    return { ok: false, error: 'Start date must be on or before end date' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('discount_rules')
    .insert({
      kind: 'bundle',
      name,
      is_active: true,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      scope_warehouse_id: input.scopeWarehouseId ?? null,
      delta_cents: input.priceCents,
      priority: 0,
      created_by: caller.id,
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }
  const ruleId = (data as { id: string }).id

  const { error: itemsErr } = await supabase
    .from('discount_rule_bundle_items')
    .insert(
      items.map((i) => ({ rule_id: ruleId, product_id: i.productId, qty: i.qty })),
    )
  if (itemsErr) {
    // Don't leave a bundle with no products behind.
    await supabase.from('discount_rules').delete().eq('id', ruleId)
    return { ok: false, error: itemsErr.message }
  }

  revalidatePath('/discount-rules')
  return { ok: true, ruleId }
}

// ----------------------------------------------------------------------
// updateBundleRule  (Round 85)
//
// Edit an existing bundle in place: name, products + quantities, set
// price, store, dates. Mirrors createBundleRule's validation. Bundle-only:
// refuses to touch a row of any other kind. The product list is replaced
// (old items removed, new ones inserted); if inserting the new list fails,
// the old list is put back so the bundle is never left empty.
// ----------------------------------------------------------------------
export type UpdateBundleRuleInput = CreateBundleRuleInput & { ruleId: string }
export type UpdateBundleRuleResult = Ok<{ ruleId: string }> | Err

export async function updateBundleRule(
  input: UpdateBundleRuleInput,
): Promise<UpdateBundleRuleResult> {
  await requireRole(['owner', 'admin'] as const)
  if (!input.ruleId) return { ok: false, error: 'Rule id is required' }
  const name = input.name.trim()
  if (!name) return { ok: false, error: 'Rule name is required' }

  const items = input.items.filter((i) => i.productId)
  // Round 87: 2+ items in TOTAL (2 different products, or e.g. 3x one).
  if (items.length < 1) {
    return { ok: false, error: 'Pick at least one product' }
  }
  if (items.reduce((n, i) => n + (Number(i.qty) || 0), 0) < 2) {
    return { ok: false, error: 'A bundle needs at least 2 items in total' }
  }
  if (new Set(items.map((i) => i.productId)).size !== items.length) {
    return { ok: false, error: 'Each product can only be in the bundle once' }
  }
  for (const i of items) {
    if (!Number.isInteger(i.qty) || i.qty < 1) {
      return { ok: false, error: 'Each quantity must be a whole number of 1 or more' }
    }
  }
  if (!Number.isInteger(input.priceCents) || input.priceCents <= 0) {
    return { ok: false, error: 'Bundle price must be more than 0' }
  }
  if (
    input.startsAt &&
    input.endsAt &&
    new Date(input.startsAt) > new Date(input.endsAt)
  ) {
    return { ok: false, error: 'Start date must be on or before end date' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('discount_rules')
    .update({
      name,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      scope_warehouse_id: input.scopeWarehouseId ?? null,
      delta_cents: input.priceCents,
    })
    .eq('id', input.ruleId)
    .eq('kind', 'bundle') // safety: never edit a non-bundle row here
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'Bundle not found.' }

  // Replace the product list, keeping a copy of the old one to restore.
  const { data: oldItems, error: oldErr } = await supabase
    .from('discount_rule_bundle_items')
    .select('product_id, qty')
    .eq('rule_id', input.ruleId)
  if (oldErr) return { ok: false, error: oldErr.message }

  const { error: delErr } = await supabase
    .from('discount_rule_bundle_items')
    .delete()
    .eq('rule_id', input.ruleId)
  if (delErr) return { ok: false, error: delErr.message }

  const { error: insErr } = await supabase
    .from('discount_rule_bundle_items')
    .insert(
      items.map((i) => ({ rule_id: input.ruleId, product_id: i.productId, qty: i.qty })),
    )
  if (insErr) {
    const old = (oldItems ?? []) as Array<{ product_id: string; qty: number }>
    if (old.length > 0) {
      await supabase.from('discount_rule_bundle_items').insert(
        old.map((o) => ({ rule_id: input.ruleId, product_id: o.product_id, qty: o.qty })),
      )
    }
    return { ok: false, error: insErr.message }
  }

  revalidatePath('/discount-rules')
  return { ok: true, ruleId: input.ruleId }
}

// ----------------------------------------------------------------------
// Bundle image  (Round 85d)
//
// One optional picture per bundle, shown on the online store. Stored in the
// public 'product-images' bucket under bundles/<ruleId>/ (existing bucket
// policies already allow staff upload/delete). The public URL is saved in
// discount_rules.image_url. Replacing or removing a picture also deletes the
// old file so the bucket doesn't fill with leftovers.
// ----------------------------------------------------------------------
const IMAGE_BUCKET = 'product-images'
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

function bundleImagePathFromUrl(url: string | null): string | null {
  if (!url) return null
  const marker = `/storage/v1/object/public/${IMAGE_BUCKET}/`
  const i = url.indexOf(marker)
  if (i === -1) return null
  const path = decodeURIComponent(url.slice(i + marker.length))
  // Only ever delete files in our own bundles/ folder.
  return path.startsWith('bundles/') ? path : null
}

export type BundleImageResult = Ok<{ imageUrl: string | null }> | Err

export async function uploadBundleImage(
  formData: FormData,
): Promise<BundleImageResult> {
  await requireRole(['owner', 'admin'] as const)
  const ruleId = String(formData.get('rule_id') ?? '')
  const file = formData.get('file') as File | null
  if (!ruleId || !file) return { ok: false, error: 'Missing bundle or file.' }
  if (!IMAGE_TYPES.includes(file.type)) {
    return { ok: false, error: `Unsupported file type: ${file.type}` }
  }
  if (file.size > 4.5 * 1024 * 1024) {
    return { ok: false, error: 'Picture must be smaller than 4.5 MB.' }
  }

  const supabase = await createClient()
  const { data: rule, error: ruleErr } = await supabase
    .from('discount_rules')
    .select('id, image_url')
    .eq('id', ruleId)
    .eq('kind', 'bundle')
    .maybeSingle()
  if (ruleErr) return { ok: false, error: ruleErr.message }
  if (!rule) return { ok: false, error: 'Bundle not found.' }

  const dot = file.name.lastIndexOf('.')
  const ext = dot === -1 ? '.jpg' : file.name.slice(dot).toLowerCase()
  const path = `bundles/${ruleId}/${crypto.randomUUID()}${ext}`

  const { error: upErr } = await supabase.storage
    .from(IMAGE_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false })
  if (upErr) return { ok: false, error: upErr.message }

  const { data: pub } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path)
  const imageUrl = pub.publicUrl

  const { error: updErr } = await supabase
    .from('discount_rules')
    .update({ image_url: imageUrl })
    .eq('id', ruleId)
    .eq('kind', 'bundle')
  if (updErr) {
    await supabase.storage.from(IMAGE_BUCKET).remove([path])
    return { ok: false, error: updErr.message }
  }

  const oldPath = bundleImagePathFromUrl(
    (rule as { image_url: string | null }).image_url,
  )
  if (oldPath) await supabase.storage.from(IMAGE_BUCKET).remove([oldPath])

  revalidatePath('/discount-rules')
  return { ok: true, imageUrl }
}

export async function removeBundleImage(
  ruleId: string,
): Promise<BundleImageResult> {
  await requireRole(['owner', 'admin'] as const)
  if (!ruleId) return { ok: false, error: 'Rule id is required' }
  const supabase = await createClient()
  const { data: rule, error: ruleErr } = await supabase
    .from('discount_rules')
    .select('id, image_url')
    .eq('id', ruleId)
    .eq('kind', 'bundle')
    .maybeSingle()
  if (ruleErr) return { ok: false, error: ruleErr.message }
  if (!rule) return { ok: false, error: 'Bundle not found.' }

  const { error: updErr } = await supabase
    .from('discount_rules')
    .update({ image_url: null })
    .eq('id', ruleId)
    .eq('kind', 'bundle')
  if (updErr) return { ok: false, error: updErr.message }

  const oldPath = bundleImagePathFromUrl(
    (rule as { image_url: string | null }).image_url,
  )
  if (oldPath) await supabase.storage.from(IMAGE_BUCKET).remove([oldPath])

  revalidatePath('/discount-rules')
  return { ok: true, imageUrl: null }
}
