// Round 37c â€” product loader for the Caja (register) grid.
//
// The POS search (lib/sales.ts > searchProductsForSale) returns nothing until
// the operator types. The register needs a browsable grid, so this lists
// active products for a warehouse with NO query required, using the SAME
// warehouse-price-override + warehouse-stock + primary-category enrichment as
// the proven search. lib/sales.ts is intentionally left untouched.
//
// 2026-06-24: after enrichment, the result is sorted so IN-STOCK products
// (qty_on_hand > 0) appear first, then out-of-stock, name-ordered within each
// group. This only re-orders the loaded set (DB still fetches up to `limit`
// products ordered by name), so in-stock items float to the top of what shows.
import { createClient } from '@/lib/supabase/server'
import type { ProductSearchResult } from '@/lib/sales'

export async function listProductsForRegister(opts: {
  warehouseId: string
  query?: string
  categoryId?: string | null
  limit?: number
}): Promise<ProductSearchResult[]> {
  const warehouseId = opts.warehouseId
  const categoryId = opts.categoryId ?? null
  if (!warehouseId) return []

  const q = (opts.query ?? '')
    .replace(/[,'"()*%]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const limit = opts.limit ?? (q || categoryId ? 50 : 60)

  const supabase = await createClient()

  // If a category is chosen, resolve product ids in it OR its sub-categories.
  let categoryProductIds: string[] | null = null
  if (categoryId) {
    const { data: children, error: childErr } = await supabase
      .from('categories')
      .select('id')
      .eq('parent_id', categoryId)
    if (childErr) throw childErr
    const catIds = [categoryId, ...(children ?? []).map((c) => c.id as string)]

    const { data: pcRows, error: pcErr } = await supabase
      .from('product_categories')
      .select('product_id')
      .in('category_id', catIds)
    if (pcErr) throw pcErr

    categoryProductIds = [...new Set((pcRows ?? []).map((r) => r.product_id as string))]
    if (categoryProductIds.length === 0) return []
  }

  // 1) Active products (optionally filtered by text and/or category).
  let pq = supabase
    .from('products')
    .select('id, sku, name, primary_image_url, price_cents, club_price_cents, sale_price_cents, commission_percent')
    .eq('is_active', true)
  if (q) pq = pq.or(`sku.ilike.%${q}%,name.ilike.%${q}%`)
  if (categoryProductIds) pq = pq.in('id', categoryProductIds)
  const { data: products, error: pErr } = await pq
    .order('name', { ascending: true })
    .limit(limit)
  if (pErr) throw pErr

  const rows = products ?? []
  if (rows.length === 0) return []
  const productIds = rows.map((r) => r.id as string)

  // 2 + 3) Warehouse override prices, warehouse stock, primary category.
  const [settingsRes, stockRes, catRes] = await Promise.all([
    supabase
      .from('product_warehouse_settings')
      .select('product_id, price_override_cents')
      .eq('warehouse_id', warehouseId)
      .in('product_id', productIds),
    supabase
      .from('v_inventory_current')
      .select('product_id, qty_on_hand')
      .eq('warehouse_id', warehouseId)
      .in('product_id', productIds),
    supabase
      .from('product_categories')
      .select('product_id, category_id')
      .eq('is_primary', true)
      .in('product_id', productIds),
  ])
  if (settingsRes.error) throw settingsRes.error
  if (stockRes.error) throw stockRes.error
  if (catRes.error) throw catRes.error

  const overrideMap: Record<string, number | null> = {}
  for (const s of settingsRes.data ?? []) {
    overrideMap[s.product_id as string] =
      s.price_override_cents == null ? null : Number(s.price_override_cents)
  }
  const stockMap: Record<string, number> = {}
  for (const s of stockRes.data ?? []) {
    stockMap[s.product_id as string] = Number(s.qty_on_hand) || 0
  }
  const categoryMap: Record<string, string> = {}
  for (const c of catRes.data ?? []) {
    categoryMap[c.product_id as string] = c.category_id as string
  }

  const enriched: ProductSearchResult[] = rows.map((r) => ({
    id: r.id as string,
    sku: r.sku as string,
    name: r.name as string,
    primary_image_url: (r.primary_image_url as string | null) ?? null,
    base_price_cents: Number(r.price_cents) || 0,
    club_price_cents: r.club_price_cents == null ? null : Number(r.club_price_cents),
    sale_price_cents: r.sale_price_cents == null ? null : Number(r.sale_price_cents),
    warehouse_price_override_cents: overrideMap[r.id as string] ?? null,
    commission_percent: Number(r.commission_percent) || 0,
    qty_on_hand: stockMap[r.id as string] ?? 0,
    primary_category_id: categoryMap[r.id as string] ?? null,
  }))

  // In-stock first (qty_on_hand > 0), then out-of-stock. Name order within each
  // group keeps the grid stable and predictable.
  enriched.sort((a, b) => {
    const aOut = (a.qty_on_hand ?? 0) <= 0 ? 1 : 0
    const bOut = (b.qty_on_hand ?? 0) <= 0 ? 1 : 0
    if (aOut !== bOut) return aOut - bOut
    return a.name.localeCompare(b.name)
  })

  return enriched
}
