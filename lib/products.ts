import { createClient } from '@/lib/supabase/server'

export type WarehouseStock = {
  warehouse_id: string
  warehouse_name: string
  qty: number
}

export type ProductListItem = {
  id: string
  sku: string
  name: string
  slug: string
  price_cents: number
  commission_percent: number
  is_active: boolean
  visible_in_store: boolean
  primary_image_url: string | null
  primary_category: { id: string; name: string } | null
  stock_total: number
  stock_by_warehouse: WarehouseStock[]
}

export type ProductFilters = {
  search?: string
  categoryId?: string
  active?: 'all' | 'active' | 'inactive'
  visible?: 'all' | 'visible' | 'hidden'
  page?: number
  pageSize?: number
}

export type ProductsPage = {
  rows: ProductListItem[]
  total: number
  page: number
  pageSize: number
}

export async function fetchProductsWithStock(
  filters: ProductFilters,
): Promise<ProductsPage> {
  const supabase = await createClient()
  const page = filters.page ?? 1
  const pageSize = filters.pageSize ?? 25
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  // If filtering by category, narrow product IDs first
  let categoryProductIds: string[] | null = null
  if (filters.categoryId) {
    const { data: pcRows, error: pcErr } = await supabase
      .from('product_categories')
      .select('product_id')
      .eq('category_id', filters.categoryId)
    if (pcErr) throw pcErr
    categoryProductIds = (pcRows ?? []).map((r) => r.product_id)
    if (categoryProductIds.length === 0) {
      return { rows: [], total: 0, page, pageSize }
    }
  }

  // Main products query
  let query = supabase
    .from('products')
    .select(
      'id, sku, name, slug, price_cents, commission_percent, is_active, visible_in_store, primary_image_url',
      { count: 'exact' },
    )

  if (filters.search) {
    const s = filters.search.trim().replace(/[%,]/g, '')
    if (s) query = query.or(`name.ilike.%${s}%,sku.ilike.%${s}%`)
  }
  if (filters.active === 'active') query = query.eq('is_active', true)
  if (filters.active === 'inactive') query = query.eq('is_active', false)
  if (filters.visible === 'visible') query = query.eq('visible_in_store', true)
  if (filters.visible === 'hidden') query = query.eq('visible_in_store', false)
  if (categoryProductIds) query = query.in('id', categoryProductIds)

  query = query.order('name', { ascending: true }).range(from, to)

  const { data: products, count, error } = await query
  if (error) throw error
  if (!products || products.length === 0) {
    return { rows: [], total: count ?? 0, page, pageSize }
  }

  const productIds = products.map((p) => p.id)

  // Primary category per product
  const { data: primaryLinks } = await supabase
    .from('product_categories')
    .select('product_id, category_id')
    .in('product_id', productIds)
    .eq('is_primary', true)

  const catIds = [...new Set((primaryLinks ?? []).map((r) => r.category_id))]
  const categoryNameById = new Map<string, string>()
  if (catIds.length > 0) {
    const { data: cats } = await supabase
      .from('categories')
      .select('id, name')
      .in('id', catIds)
    for (const c of cats ?? []) categoryNameById.set(c.id, c.name)
  }
  const primaryCategoryByProduct = new Map<string, { id: string; name: string }>()
  for (const link of primaryLinks ?? []) {
    const name = categoryNameById.get(link.category_id)
    if (name) {
      primaryCategoryByProduct.set(link.product_id, {
        id: link.category_id,
        name,
      })
    }
  }

  // Stock per product per warehouse
  const { data: stockRows } = await supabase
    .from('v_inventory_current')
    .select('product_id, warehouse_id, qty_on_hand')
    .in('product_id', productIds)

  const warehouseIds = [
    ...new Set((stockRows ?? []).map((s) => s.warehouse_id)),
  ]
  const warehouseNameById = new Map<string, string>()
  if (warehouseIds.length > 0) {
    const { data: whs } = await supabase
      .from('warehouses')
      .select('id, name')
      .in('id', warehouseIds)
    for (const w of whs ?? []) warehouseNameById.set(w.id, w.name)
  }
  const stockByProduct = new Map<string, WarehouseStock[]>()
  for (const s of stockRows ?? []) {
    const arr = stockByProduct.get(s.product_id) ?? []
    arr.push({
      warehouse_id: s.warehouse_id,
      warehouse_name: warehouseNameById.get(s.warehouse_id) ?? '?',
      qty: Number(s.qty_on_hand) || 0,
    })
    stockByProduct.set(s.product_id, arr)
  }

  const rows: ProductListItem[] = products.map((p) => {
    const stock = stockByProduct.get(p.id) ?? []
    return {
      id: p.id,
      sku: p.sku,
      name: p.name,
      slug: p.slug,
      price_cents: p.price_cents,
      commission_percent: Number(p.commission_percent),
      is_active: p.is_active,
      visible_in_store: p.visible_in_store,
      primary_image_url: p.primary_image_url,
      primary_category: primaryCategoryByProduct.get(p.id) ?? null,
      stock_total: stock.reduce((sum, x) => sum + x.qty, 0),
      stock_by_warehouse: stock.sort((a, b) => b.qty - a.qty),
    }
  })

  return { rows, total: count ?? 0, page, pageSize }
}

export async function fetchAllCategoriesFlat() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, parent_id')
    .eq('is_active', true)
    .order('name')
  if (error) throw error
  return data ?? []
}
