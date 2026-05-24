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
// createBulkRule  (Round 19)
// ----------------------------------------------------------------------
export type CreateBulkRuleInput = {
  name: string
  scopeKind: 'product' | 'category'
  scopeProductId: string | null
  scopeCategoryId: string | null
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
  } else {
    return { ok: false, error: 'Pick a product or a category' }
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
      created_by: caller.id,
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }
  revalidatePath('/discount-rules')
  return { ok: true, ruleId: (data as { id: string }).id }
}
