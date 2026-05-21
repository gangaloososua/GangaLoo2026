// SERVER-ONLY data layer for the Inventory module.
//
// Two concerns, deliberately separated:
//   - fetchStockOnHand(): current quantity per product per warehouse,
//     summed from inventory_lots.qty_remaining (the authoritative live
//     stock source the sale/lot system maintains). NO costs — this feeds
//     the seller/distributor stock view.
//   - fetchStockMovements(): the owner/admin history ledger (added next).
import { createClient } from '@/lib/supabase/server'

export type StockOnHandRow = {
  productId: string
  productName: string
  warehouseId: string
  warehouseName: string
  qtyOnHand: number
}

// Sum qty_remaining grouped by (product, warehouse). Rows that net to
// zero or below are dropped — only things actually in stock are shown.
export async function fetchStockOnHand(): Promise<StockOnHandRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('inventory_lots')
    .select(
      'product_id, warehouse_id, qty_remaining, products(name), warehouses(name)',
    )
    .gt('qty_remaining', 0)
  if (error) throw error

  type Acc = {
    productId: string
    productName: string
    warehouseId: string
    warehouseName: string
    qtyOnHand: number
  }
  const byKey = new Map<string, Acc>()
  for (const lot of (data ?? []) as unknown as Array<{
    product_id: string
    warehouse_id: string
    qty_remaining: number
    products: { name: string } | null
    warehouses: { name: string } | null
  }>) {
    const key = lot.product_id + '|' + lot.warehouse_id
    const existing = byKey.get(key)
    const qty = Number(lot.qty_remaining) || 0
    if (existing) {
      existing.qtyOnHand += qty
    } else {
      byKey.set(key, {
        productId: lot.product_id,
        productName: lot.products?.name ?? '(unknown product)',
        warehouseId: lot.warehouse_id,
        warehouseName: lot.warehouses?.name ?? '(unknown warehouse)',
        qtyOnHand: qty,
      })
    }
  }

  return Array.from(byKey.values())
    .filter((r) => r.qtyOnHand > 0)
    .sort(
      (a, b) =>
        a.productName.localeCompare(b.productName) ||
        a.warehouseName.localeCompare(b.warehouseName),
    )
}

// ---------------------------------------------------------------------------
// Movement ledger (owner/admin). Full history with unit costs.
// ---------------------------------------------------------------------------

export type StockMovementKind =
  | 'purchase_in'
  | 'sale_out'
  | 'transfer_in'
  | 'transfer_out'
  | 'adjustment_in'
  | 'adjustment_out'
  | 'return_in'
  | 'initial'

export type StockMovementRow = {
  id: string
  occurredAt: string
  productId: string
  productName: string
  warehouseId: string
  warehouseName: string
  kind: StockMovementKind
  qtyDelta: number
  unitCostDop: number | null
  adjustmentReason: string | null
  createdByName: string | null
}

export type StockMovementFilters = {
  warehouseId?: string
  productId?: string
  kind?: StockMovementKind
  categoryId?: string
  fromDate?: string
  toDate?: string
}

const MOVEMENT_LIMIT = 500

export async function fetchStockMovements(
  filters: StockMovementFilters = {},
): Promise<StockMovementRow[]> {
  const supabase = await createClient()
  let query = supabase
    .from('stock_movements')
    .select(
      'id, occurred_at, product_id, warehouse_id, kind, qty_delta, unit_cost_dop, adjustment_reason, products(name), warehouses(name), profiles(full_name)',
    )
    .order('occurred_at', { ascending: false })
    .limit(MOVEMENT_LIMIT)

  // Category filter: resolve to product ids whose PRIMARY category matches,
  // then constrain movements to them. Empty category -> no rows (not all).
  let categoryProductIds: string[] | null = null
  if (filters.categoryId) {
    const { data: childRows, error: childErr } = await supabase
      .from('categories')
      .select('id')
      .eq('parent_id', filters.categoryId)
    if (childErr) throw childErr
    const catIds = [
      filters.categoryId,
      ...(childRows ?? []).map((c) => (c as { id: string }).id),
    ]
    const { data: pcRows, error: pcErr } = await supabase
      .from('product_categories')
      .select('product_id')
      .in('category_id', catIds)
      .eq('is_primary', true)
    if (pcErr) throw pcErr
    categoryProductIds = (pcRows ?? []).map((r) => (r as { product_id: string }).product_id)
    if (categoryProductIds.length === 0) return []
  }

  if (filters.warehouseId) query = query.eq('warehouse_id', filters.warehouseId)
  if (filters.productId) query = query.eq('product_id', filters.productId)
  if (categoryProductIds) query = query.in('product_id', categoryProductIds)
  if (filters.kind) query = query.eq('kind', filters.kind)
  if (filters.fromDate) query = query.gte('occurred_at', filters.fromDate)
  if (filters.toDate) query = query.lte('occurred_at', filters.toDate)

  const { data, error } = await query
  if (error) throw error

  return ((data ?? []) as unknown as Array<{
    id: string
    occurred_at: string
    product_id: string
    warehouse_id: string
    kind: StockMovementKind
    qty_delta: number
    unit_cost_dop: number | null
    adjustment_reason: string | null
    products: { name: string } | null
    warehouses: { name: string } | null
    profiles: { full_name: string | null } | null
  }>).map((m) => ({
    id: m.id,
    occurredAt: m.occurred_at,
    productId: m.product_id,
    productName: m.products?.name ?? '(unknown product)',
    warehouseId: m.warehouse_id,
    warehouseName: m.warehouses?.name ?? '(unknown warehouse)',
    kind: m.kind,
    qtyDelta: Number(m.qty_delta) || 0,
    unitCostDop: m.unit_cost_dop === null ? null : Number(m.unit_cost_dop),
    adjustmentReason: m.adjustment_reason,
    createdByName: m.profiles?.full_name ?? null,
  }))
}

// ---------------------------------------------------------------------------
// Filter support: categories (for the dropdown) + product type-to-search.
// ---------------------------------------------------------------------------

export type CategoryOption = {
  id: string
  name: string
  parentId: string | null
}

// All active categories (both top-level and sub). The UI groups them by
// parent for the dropdown. Two-level tree only (verified: no deeper nesting).
export async function listCategoriesForFilter(): Promise<CategoryOption[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, parent_id')
    .eq('is_active', true)
    .order('display_order', { ascending: true })
    .order('name', { ascending: true })
  if (error) throw error
  return ((data ?? []) as Array<{ id: string; name: string; parent_id: string | null }>).map(
    (c) => ({ id: c.id, name: c.name, parentId: c.parent_id }),
  )
}

export type InventoryProductOption = { id: string; name: string; sku: string | null }

// Lightweight global product search for the ledger filter: id + name + sku
// only, active products, matched by name or SKU. Warehouse-agnostic and
// price-agnostic (unlike searchProductsForSale).
export async function searchInventoryProducts(
  query: string,
  limit = 20,
): Promise<InventoryProductOption[]> {
  const q = query.replace(/[,'"()*%]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!q) return []
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('products')
    .select('id, name, sku')
    .eq('is_active', true)
    .or('name.ilike.%' + q + '%,sku.ilike.%' + q + '%')
    .order('name', { ascending: true })
    .limit(limit)
  if (error) throw error
  return ((data ?? []) as Array<{ id: string; name: string; sku: string | null }>).map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
  }))
}
