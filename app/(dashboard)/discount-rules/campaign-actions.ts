'use server'

// Round 80b - Seasonal campaign server action.
//
// createCampaignPromotions: creates ONE ordinary promotion rule per chosen
// product, all with the same %, store, dates and campaign label (e.g.
// 'halloween'). Because they are normal promotions, the register and the
// online checkout already charge them; the storefront uses the campaign
// label to show them in the themed box. Owner/admin only.
//
// Kept in its own file so the existing actions.ts is not touched.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/guard'
import { CAMPAIGNS, isCampaignId } from '@/lib/campaigns'

export type CreateCampaignInput = {
  campaign: string
  productIds: string[]
  deltaPercent: number
  scopeWarehouseId: string | null // null = all stores
  startsAt: string // ISO datetime
  endsAt: string // ISO datetime
  priority: number
  // Seller commission % while the campaign runs (null = normal commission).
  // Same column/behaviour as a promotion's "Seller commission % during this deal".
  commissionPercent?: number | null
}

export type CreateCampaignResult =
  | { ok: true; created: number }
  | { ok: false; error: string }

export async function createCampaignPromotions(
  input: CreateCampaignInput,
): Promise<CreateCampaignResult> {
  const caller = await requireRole(['owner', 'admin'] as const)

  if (!isCampaignId(input.campaign)) {
    return { ok: false, error: 'Pick a campaign' }
  }
  const ids = Array.from(new Set((input.productIds ?? []).filter(Boolean)))
  if (ids.length === 0) return { ok: false, error: 'Add at least one product' }
  if (ids.length > 200) return { ok: false, error: 'Too many products (max 200)' }
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
  if (!input.startsAt || !input.endsAt) {
    return { ok: false, error: 'Start and end are required' }
  }
  if (new Date(input.startsAt).getTime() >= new Date(input.endsAt).getTime()) {
    return { ok: false, error: 'The start must be before the end' }
  }
  if (
    !Number.isFinite(input.priority) ||
    input.priority < 0 ||
    !Number.isInteger(input.priority)
  ) {
    return { ok: false, error: 'Priority must be a non-negative integer' }
  }
  if (
    input.commissionPercent != null &&
    (!Number.isFinite(input.commissionPercent) ||
      input.commissionPercent < 0 ||
      input.commissionPercent > 100)
  ) {
    return { ok: false, error: 'Campaign commission must be between 0 and 100' }
  }

  const camp = CAMPAIGNS.find((c) => c.id === input.campaign)!
  const supabase = await createClient()

  // Product names, so each rule gets a readable name in the rules list.
  const { data: prods, error: pErr } = await supabase
    .from('products')
    .select('id, name')
    .in('id', ids)
  if (pErr) return { ok: false, error: pErr.message }
  const nameById = new Map<string, string>()
  for (const p of (prods ?? []) as Array<{ id: string; name: string }>) {
    nameById.set(p.id, p.name)
  }

  const rows = ids.map((pid) => ({
    kind: 'promotion',
    name: `${camp.emoji} ${camp.label}: ${nameById.get(pid) ?? 'Producto'}`,
    is_active: true,
    starts_at: input.startsAt,
    ends_at: input.endsAt,
    scope_product_id: pid,
    scope_warehouse_id: input.scopeWarehouseId || null,
    deal_slot: null,
    delta_percent: input.deltaPercent,
    priority: input.priority,
    campaign: camp.id,
    commission_percent: input.commissionPercent ?? null,
    created_by: caller.id,
  }))

  const { error } = await supabase.from('discount_rules').insert(rows)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/discount-rules')
  return { ok: true, created: rows.length }
}
