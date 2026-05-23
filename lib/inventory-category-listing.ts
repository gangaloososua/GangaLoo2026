// Reports - per-category inventory listing (data layer for the print page).
//
// Two read-only fetchers:
//   listInventoryCategories() - active categories for the print-page dropdown,
//     ordered by display_order then name.
//   fetchInventoryCategoryListing(categoryId) - calls the
//     inventory_category_listing(uuid) RPC: the active warehouses and each
//     active product's stock per warehouse (by_wh is a { warehouse_id -> qty }
//     map) plus a total. Products with no stock come back with total 0.
//
// Quantities are plain unit counts (numeric in the DB), not money.

import { createClient } from '@/lib/supabase/server'

export type InvCatPickerItem = { id: string; name: string }

export type InvListingWarehouse = { id: string; name: string }

export type InvListingRow = {
  product_id: string
  name: string | null
  sku: string | null
  by_wh: Record<string, number>
  total: number
}

export type InventoryCategoryListing = {
  category: { id: string; name: string } | null
  warehouses: InvListingWarehouse[]
  rows: InvListingRow[]
}

export async function listInventoryCategories(): Promise<InvCatPickerItem[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, display_order')
    .eq('is_active', true)
    .order('display_order', { nullsFirst: false })
    .order('name')
  if (error) throw new Error(`listInventoryCategories: ${error.message}`)
  return (data ?? []).map((c) => ({ id: c.id as string, name: c.name as string }))
}

export async function fetchInventoryCategoryListing(
  categoryId: string,
): Promise<InventoryCategoryListing> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('inventory_category_listing', {
    p_category_id: categoryId,
  })
  if (error) throw new Error(`fetchInventoryCategoryListing: ${error.message}`)
  return data as InventoryCategoryListing
}
