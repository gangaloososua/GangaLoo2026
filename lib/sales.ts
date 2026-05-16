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

export type SaleDetail = {
  id: string
  invoice_number: string | null
  source: SaleSource
  status: SaleStatus
  customer_id: string | null
  customer_name: string | null
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
}

export async function getSale(id: string): Promise<SaleDetail | null> {
  const supabase = await createClient()

  const { data: sale, error: saleErr } = await supabase
    .from('sales')
    .select(
      `
      *,
      customer:customer_id ( id, full_name ),
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

  const s = sale as any
  return {
    id: s.id,
    invoice_number: s.invoice_number,
    source: s.source,
    status: s.status,
    customer_id: s.customer_id,
    customer_name: s.customer?.full_name ?? null,
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
