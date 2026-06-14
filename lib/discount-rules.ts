// Round 16.3 - Discount rules read surface
//
// SERVER-ONLY data layer. Imports next/headers transitively via
// createClient — do not import this file from a 'use client'
// component.
//
// Read only. Writes go through
// app/(dashboard)/discount-rules/actions.ts.
//
// Spec: docs/round-16-sale-discounts.md
// ============================================================

import { createClient } from '@/lib/supabase/server'

export type DiscountRuleKind =
  | 'bulk'
  | 'club_tier'
  | 'promotion'
  | 'customer_override'
  | 'logistics_surcharge'
  | 'coupon'

export type ClubTier =
  | 'none'
  | 'bronze'
  | 'silver'
  | 'gold'
  | 'platinum'

export type DiscountRuleRow = {
  id: string
  kind: DiscountRuleKind
  name: string
  isActive: boolean
  startsAt: string | null
  endsAt: string | null
  // Scope (any combination, depending on kind)
  scopeProductId: string | null
  scopeProductName: string | null
  scopeCategoryId: string | null
  scopeCategoryName: string | null
  scopeWarehouseId: string | null
  scopeWarehouseName: string | null
  scopeClubTier: ClubTier | null
  scopeCustomerId: string | null
  scopeCustomerName: string | null
  scopeSourceWarehouseId: string | null
  scopeSourceWarehouseName: string | null
  scopeFulfillmentWarehouseId: string | null
  scopeFulfillmentWarehouseName: string | null
  // Math fields
  thresholdQty: number | null
  deltaPercent: number | null
  deltaCents: number | null
  priority: number
  // Round 42: coupon fields (null for non-coupon kinds)
  code: string | null
  scopeChannel: 'pos' | 'online' | null
  // Promotion online-deal slot (null for non-promotion / non-featured)
  dealSlot: 'daily' | 'weekly' | null
  createdAt: string
  updatedAt: string
}

export type ListDiscountRulesOptions = {
  kind?: DiscountRuleKind | null
  activeOnly?: boolean
}

// ============================================================
// Internal raw row type
// ============================================================

type RawRule = {
  id: string
  kind: DiscountRuleKind
  name: string
  is_active: boolean
  starts_at: string | null
  ends_at: string | null
  scope_product_id: string | null
  scope_category_id: string | null
  scope_warehouse_id: string | null
  scope_club_tier: ClubTier | null
  scope_customer_id: string | null
  scope_source_warehouse_id: string | null
  scope_fulfillment_warehouse_id: string | null
  threshold_qty: number | string | null
  delta_percent: number | string | null
  delta_cents: number | null
  priority: number
  code: string | null
  scope_channel: 'pos' | 'online' | null
  deal_slot: 'daily' | 'weekly' | null
  created_at: string
  updated_at: string
}

function toNumberOrNull(v: number | string | null | undefined): number | null {
  if (v == null) return null
  return typeof v === 'string' ? Number(v) : v
}

// ============================================================
// listDiscountRules
// ============================================================

