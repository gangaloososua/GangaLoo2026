import { createClient } from '@/lib/supabase/server'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SaleStatus =
  | 'draft'
  | 'confirmed'
  | 'paid'
  | 'partially_paid'
  | 'refunded'
  | 'cancelled'

export type SaleSource = 'pos' | 'online'

export type SaleListItem = {
  id: string
  invoice_number: string | null
  status: SaleStatus
  source: SaleSource
  sold_at: string
  total_cents: number
  paid_cents: number
  customer_name: string | null
  seller_name: string | null
  warehouse_name: string
  item_count: number
}

export type SaleFilters = {
  search?: string        // matches invoice_number or customer name
  status?: SaleStatus
  sellerId?: string
  warehouseId?: string
  dateFrom?: string      // ISO date 'YYYY-MM-DD'
  dateTo?: string        // ISO date 'YYYY-MM-DD' (inclusive)
  page?: number          // 1-indexed
  pageSize?: number      // default 50
}

export type SaleListResult = {
  rows: SaleListItem[]
  total: number
  page: number
  pageSize: number
}

// ---------------------------------------------------------------------------
// listSales: paginated, filtered list of POS sales
// ---------------------------------------------------------------------------
// Round 9 is POS-only — source is hardcoded to 'pos'. Online Orders gets
// its own future module.
//
// The query joins to profiles (twice: customer + seller) and warehouses,
// and aggregates a count from sale_items. Using a Postgres view would be
// cleaner long-term, but two embedded relations + a manual count keeps it
// in one round-trip for now.

export async function listSales(filters: SaleFilters = {}): Promise<SaleListResult> {
  const supabase = await createClient()

  const page = Math.max(1, filters.page ?? 1)
  const pageSize = Math.max(1, Math.min(200, filters.pageSize ?? 50))
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let q = supabase
    .from('sales')
    .select(
      `
      id,
      invoice_number,
      status,
      source,
      sold_at,
      total_cents,
      paid_cents,
      customer:customer_id ( id, full_name, phone ),
      seller:seller_id ( id, full_name ),
      warehouse:fulfillment_warehouse_id ( id, name ),
      sale_items ( id )
    `,
      { count: 'exact' },
    )
    .eq('source', 'pos')
    .order('sold_at', { ascending: false })
    .range(from, to)

  if (filters.status) q = q.eq('status', filters.status)
  if (filters.sellerId) q = q.eq('seller_id', filters.sellerId)
  if (filters.warehouseId) q = q.eq('fulfillment_warehouse_id', filters.warehouseId)
  if (filters.dateFrom) q = q.gte('sold_at', `${filters.dateFrom}T00:00:00`)
  if (filters.dateTo)   q = q.lte('sold_at', `${filters.dateTo}T23:59:59.999`)

  // Search: invoice_number OR customer name. The customer-name part requires
  // a separate query path because PostgREST doesn't support OR across joins
  // cleanly. For now, search hits invoice_number only. Customer-name search
  // can come in a polish pass.
  if (filters.search) {
    const s = filters.search.trim()
    if (s) q = q.ilike('invoice_number', `%${s}%`)
  }

  const { data, count, error } = await q
  if (error) throw new Error(`listSales: ${error.message}`)

  const rows: SaleListItem[] = (data ?? []).map((row: any) => ({
    id: row.id,
    invoice_number: row.invoice_number,
    status: row.status,
    source: row.source,
    sold_at: row.sold_at,
    total_cents: row.total_cents,
    paid_cents: row.paid_cents,
    customer_name: row.customer?.full_name ?? null,
    seller_name: row.seller?.full_name ?? null,
    warehouse_name: row.warehouse?.name ?? '—',
    item_count: Array.isArray(row.sale_items) ? row.sale_items.length : 0,
  }))

  return { rows, total: count ?? 0, page, pageSize }
}

// ---------------------------------------------------------------------------
// Lookups for filter dropdowns
// ---------------------------------------------------------------------------

export async function listSellersForFilter(): Promise<Array<{ id: string; name: string }>> {
  const supabase = await createClient()

  // Anyone who has been the seller on at least one sale, OR has a staff-ish role.
  // Cheaper to fetch staff-ish roles than to scan sales.
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .in('role', ['owner', 'admin', 'seller', 'distributor'])
    .order('full_name')

  if (error) throw new Error(`listSellersForFilter: ${error.message}`)
  return (data ?? []).map((p) => ({ id: p.id, name: p.full_name }))
}

export async function listWarehousesForFilter(): Promise<Array<{ id: string; name: string }>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('warehouses')
    .select('id, name')
    .eq('is_active', true)
    .order('name')
  if (error) throw new Error(`listWarehousesForFilter: ${error.message}`)
  return (data ?? []).map((w) => ({ id: w.id, name: w.name }))
}

