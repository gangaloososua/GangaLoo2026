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