export async function listDiscountRules(
  opts: ListDiscountRulesOptions = {},
): Promise<DiscountRuleRow[]> {
  const supabase = await createClient()
  let q = supabase
    .from('discount_rules')
    .select(
      'id, kind, name, is_active, starts_at, ends_at, ' +
        'scope_product_id, scope_category_id, scope_warehouse_id, ' +
        'scope_club_tier, scope_customer_id, ' +
        'scope_source_warehouse_id, scope_fulfillment_warehouse_id, ' +
        'threshold_qty, delta_percent, delta_cents, ' +
        'code, scope_channel, deal_slot, ' +
        'priority, created_at, updated_at',
    )
    .order('is_active', { ascending: false })
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false })

  if (opts.kind) q = q.eq('kind', opts.kind)
  if (opts.activeOnly) q = q.eq('is_active', true)

  const { data, error } = await q
  if (error) throw error
  const raw = (data ?? []) as unknown as RawRule[]

  // Batch resolve names for all scope fields
  const productIds = new Set<string>()
  const categoryIds = new Set<string>()
  const warehouseIds = new Set<string>()
  const customerIds = new Set<string>()
  for (const r of raw) {
    if (r.scope_product_id) productIds.add(r.scope_product_id)
    if (r.scope_category_id) categoryIds.add(r.scope_category_id)
    if (r.scope_warehouse_id) warehouseIds.add(r.scope_warehouse_id)
    if (r.scope_source_warehouse_id)
      warehouseIds.add(r.scope_source_warehouse_id)
    if (r.scope_fulfillment_warehouse_id)
      warehouseIds.add(r.scope_fulfillment_warehouse_id)
    if (r.scope_customer_id) customerIds.add(r.scope_customer_id)
  }

  const productNameById = new Map<string, string>()
  if (productIds.size > 0) {
    const { data: ps, error: pErr } = await supabase
      .from('products')
      .select('id, name')
      .in('id', Array.from(productIds))
    if (pErr) throw pErr
    for (const p of (ps ?? []) as Array<{ id: string; name: string }>) {
      productNameById.set(p.id, p.name)
    }
  }

  const categoryNameById = new Map<string, string>()
  if (categoryIds.size > 0) {
    const { data: cs, error: cErr } = await supabase
      .from('categories')
      .select('id, name')
      .in('id', Array.from(categoryIds))
    if (cErr) throw cErr
    for (const c of (cs ?? []) as Array<{ id: string; name: string }>) {
      categoryNameById.set(c.id, c.name)
    }
  }

  const warehouseNameById = new Map<string, string>()
  if (warehouseIds.size > 0) {
    const { data: ws, error: wErr } = await supabase
      .from('warehouses')
      .select('id, name')
      .in('id', Array.from(warehouseIds))
    if (wErr) throw wErr
    for (const w of (ws ?? []) as Array<{ id: string; name: string }>) {
      warehouseNameById.set(w.id, w.name)
    }
  }

  const customerNameById = new Map<string, string>()
  if (customerIds.size > 0) {
    const { data: prof, error: prErr } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', Array.from(customerIds))
    if (prErr) throw prErr
    for (const p of (prof ?? []) as Array<{ id: string; full_name: string }>) {
      customerNameById.set(p.id, p.full_name)
    }
  }

  return raw.map((r) => ({
    id: r.id,
    kind: r.kind,
    name: r.name,
    isActive: r.is_active,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    scopeProductId: r.scope_product_id,
    scopeProductName: r.scope_product_id
      ? productNameById.get(r.scope_product_id) ?? null
      : null,
    scopeCategoryId: r.scope_category_id,
    scopeCategoryName: r.scope_category_id
      ? categoryNameById.get(r.scope_category_id) ?? null
      : null,
    scopeWarehouseId: r.scope_warehouse_id,
    scopeWarehouseName: r.scope_warehouse_id
      ? warehouseNameById.get(r.scope_warehouse_id) ?? null
      : null,
    scopeClubTier: r.scope_club_tier,
    scopeCustomerId: r.scope_customer_id,
    scopeCustomerName: r.scope_customer_id
      ? customerNameById.get(r.scope_customer_id) ?? null
      : null,
    scopeSourceWarehouseId: r.scope_source_warehouse_id,
    scopeSourceWarehouseName: r.scope_source_warehouse_id
      ? warehouseNameById.get(r.scope_source_warehouse_id) ?? null
      : null,
    scopeFulfillmentWarehouseId: r.scope_fulfillment_warehouse_id,
    scopeFulfillmentWarehouseName: r.scope_fulfillment_warehouse_id
      ? warehouseNameById.get(r.scope_fulfillment_warehouse_id) ?? null
      : null,
    thresholdQty: toNumberOrNull(r.threshold_qty),
    deltaPercent: toNumberOrNull(r.delta_percent),
    deltaCents: r.delta_cents,
    priority: r.priority,
    code: r.code,
    scopeChannel: r.scope_channel,
    dealSlot: r.deal_slot,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }))
}

// ============================================================
// getDiscountRuleById
// ============================================================

export async function getDiscountRuleById(
  id: string,
): Promise<DiscountRuleRow | null> {
  const rules = await listDiscountRules({})
  return rules.find((r) => r.id === id) ?? null
}
