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
//
// Monthly snapshots (Round 81a): like the Balance Sheet, inventory valuation
// is current qty x cost and cannot be rebuilt for the past (historical shelf
// quantities were never stored), so we bank a copy of the live report per
// calendar month going forward. The snapshot RPCs gate on owner/admin in the
// DB, so they MUST be called via the regular server client (auth.uid() must be
// present), exactly like fetchInventoryReport below.

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

/** One saved monthly snapshot (metadata only, for the picker). */
export type InventoryReportSnapshotMeta = {
  /** First day of the month, 'YYYY-MM-DD'. */
  period_month: string
  /** When the snapshot was captured (ISO timestamp). */
  captured_at: string
}

export async function fetchInventoryReport(): Promise<InventoryReport> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('inventory_report')
  if (error) throw new Error(error.message)
  return data as InventoryReport
}

/** All saved months, newest first. */
export async function listInventoryReportSnapshots(): Promise<InventoryReportSnapshotMeta[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('list_inventory_report_snapshots')
  if (error) throw new Error(error.message)
  return (data ?? []) as InventoryReportSnapshotMeta[]
}

/** One saved month's report, or null if none exists for that month. */
export async function getInventoryReportSnapshot(month: string): Promise<InventoryReport | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_inventory_report_snapshot', { p_month: month })
  if (error) throw new Error(error.message)
  return (data ?? null) as InventoryReport | null
}

/** Capture/refresh the current month's snapshot; returns the report just stored. */
export async function saveInventoryReportSnapshot(): Promise<InventoryReport> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('save_inventory_report_snapshot')
  if (error) throw new Error(error.message)
  return data as InventoryReport
}
