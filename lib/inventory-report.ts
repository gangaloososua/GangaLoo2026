// Reports - Inventory valuation data layer.
//
// Thin wrapper around the read-only inventory_report() RPC. A point-in-time
// snapshot of current stock (qty_remaining > 0), so no arguments. All money
// values are in CENTS.
//
//   cost_cents   - stock valued at landed cost (what it cost you)
//   retail_cents - stock valued at sell price (potential revenue)
//   margin_cents - retail - cost (unrealized margin sitting in stock)
//   slow_*       - stock received more than 120 days ago (cash on the shelf)
//
// Breakdowns: by warehouse, by primary product category (no double-counting),
// and top products by cost value. inventory_lots.unit_cost_dop is PESOS; the
// RPC converts to cents.

import { createClient } from '@/lib/supabase/server'

export type InvWarehouseRow = { warehouse: string; units: number; cost_cents: number }
export type InvCategoryRow = { category: string; units: number; cost_cents: number }
export type InvProductRow = {
  name: string | null
  sku: string | null
  units: number
  cost_cents: number
}

export type InventoryReport = {
  units: number
  cost_cents: number
  retail_cents: number
  margin_cents: number
  slow_cost_cents: number
  slow_units: number
  incoming_units: number
  incoming_cost_cents: number
  by_warehouse: InvWarehouseRow[]
  by_category: InvCategoryRow[]
  top_products: InvProductRow[]
}

export async function fetchInventoryReport(): Promise<InventoryReport> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('inventory_report')
  if (error) throw new Error(error.message)
  return data as InventoryReport
}
