'use server'

import { requireRole } from '@/lib/auth/guard'
import {
  searchInventoryProducts,
  type InventoryProductOption,
} from '@/lib/inventory'

// Owner/admin only — the ledger (and thus this product search) is not shown
// to sellers/distributors.
export async function searchLedgerProducts(
  query: string,
): Promise<InventoryProductOption[]> {
  await requireRole(['owner', 'admin'] as const)
  return searchInventoryProducts(query, 15)
}

import { createClient } from '@/lib/supabase/server'

export type AdjustmentInput = {
  productId: string
  warehouseId: string
  direction: 'remove' | 'add'
  qty: number
  reason: string
  note: string | null
  unitCostDop: number | null
}

// Owner/admin only. Calls the adjust_stock RPC, which does the lot work
// atomically (FIFO consume for remove; new lot for add) and writes the
// matching stock_movements audit row. Returns success or a friendly error.
export async function recordStockAdjustment(
  input: AdjustmentInput,
): Promise<{ success: true } | { error: string }> {
  await requireRole(['owner', 'admin'] as const)

  if (!input.productId) return { error: 'Pick a product.' }
  if (!input.warehouseId) return { error: 'Pick a warehouse.' }
  if (input.direction !== 'remove' && input.direction !== 'add')
    return { error: 'Choose remove or add.' }
  if (!Number.isFinite(input.qty) || input.qty <= 0)
    return { error: 'Quantity must be greater than zero.' }
  if (!input.reason || !input.reason.trim())
    return { error: 'A reason is required.' }
  if (input.direction === 'add') {
    if (
      input.unitCostDop === null ||
      !Number.isFinite(input.unitCostDop) ||
      input.unitCostDop < 0
    )
      return { error: 'Enter the unit cost for added stock.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('adjust_stock', {
    p_payload: {
      product_id: input.productId,
      warehouse_id: input.warehouseId,
      direction: input.direction,
      qty: input.qty,
      reason: input.reason.trim(),
      note: input.note && input.note.trim() ? input.note.trim() : null,
      unit_cost_dop: input.direction === 'add' ? input.unitCostDop : null,
    },
  })
  if (error) {
    // Surface the RPC's own message (e.g. insufficient_stock) cleanly.
    return { error: error.message }
  }
  return { success: true }
}
