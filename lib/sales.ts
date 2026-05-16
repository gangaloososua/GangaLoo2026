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
      customer:customer_id ( id, full_name ),
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