// ---------------------------------------------------------------------------
// Categories for the POS product-search filter
// ---------------------------------------------------------------------------
// Active categories with parent info so the picker can group main -> subs,
// reusing the same searchable-combobox shape as the product form. Read-only.

export type SaleCategoryPickerItem = {
  id: string
  name: string
  parent_id: string | null
}

export async function listCategoriesForSale(): Promise<SaleCategoryPickerItem[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, parent_id, display_order')
    .eq('is_active', true)
    .order('display_order', { nullsFirst: false })
    .order('name')
  if (error) throw new Error(`listCategoriesForSale: ${error.message}`)
  return (data ?? []).map((c) => ({
    id: c.id as string,
    name: c.name as string,
    parent_id: (c.parent_id as string | null) ?? null,
  }))
}

// ---------------------------------------------------------------------------
// getSale: full detail for one sale (header + items + FIFO + commissions + payments)
// ---------------------------------------------------------------------------

export type SaleDetailLotConsumption = {
  id: string
  lot_id: string
  lot_number: string | null
  qty_consumed: number
  unit_cost_dop: number
  received_at: string
}

export type SaleDetailItem = {
  id: string
  product_id: string
  product_name: string
  product_sku: string | null
  qty: number
  unit_price_cents: number
  discount_cents: number
  line_total_cents: number
  seller_commission_percent: number
  distributor_commission_percent: number
  cogs_cents: number | null
  lot_consumption: SaleDetailLotConsumption[]
}

export type SaleDetailCommission = {
  id: string
  sale_item_id: string
  earner_id: string
  earner_name: string
  earner_role: 'seller' | 'distributor'
  percent: number
  amount_cents: number
  status: 'pending' | 'paid' | 'void'
}

export type SaleDetailPayment = {
  id: string
  method: string
  amount_cents: number
  money_account_id: string
  money_account_name: string
  paid_at: string
  reference: string | null
}

export type SaleDetailHeldCash = {
  id: string
  amount_cents: number
  note: string | null
  collected_at: string
}

export type SaleDetail = {
  id: string
  invoice_number: string | null
  source: SaleSource
  status: SaleStatus
  customer_id: string | null
  customer_name: string | null
  customer_phone: string | null
  seller_id: string | null
  seller_name: string | null
  source_warehouse_id: string | null
  source_warehouse_name: string | null
  fulfillment_warehouse_id: string
  fulfillment_warehouse_name: string
  fulfillment_method: string
  is_mixed_warehouse: boolean
  subtotal_cents: number
  discount_cents: number
  tax_cents: number
  shipping_cents: number
  total_cents: number
  paid_cents: number
  cogs_cents: number | null
  gross_profit_cents: number | null
  sold_at: string
  confirmed_at: string | null
  paid_at: string | null
  shipping_address: string | null
  shipping_city: string | null
  delivery_notes: string | null
  tracking_number: string | null
  refunded_at: string | null
  refund_reason: string | null
  items: SaleDetailItem[]
  commissions: SaleDetailCommission[]
  payments: SaleDetailPayment[]
  // Cash a seller has logged as collected but the owner has not yet handed in.
  // Sits outside the books until reconciled on the Seller Cash screen. RLS
  // shows a seller only their own rows; owner/admin see all.
  held_cash: SaleDetailHeldCash[]
}

