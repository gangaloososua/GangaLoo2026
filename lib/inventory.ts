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

  if (filters.warehouseId) query = query.eq('warehouse_id', filters.warehouseId)
  if (filters.productId) query = query.eq('product_id', filters.productId)
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
