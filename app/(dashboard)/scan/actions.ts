'use server'
// Round 37g — shared scanner lookup action. Reused by the test page, the
// register, and the placement editor: given a scanned SKU + warehouse, return
// the matching product (or null).
import { requireAdminCaller } from '@/lib/auth/guard'
import { findProductBySku } from '@/lib/product-lookup'
import type { ProductSearchResult } from '@/lib/sales'

export type FindBySkuResult =
  | { ok: true; product: ProductSearchResult | null }
  | { ok: false; error: string }

export async function findProductBySkuAction(
  warehouseId: string,
  sku: string,
): Promise<FindBySkuResult> {
  await requireAdminCaller()
  try {
    const clean = (sku ?? '').trim()
    if (!warehouseId || !clean) return { ok: true, product: null }
    const product = await findProductBySku(warehouseId, clean)
    return { ok: true, product }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Lookup failed.' }
  }
}