export async function getSale(id: string): Promise<SaleDetail | null> {
  const supabase = await createClient()

  const { data: sale, error: saleErr } = await supabase
    .from('sales')
    .select(
      `
      *,
      customer:customer_id ( id, full_name, phone ),
      seller:seller_id ( id, full_name ),
      source_wh:source_warehouse_id ( id, name ),
      fulfillment_wh:fulfillment_warehouse_id ( id, name ),
      items:sale_items (
        id, product_id, qty, unit_price_cents, discount_cents, line_total_cents,
        seller_commission_percent, distributor_commission_percent, cogs_cents,
        product:product_id ( id, name, sku ),
        consumption:sale_lot_consumption (
          id, lot_id, qty_consumed, unit_cost_dop,
          lot:lot_id ( id, lot_number, received_at )
        ),
        commissions:sale_commissions (
          id, sale_item_id, earner_id, earner_role, percent, amount_cents, status,
          earner:earner_id ( id, full_name )
        )
      ),
      payments:sale_payments (
        id, method, amount_cents, money_account_id, paid_at, reference,
        account:money_account_id ( id, name )
      )
    `,
    )
    .eq('id', id)
    .maybeSingle()

  if (saleErr) throw new Error(`getSale: ${saleErr.message}`)
  if (!sale) return null

  const items: SaleDetailItem[] = ((sale as any).items ?? []).map((it: any) => ({
    id: it.id,
    product_id: it.product_id,
    product_name: it.product?.name ?? '—',
    product_sku: it.product?.sku ?? null,
    qty: Number(it.qty),
    unit_price_cents: it.unit_price_cents,
    discount_cents: it.discount_cents,
    line_total_cents: it.line_total_cents,
    seller_commission_percent: Number(it.seller_commission_percent),
    distributor_commission_percent: Number(it.distributor_commission_percent),
    cogs_cents: it.cogs_cents,
    lot_consumption: (it.consumption ?? []).map((c: any) => ({
      id: c.id,
      lot_id: c.lot_id,
      lot_number: c.lot?.lot_number ?? null,
      qty_consumed: Number(c.qty_consumed),
      unit_cost_dop: Number(c.unit_cost_dop),
      received_at: c.lot?.received_at ?? '',
    })),
  }))

  // Sort items by product name for stable display.
  items.sort((a, b) => a.product_name.localeCompare(b.product_name))

  // commissions are embedded under each sale_item; flatten them.
  const commissions: SaleDetailCommission[] = ((sale as any).items ?? []).flatMap(
    (it: any) =>
      (it.commissions ?? []).map((c: any) => ({
        id: c.id,
        sale_item_id: c.sale_item_id,
        earner_id: c.earner_id,
        earner_name: c.earner?.full_name ?? '—',
        earner_role: c.earner_role,
        percent: Number(c.percent),
        amount_cents: c.amount_cents,
        status: c.status,
      })),
  )

  const payments: SaleDetailPayment[] = ((sale as any).payments ?? []).map((p: any) => ({
    id: p.id,
    method: p.method,
    amount_cents: p.amount_cents,
    money_account_id: p.money_account_id,
    money_account_name: p.account?.name ?? '—',
    paid_at: p.paid_at,
    reference: p.reference,
  }))
  payments.sort((a, b) => a.paid_at.localeCompare(b.paid_at))

  // Held seller-cash logged against this sale (not yet handed in / booked).
  const { data: heldRows, error: heldErr } = await supabase
    .from('seller_cash_collections')
    .select('id, amount_cents, note, collected_at')
    .eq('sale_id', id)
    .eq('status', 'held')
    .order('collected_at', { ascending: true })
  if (heldErr) throw new Error(`getSale held cash: ${heldErr.message}`)
  const held_cash: SaleDetailHeldCash[] = (heldRows ?? []).map((r: any) => ({
    id: r.id,
    amount_cents: Number(r.amount_cents) || 0,
    note: r.note ?? null,
    collected_at: r.collected_at,
  }))

  const s = sale as any
  return {
    id: s.id,
    invoice_number: s.invoice_number,
    source: s.source,
    status: s.status,
    customer_id: s.customer_id,
    customer_name: s.customer?.full_name ?? null,
    customer_phone: s.customer?.phone ?? null,
    seller_id: s.seller_id,
    seller_name: s.seller?.full_name ?? null,
    source_warehouse_id: s.source_warehouse_id,
    source_warehouse_name: s.source_wh?.name ?? null,
    fulfillment_warehouse_id: s.fulfillment_warehouse_id,
    fulfillment_warehouse_name: s.fulfillment_wh?.name ?? '—',
    fulfillment_method: s.fulfillment_method,
    is_mixed_warehouse: s.is_mixed_warehouse,
    subtotal_cents: s.subtotal_cents,
    discount_cents: s.discount_cents,
    tax_cents: s.tax_cents,
    shipping_cents: s.shipping_cents,
    total_cents: s.total_cents,
    paid_cents: s.paid_cents,
    cogs_cents: s.cogs_cents,
    gross_profit_cents: s.gross_profit_cents,
    sold_at: s.sold_at,
    confirmed_at: s.confirmed_at,
    paid_at: s.paid_at,
    shipping_address: s.shipping_address,
    shipping_city: s.shipping_city,
    delivery_notes: s.delivery_notes,
    tracking_number: s.tracking_number,
    refunded_at: s.refunded_at,
    refund_reason: s.refund_reason,
    items,
    commissions,
    payments,
    held_cash,
  }
}

// ---------------------------------------------------------------------------
// Money accounts for the payment picker
// ---------------------------------------------------------------------------

export type MoneyAccount = {
  id: string
  name: string
  kind: 'bank' | 'cash' | 'card' | 'digital' | 'credit_line'
}

export async function listMoneyAccounts(): Promise<MoneyAccount[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('money_accounts')
    .select('id, name, kind')
    .eq('is_active', true)
    .order('kind')
    .order('name')
  if (error) throw new Error(`listMoneyAccounts: ${error.message}`)
  return (data ?? []) as MoneyAccount[]
}

// ---------------------------------------------------------------------------
// Customer + seller pickers for /sales/new
// ---------------------------------------------------------------------------

