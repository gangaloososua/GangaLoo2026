// Round 37c - product loader for the Caja (register) grid.
//
// The POS search (lib/sales.ts > searchProductsForSale) returns nothing until
// the operator types. The register needs a browsable grid, so this lists
// active products for a warehouse with NO query required, using the SAME
// warehouse-price-override + warehouse-stock + primary-category enrichment as
// the proven search. lib/sales.ts is intentionally left untouched.
//
// 2026-06-24: after enrichment, the result is sorted so IN-STOCK products
// (qty_on_hand > 0) appear first, then out-of-stock, name-ordered within each
// group.
//
// 2026-06-28: the DEFAULT grid (no search text, no category chosen) is now
// driven by the SELECTED WAREHOUSE'S STOCK instead of the first 60 product
// names. Before, the DB fetched 60 active products ordered by name and only
// then sorted in-stock to the top - so a product in stock at the chosen
// warehouse whose name sorted past position 60 never appeared in the grid
// (e.g. the Cabellos/bundle products in stock at Montellano). Now we first
// fetch EVERY active product in stock at the warehouse (name order), then
// append a short tail of out-of-stock active products so they stay visible
// below. Search and category browsing are unchanged - they still scan the
// full catalog with the prior 50-row cap.
import { createClient } from '@/lib/supabase/server'
import type { ProductSearchResult } from '@/lib/sales'

const PRODUCT_SELECT =
  'id, sku, name, primary_image_url, price_cents, club_price_cents, sale_price_cents, commission_percent'

// Default-grid caps (no query / no category). In-stock items are shown in full
// up to IN_STOCK_CAP; a short tail of out-of-stock items is appended below.
const IN_STOCK_CAP = 300
const OOS_TAIL = 40
const OOS_SCAN = 120

type ProductRow = {
  id: string
  sku: string
  name: string
  primary_image_url: string | null
  price_cents: number | string | null
  club_price_cents: number | string | null
  sale_price_cents: number | string | null
  commission_percent: number | string | null
}

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

  // 1) Build the product set.
  let rows: ProductRow[] = []

  if (q || categoryId) {
    // SEARCH / CATEGORY: scan the whole catalog (prior behaviour, 50-row cap).
    let pq = supabase
      .from('products')
      .select(PRODUCT_SELECT)
      .eq('is_active', true)
    if (q) pq = pq.or(`sku.ilike.%${q}%,name.ilike.%${q}%`)
    if (categoryProductIds) pq = pq.in('id', categoryProductIds)
    const { data, error: pErr } = await pq
      .order('name', { ascending: true })
      .limit(limit)
    if (pErr) throw pErr
    rows = (data ?? []) as ProductRow[]
  } else {
    // DEFAULT GRID: warehouse stock drives the list (in-stock first, then a
    // short out-of-stock tail). See the 2026-06-28 note above.

    // a) ids in stock at THIS warehouse. v_inventory_current only holds rows
    //    whose summed qty_remaining > 0, so every id here is genuinely in stock.
    const { data: stockIdRows, error: stockIdErr } = await supabase
      .from('v_inventory_current')
      .select('product_id')
      .eq('warehouse_id', warehouseId)
    if (stockIdErr) throw stockIdErr
    const inStockIds = [
      ...new Set((stockIdRows ?? []).map((r) => r.product_id as string)),
    ].slice(0, IN_STOCK_CAP)

    // b) the in-stock products themselves (active), name-ordered.
    let inStockRows: ProductRow[] = []
    if (inStockIds.length > 0) {
      const { data, error } = await supabase
        .from('products')
        .select(PRODUCT_SELECT)
        .eq('is_active', true)
        .in('id', inStockIds)
        .order('name', { ascending: true })
      if (error) throw error
      inStockRows = (data ?? []) as ProductRow[]
    }

    // c) a short tail of out-of-stock active products so they remain visible
    //    below the in-stock ones. Fetch a small alphabetical page and drop any
    //    already shown as in-stock. (Search/category still reach everything.)
    const inStockSet = new Set(inStockIds)
    const { data: scanRows, error: scanErr } = await supabase
      .from('products')
      .select(PRODUCT_SELECT)
      .eq('is_active', true)
      .order('name', { ascending: true })
      .limit(OOS_SCAN)
    if (scanErr) throw scanErr
    const oosRows = ((scanRows ?? []) as ProductRow[])
      .filter((r) => !inStockSet.has(r.id))
      .slice(0, OOS_TAIL)

    rows = [...inStockRows, ...oosRows]
  }

  if (rows.length === 0) return []
  const productIds = rows.map((r) => r.id)

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
    id: r.id,
    sku: r.sku,
    name: r.name,
    primary_image_url: r.primary_image_url ?? null,
    base_price_cents: Number(r.price_cents) || 0,
    club_price_cents: r.club_price_cents == null ? null : Number(r.club_price_cents),
    sale_price_cents: r.sale_price_cents == null ? null : Number(r.sale_price_cents),
    warehouse_price_override_cents: overrideMap[r.id] ?? null,
    commission_percent: Number(r.commission_percent) || 0,
    qty_on_hand: stockMap[r.id] ?? 0,
    primary_category_id: categoryMap[r.id] ?? null,
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
