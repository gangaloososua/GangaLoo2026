// lib/us-products.ts
//
// US dropship shop — read layer + price helper. Phase 1.
// See US-DROPSHIP-PLAN.md.
//
// SERVER-ONLY. Reads go through the service-role admin client because
// us_products is RLS-locked with no policies (same as payroll_*). Writes
// live in app/(dashboard)/us-products/actions.ts.
//
// NOTE: the public storefront (Phase 2) will NOT use this file. It will read a
// SAFE view that hides supplier_cost / markup / supplier_url. This layer is the
// OWNER-side view and is allowed to see cost + markup.

import { createAdminClient } from '@/lib/supabase/admin'

export type UsProduct = {
  id: string
  sku: string | null
  name: string
  slug: string
  description: string | null
  supplierCostUsd: number
  supplierShippingUsd: number
  markupPercent: number
  priceOverrideUsd: number | null
  supplierUrl: string | null
  primaryImageUrl: string | null
  category: string | null
  isActive: boolean
  visibleInStore: boolean
  createdAt: string
  updatedAt: string
}

type RawUsProduct = {
  id: string
  sku: string | null
  name: string
  slug: string
  description: string | null
  supplier_cost_usd: number | string | null
  supplier_shipping_usd: number | string | null
  markup_percent: number | string | null
  price_override_usd: number | string | null
  supplier_url: string | null
  primary_image_url: string | null
  category: string | null
  is_active: boolean
  visible_in_store: boolean
  created_at: string
  updated_at: string
}

function num(v: number | string | null | undefined, fallback = 0): number {
  if (v == null) return fallback
  const n = typeof v === 'string' ? Number(v) : v
  return Number.isFinite(n) ? n : fallback
}

function numOrNull(v: number | string | null | undefined): number | null {
  if (v == null) return null
  const n = typeof v === 'string' ? Number(v) : v
  return Number.isFinite(n) ? n : null
}

// ---------------------------------------------------------------------------
// Price computation — the single source of truth.
//
// Effective USD price = override if set, else (cost + shipping) * (1 + markup/100).
// Rounded to 2 decimals. This MUST match whatever the storefront read fn does
// in Phase 2 (same lesson as quote-vs-charge on the DR side).
// ---------------------------------------------------------------------------
export function computeUsPriceUsd(p: {
  supplierCostUsd: number
  supplierShippingUsd: number
  markupPercent: number
  priceOverrideUsd: number | null
}): number {
  if (p.priceOverrideUsd != null && p.priceOverrideUsd > 0) {
    return Math.round(p.priceOverrideUsd * 100) / 100
  }
  const base = num(p.supplierCostUsd) + num(p.supplierShippingUsd)
  const withMarkup = base * (1 + num(p.markupPercent) / 100)
  return Math.round(withMarkup * 100) / 100
}

function mapRow(r: RawUsProduct): UsProduct {
  return {
    id: r.id,
    sku: r.sku,
    name: r.name,
    slug: r.slug,
    description: r.description,
    supplierCostUsd: num(r.supplier_cost_usd),
    supplierShippingUsd: num(r.supplier_shipping_usd),
    markupPercent: num(r.markup_percent, 5),
    priceOverrideUsd: numOrNull(r.price_override_usd),
    supplierUrl: r.supplier_url,
    primaryImageUrl: r.primary_image_url,
    category: r.category,
    isActive: r.is_active,
    visibleInStore: r.visible_in_store,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

const SELECT_COLS =
  'id, sku, name, slug, description, ' +
  'supplier_cost_usd, supplier_shipping_usd, markup_percent, price_override_usd, ' +
  'supplier_url, primary_image_url, category, ' +
  'is_active, visible_in_store, created_at, updated_at'

export type ListUsProductsOptions = {
  search?: string | null
  activeOnly?: boolean
}

export async function listUsProducts(
  opts: ListUsProductsOptions = {},
): Promise<UsProduct[]> {
  const supabase = createAdminClient()
  let q = supabase
    .from('us_products')
    .select(SELECT_COLS)
    .order('name', { ascending: true })

  if (opts.activeOnly) q = q.eq('is_active', true)
  if (opts.search && opts.search.trim()) {
    const s = opts.search.trim()
    q = q.or(`name.ilike.%${s}%,sku.ilike.%${s}%,category.ilike.%${s}%`)
  }

  const { data, error } = await q
  if (error) throw error
  return ((data ?? []) as unknown as RawUsProduct[]).map(mapRow)
}

export async function getUsProductById(
  id: string,
): Promise<UsProduct | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('us_products')
    .select(SELECT_COLS)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return mapRow(data as unknown as RawUsProduct)
}