export type CustomerPickerItem = {
  id: string
  full_name: string
  email: string | null
  club_tier: string | null
}

export async function listCustomersForPicker(): Promise<CustomerPickerItem[]> {
  const supabase = await createClient()
  // Anyone with a customer-ish role. Cheaper to fetch by role than by
  // who has been on a sale; we want to allow new customers too.
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, club_tier')
    .in('role', ['customer'])
    .order('full_name')
    .limit(2000)
  if (error) throw new Error(`listCustomersForPicker: ${error.message}`)
  return (data ?? []) as CustomerPickerItem[]
}

export type SellerOption = { id: string; full_name: string; role: string }

export async function listSellers(): Promise<SellerOption[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .in('role', ['owner', 'admin', 'seller', 'distributor'])
    .order('full_name')
  if (error) throw new Error(`listSellers: ${error.message}`)
  return (data ?? []) as SellerOption[]
}

export async function getCurrentSeller(): Promise<SellerOption | null> {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return null
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('auth_user_id', auth.user.id)
    .maybeSingle()
  if (error || !data) return null
  // Only return them as a seller default if their role qualifies.
  if (!['owner', 'admin', 'seller', 'distributor'].includes(data.role)) return null
  return data as SellerOption
}

// ============================================================
// 9.7 — product search for the POS create flow
// ============================================================

export type ProductSearchResult = {
  id: string
  sku: string
  name: string
  primary_image_url: string | null
  base_price_cents: number
  club_price_cents: number | null
  sale_price_cents: number | null
  warehouse_price_override_cents: number | null
  commission_percent: number
  qty_on_hand: number
  primary_category_id: string | null
}

/**
 * Search active products for the POS cart, scoped to a source warehouse
 * so we can attach the warehouse-specific override price and the
 * warehouse-specific stock (already lot-rolled-up via v_inventory_current).
 *
 * Does NOT resolve the default unit price — that depends on the customer's
 * club tier, which the cart owns. Returns all three price candidates and
 * lets the cart pick at add-time.
 */
export async function searchProductsForSale(opts: {
  query: string
  warehouseId: string
  categoryId?: string | null
  limit?: number
}): Promise<ProductSearchResult[]> {
  const { query, warehouseId } = opts
  const categoryId = opts.categoryId ?? null
  const limit = opts.limit ?? (categoryId ? 100 : 20)

  // Sanitize for PostgREST .or() — strip chars that would break the
  // filter expression, then collapse whitespace.
  const q = query
    .replace(/[,'"()*%]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  // Need either a text query or a chosen category to search on.
  if (!q && !categoryId) return []

  const supabase = await createClient()

  // When a category is chosen, resolve the set of product ids in that
  // category OR any of its sub-categories (picking a MAIN category shows
  // everything beneath it). Uses ALL category assignments, not just the
  // primary one, matching the per-category counts in the categories admin.
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

    categoryProductIds = [
      ...new Set((pcRows ?? []).map((r) => r.product_id as string)),
    ]
    // Empty category -> nothing to show.
    if (categoryProductIds.length === 0) return []
  }

  // 1) Matching active products.
  let pq = supabase
    .from('products')
    .select(
      'id, sku, name, primary_image_url, price_cents, club_price_cents, sale_price_cents, commission_percent'
    )
    .eq('is_active', true)
  if (q) {
    // Match EACH typed word independently (AND), in name OR sku, so word order
    // and in-between characters like % or " do not matter. Typing
    // "13x4 180% 24" now finds "13x4 180% 24\" Negro Lacio Indoo".
    for (const term of q.split(' ')) {
      if (term) pq = pq.or(`sku.ilike.%${term}%,name.ilike.%${term}%`)
    }
  }
  if (categoryProductIds) pq = pq.in('id', categoryProductIds)
  const { data: products, error: pErr } = await pq
    .order('name', { ascending: true })
    .limit(limit)
  if (pErr) throw pErr

  const rows = products ?? []
  if (rows.length === 0) return []
  const productIds = rows.map((r) => r.id as string)

  // 2 + 3) Warehouse override prices and warehouse stock, in parallel.
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
  return rows.map((r) => ({
    id: r.id as string,
    sku: r.sku as string,
    name: r.name as string,
    primary_image_url: (r.primary_image_url as string | null) ?? null,
    base_price_cents: Number(r.price_cents) || 0,
    club_price_cents:
      r.club_price_cents == null ? null : Number(r.club_price_cents),
    sale_price_cents:
      r.sale_price_cents == null ? null : Number(r.sale_price_cents),
    warehouse_price_override_cents: overrideMap[r.id as string] ?? null,
    commission_percent: Number(r.commission_percent) || 0,
    qty_on_hand: stockMap[r.id as string] ?? 0,
    primary_category_id: categoryMap[r.id as string] ?? null,
  }))
}
