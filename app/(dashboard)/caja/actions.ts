'use server'
// Round 37c — Caja register server action.
//
// Client-callable wrapper to (re)load the product grid when the warehouse or
// search term changes. Gated with requireAdminCaller (same as the POS search).
// The actual sale is rung up by confirmPosSale in ../sales/actions — untouched.
import { requireAdminCaller } from '@/lib/auth/guard'
import { listProductsForRegister } from '@/lib/pos-register'
import type { ProductSearchResult } from '@/lib/sales'

export type LoadRegisterProductsResult =
  | { ok: true; products: ProductSearchResult[] }
  | { ok: false; error: string }

export async function loadRegisterProducts(input: {
  warehouseId: string
  query?: string
  categoryId?: string | null
}): Promise<LoadRegisterProductsResult> {
  await requireAdminCaller()
  try {
    if (!input.warehouseId) return { ok: false, error: 'Warehouse is required.' }
    const products = await listProductsForRegister({
      warehouseId: input.warehouseId,
      query: input.query ?? '',
      categoryId: input.categoryId ?? null,
    })
    return { ok: true, products }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Load failed.'
    return { ok: false, error: msg }
  }
}
