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

export type ProductCategory = {
  category_id: string
  category_name: string
  is_visible: boolean
  is_primary: boolean
  display_order: number
}

export async function fetchProductCategories(
  productId: string
): Promise<ProductCategory[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('product_categories')
    .select('category_id, is_visible, is_primary, display_order, categories(name)')
    .eq('product_id', productId)
    .order('display_order', { ascending: true })
  if (error) throw error
  return (data ?? []).map((r: any) => ({
    category_id: r.category_id,
    category_name: r.categories?.name ?? '?',
    is_visible: r.is_visible,
    is_primary: r.is_primary,
    display_order: r.display_order,
  }))
}

export type ProductImage = {
  id: string
  url: string
  alt_text: string | null
  display_order: number
  is_primary: boolean
}

export async function fetchProductImages(
  productId: string
): Promise<ProductImage[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('product_images')
    .select('id, url, alt_text, display_order, is_primary')
    .eq('product_id', productId)
    .order('display_order', { ascending: true })
  if (error) throw error
  return data ?? []
}

export type Warehouse = {
  id: string
  name: string
  kind: string
  is_active: boolean
  display_order: number
}

export type ProductWarehouseSetting = {
  warehouse_id: string
  is_visible: boolean
  price_override_cents: number | null
  display_order: number
}

export async function fetchAllWarehouses(): Promise<Warehouse[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('warehouses')
    .select('id, name, kind, is_active, display_order')
    .eq('is_active', true)
    .order('display_order', { ascending: true })
    .order('name', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function fetchProductWarehouseSettings(
  productId: string
): Promise<ProductWarehouseSetting[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('product_warehouse_settings')
    .select('warehouse_id, is_visible, price_override_cents, display_order')
    .eq('product_id', productId)
  if (error) throw error
  return data ?? []
}

export async function fetchProductStockByWarehouse(
  productId: string
): Promise<Record<string, number>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('v_inventory_current')
    .select('warehouse_id, qty_on_hand')
    .eq('product_id', productId)
  if (error) throw error
  const out: Record<string, number> = {}
  for (const r of data ?? []) {
    out[r.warehouse_id] = Number(r.qty_on_hand) || 0
  }
  return out
}

export type ExchangeRateRow = {
  year: number
  month: number
  rate: number
  source: string | null
}

export async function fetchCurrentExchangeRate(): Promise<ExchangeRateRow | null> {
  const supabase = await createClient()
  // Try current year/month first, fall back to most recent if no row for this month
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const { data: exact, error: exactErr } = await supabase
    .from('monthly_exchange_rates')
    .select('year, month, rate, source')
    .eq('year', year)
    .eq('month', month)
    .maybeSingle()
  if (exactErr) throw exactErr
  if (exact) {
    return { ...exact, rate: Number(exact.rate) }
  }
  const { data: latest, error: latestErr } = await supabase
    .from('monthly_exchange_rates')
    .select('year, month, rate, source')
    .order('year', { ascending: false })
    .order('month', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (latestErr) throw latestErr
  if (!latest) return null
  return { ...latest, rate: Number(latest.rate) }
}
