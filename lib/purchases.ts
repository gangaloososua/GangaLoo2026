// ============================================================
// Round 14a - Purchases read surface
//
// Data layer. READ ONLY. No UPDATE / INSERT against
// purchase_orders, purchase_order_items, inventory_lots,
// courier_payments, or courier_payment_allocations from this
// module - those are 14b / 14c.
//
// Spec: docs/round-14-purchases.md
// ============================================================

// ---- status ------------------------------------------------

export type PurchaseStatus =
  | 'pending'
  | 'paid_supplier'
  | 'received'
  | 'complete'

export const PURCHASE_STATUSES: readonly PurchaseStatus[] = [
  'pending',
  'paid_supplier',
  'received',
  'complete',
] as const

// ---- row shapes --------------------------------------------

/**
 * A row from purchase_orders with supplier and warehouse names
 * denormalised on the way out for the list page (follow-up
 * queries, not a join - matches the warehouses pattern from
 * Round 11 per the spec).
 *
 * Numeric columns are coerced to JS number on the way out
 * (lib/money-accounts.ts pattern). Nullable financial columns
 * stay nullable until the corresponding stage transition fires.
 */
export type PurchaseOrderRow = {
  // PK + FKs
  id: string
  supplier_id: string | null
  warehouse_id: string | null
  supplier_payment_account_id: string | null

  // Stored status
  status: PurchaseStatus

  // USD side
  usd_subtotal: number
  usd_shipping: number
  usd_tax: number
  usd_total: number               // generated: subtotal + shipping + tax

  // DOP side (nullable until paid)
  dop_paid_total: number | null
  exchange_rate: number | null
  dop_bank_fee: number | null
  official_rate_at_payment: number | null

  // Stage timestamps
  ordered_at: string
  expected_at: string | null
  paid_at_dop: string | null
  received_at: string | null
  completed_at: string | null

  // Free text + legacy
  notes: string | null
  legacy_id: string | null
  legacy_lot_numbers: string[] | null

  // Audit
  created_at: string
  updated_at: string

  // Denormalised (NOT in the table)
  supplier_name: string | null
  warehouse_name: string | null
}

/**
 * A row from purchase_order_items, with product name and sku
 * denormalised on the way out for the detail page.
 */
export type PurchaseOrderItemRow = {
  id: string
  purchase_order_id: string
  product_id: string

  qty: number
  usd_unit_cost: number
  usd_line_total: number          // generated: qty * usd_unit_cost

  // DOP allocations (nullable until paid / transport allocated)
  dop_unit_cost_base: number | null
  dop_bank_share: number | null
  dop_transport_share: number | null
  dop_unit_landed_cost: number | null

  legacy_id: string | null
  created_at: string

  // Denormalised
  product_name: string | null
  product_sku: string | null
}

/**
 * The lot trail for one purchase_order_items row. Grouped so the
 * detail page can render lots and their consumption under each
 * line. `consumption` may be empty - a lot can be received without
 * yet being touched by a sale.
 */
export type LotTrailEntry = {
  lot: {
    id: string
    lot_number: string | null
    qty_received: number
    qty_remaining: number
    unit_cost_dop: number | null
    received_at: string | null
  }
  consumption: Array<{
    sale_id: string
    sale_invoice_number: string | null
    sale_occurred_at: string | null
    qty_consumed: number
    seller_id: string | null
    seller_name: string | null
  }>
}

// ---- pure helpers: status-mismatch audit -------------------

/**
 * The structural slice both audit helpers need. Typed wider than
 * PurchaseOrderRow on purpose so callers can pass projections.
 */
type StatusBearer = {
  status: PurchaseStatus
  paid_at_dop: string | null
  received_at: string | null
  completed_at: string | null
}

/**
 * Status implied by the four stage timestamps. Reading
 * latest-stage-first ensures we land on the most-advanced
 * status the timestamps justify.
 *
 *   completed_at  -> 'complete'
 *   received_at   -> 'received'
 *   paid_at_dop   -> 'paid_supplier'
 *   (none)        -> 'pending'
 */
export function derivedStatus(po: StatusBearer): PurchaseStatus {
  if (po.completed_at) return 'complete'
  if (po.received_at) return 'received'
  if (po.paid_at_dop) return 'paid_supplier'
  return 'pending'
}

/**
 * True when the stored status disagrees with what the timestamps
 * imply. The UI flags these but does NOT correct them - SQL is
 * the cleanup path (spec, "Status-mismatch audit").
 */
export function statusMismatch(po: StatusBearer): boolean {
  return po.status !== derivedStatus(po)
}

// ============================================================
// Fetchers - read-only against the purchase-side tables
// ============================================================

import { createClient } from '@/lib/supabase/server'

// All columns from purchase_orders that PurchaseOrderRow exposes.
// Kept as a single string so it can be reused by getPurchaseOrder.
const PURCHASE_ORDER_COLUMNS =
  'id, supplier_id, warehouse_id, supplier_payment_account_id, ' +
  'status, ' +
  'usd_subtotal, usd_shipping, usd_tax, usd_total, ' +
  'dop_paid_total, exchange_rate, dop_bank_fee, ' +
  'official_rate_at_payment, ' +
  'ordered_at, expected_at, paid_at_dop, received_at, completed_at, ' +
  'notes, legacy_id, legacy_lot_numbers, ' +
  'created_at, updated_at'

type RawPurchaseOrder = {
  id: string
  supplier_id: string | null
  warehouse_id: string | null
  supplier_payment_account_id: string | null
  status: PurchaseStatus
  usd_subtotal: number | string
  usd_shipping: number | string
  usd_tax: number | string
  usd_total: number | string
  dop_paid_total: number | string | null
  exchange_rate: number | string | null
  dop_bank_fee: number | string | null
  official_rate_at_payment: number | string | null
  ordered_at: string
  expected_at: string | null
  paid_at_dop: string | null
  received_at: string | null
  completed_at: string | null
  notes: string | null
  legacy_id: string | null
  legacy_lot_numbers: string[] | null
  created_at: string
  updated_at: string
}

function coercePurchaseOrder(
  r: RawPurchaseOrder,
  supplier_name: string | null,
  warehouse_name: string | null,
): PurchaseOrderRow {
  return {
    ...r,
    usd_subtotal: Number(r.usd_subtotal),
    usd_shipping: Number(r.usd_shipping),
    usd_tax: Number(r.usd_tax),
    usd_total: Number(r.usd_total),
    dop_paid_total:
      r.dop_paid_total == null ? null : Number(r.dop_paid_total),
    exchange_rate:
      r.exchange_rate == null ? null : Number(r.exchange_rate),
    dop_bank_fee:
      r.dop_bank_fee == null ? null : Number(r.dop_bank_fee),
    official_rate_at_payment:
      r.official_rate_at_payment == null
        ? null
        : Number(r.official_rate_at_payment),
    supplier_name,
    warehouse_name,
  }
}

export type ListPurchaseOrdersOptions = {
  search?: string
  status?: PurchaseStatus
  supplierId?: string
  warehouseId?: string
  dateFrom?: string    // ordered_at >=
  dateTo?: string      // ordered_at <=
  mismatchOnly?: boolean
  page?: number        // default 1
  pageSize?: number    // default 50
}

export type ListPurchaseOrdersResult = {
  rows: PurchaseOrderRow[]
  total: number
  page: number
  pageSize: number
}

/**
 * Paginated list of purchase orders with denormalised supplier
 * and warehouse names. Sorted by ordered_at desc, then created_at
 * desc as a tiebreaker (the migration imported many orders on the
 * same ordered_at).
 *
 * mismatchOnly is applied in memory after the fetch. When it is
 * set, the function fetches ALL matching rows from the DB and
 * paginates after filtering, because a SQL-side count would not
 * reflect the in-memory filter. Acceptable: 196 orders total.
 */
export async function listPurchaseOrders(
  opts: ListPurchaseOrdersOptions = {},
): Promise<ListPurchaseOrdersResult> {
  const page = Math.max(1, opts.page ?? 1)
  const pageSize = Math.max(1, opts.pageSize ?? 50)
  const supabase = await createClient()

  // If `search` is provided, resolve matching supplier_ids first so
  // we can OR them into the where clause alongside legacy_id / notes.
  let supplierIdsFromSearch: string[] | null = null
  if (opts.search && opts.search.trim()) {
    const q = opts.search.trim()
    const { data: matched, error: matchErr } = await supabase
      .from('suppliers')
      .select('id')
      .ilike('name', `%${q}%`)
    if (matchErr) throw matchErr
    supplierIdsFromSearch = (matched ?? []).map((r) => r.id as string)
  }

  // Build the main query.
  let q = supabase
    .from('purchase_orders')
    .select(PURCHASE_ORDER_COLUMNS, { count: 'exact' })
    .order('ordered_at', { ascending: false })
    .order('created_at', { ascending: false })

  if (opts.status) q = q.eq('status', opts.status)
  if (opts.supplierId) q = q.eq('supplier_id', opts.supplierId)
  if (opts.warehouseId) q = q.eq('warehouse_id', opts.warehouseId)
  if (opts.dateFrom) q = q.gte('ordered_at', opts.dateFrom)
  if (opts.dateTo) q = q.lte('ordered_at', opts.dateTo)

  if (opts.search && opts.search.trim()) {
    const term = opts.search.trim().replace(/[%,]/g, ' ')
    const orParts = [
      `legacy_id.ilike.%${term}%`,
      `notes.ilike.%${term}%`,
    ]
    if (supplierIdsFromSearch && supplierIdsFromSearch.length > 0) {
      orParts.push(`supplier_id.in.(${supplierIdsFromSearch.join(',')})`)
    }
    q = q.or(orParts.join(','))
  }

  // mismatchOnly mode: fetch everything, filter, then paginate in JS.
  if (opts.mismatchOnly) {
    const { data, error } = await q
    if (error) throw error
    const raw = (data ?? []) as RawPurchaseOrder[]
    const filtered = raw.filter((r) => statusMismatch(r))
    const total = filtered.length
    const sliceStart = (page - 1) * pageSize
    const slice = filtered.slice(sliceStart, sliceStart + pageSize)
    const rows = await attachNames(supabase, slice)
    return { rows, total, page, pageSize }
  }

  // Normal mode: DB-side pagination.
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  const { data, error, count } = await q.range(from, to)
  if (error) throw error
  const raw = (data ?? []) as RawPurchaseOrder[]
  const rows = await attachNames(supabase, raw)
  return { rows, total: count ?? rows.length, page, pageSize }
}

/**
 * Follow-up query: look up supplier and warehouse names in bulk
 * for the page of raw orders, then assemble PurchaseOrderRow.
 * Two parallel fetches (independent tables), then a single pass
 * to attach.
 */
async function attachNames(
  supabase: Awaited<ReturnType<typeof createClient>>,
  raws: RawPurchaseOrder[],
): Promise<PurchaseOrderRow[]> {
  const supplierIds = Array.from(
    new Set(raws.map((r) => r.supplier_id).filter((x): x is string => !!x)),
  )
  const warehouseIds = Array.from(
    new Set(raws.map((r) => r.warehouse_id).filter((x): x is string => !!x)),
  )

  const [suppliersRes, warehousesRes] = await Promise.all([
    supplierIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabase
          .from('suppliers')
          .select('id, name')
          .in('id', supplierIds),
    warehouseIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabase
          .from('warehouses')
          .select('id, name')
          .in('id', warehouseIds),
  ])
  if (suppliersRes.error) throw suppliersRes.error
  if (warehousesRes.error) throw warehousesRes.error

  const supplierNameById = new Map<string, string>()
  for (const s of (suppliersRes.data ?? []) as Array<{ id: string; name: string }>) {
    supplierNameById.set(s.id, s.name)
  }
  const warehouseNameById = new Map<string, string>()
  for (const w of (warehousesRes.data ?? []) as Array<{ id: string; name: string }>) {
    warehouseNameById.set(w.id, w.name)
  }

  return raws.map((r) =>
    coercePurchaseOrder(
      r,
      r.supplier_id ? supplierNameById.get(r.supplier_id) ?? null : null,
      r.warehouse_id ? warehouseNameById.get(r.warehouse_id) ?? null : null,
    ),
  )
}

// ---- single-order fetcher ---------------------------------

/**
 * Fetch one purchase order with denormalised supplier + warehouse
 * names. Returns null if not found - the detail page renders 404.
 *
 * Reuses attachNames to keep the single-row path identical to the
 * list path.
 */
export async function getPurchaseOrder(
  id: string,
): Promise<PurchaseOrderRow | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('purchase_orders')
    .select(PURCHASE_ORDER_COLUMNS)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const rows = await attachNames(supabase, [data as unknown as RawPurchaseOrder])
  return rows[0]
}

// ---- line items -------------------------------------------

const PURCHASE_ORDER_ITEM_COLUMNS =
  'id, purchase_order_id, product_id, ' +
  'qty, usd_unit_cost, usd_line_total, ' +
  'dop_unit_cost_base, dop_bank_share, dop_transport_share, ' +
  'dop_unit_landed_cost, ' +
  'legacy_id, created_at'

type RawPurchaseOrderItem = {
  id: string
  purchase_order_id: string
  product_id: string
  qty: number | string
  usd_unit_cost: number | string
  usd_line_total: number | string
  dop_unit_cost_base: number | string | null
  dop_bank_share: number | string | null
  dop_transport_share: number | string | null
  dop_unit_landed_cost: number | string | null
  legacy_id: string | null
  created_at: string
}

function coercePurchaseOrderItem(
  r: RawPurchaseOrderItem,
  product_name: string | null,
  product_sku: string | null,
): PurchaseOrderItemRow {
  return {
    ...r,
    qty: Number(r.qty),
    usd_unit_cost: Number(r.usd_unit_cost),
    usd_line_total: Number(r.usd_line_total),
    dop_unit_cost_base:
      r.dop_unit_cost_base == null ? null : Number(r.dop_unit_cost_base),
    dop_bank_share:
      r.dop_bank_share == null ? null : Number(r.dop_bank_share),
    dop_transport_share:
      r.dop_transport_share == null ? null : Number(r.dop_transport_share),
    dop_unit_landed_cost:
      r.dop_unit_landed_cost == null ? null : Number(r.dop_unit_landed_cost),
    product_name,
    product_sku,
  }
}

/**
 * Fetch all line items for one purchase order, sorted by created_at
 * ascending (the closest thing we have to "in order on the original
 * invoice" - there's no line_no column).
 *
 * Product name and sku are denormalised via a follow-up lookup
 * (Round 11 warehouses pattern, same as attachNames above).
 */
export async function getPurchaseOrderItems(
  orderId: string,
): Promise<PurchaseOrderItemRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('purchase_order_items')
    .select(PURCHASE_ORDER_ITEM_COLUMNS)
    .eq('purchase_order_id', orderId)
    .order('created_at', { ascending: true })
  if (error) throw error
  const raws = (data ?? []) as unknown as RawPurchaseOrderItem[]

  const productIds = Array.from(
    new Set(raws.map((r) => r.product_id).filter((x): x is string => !!x)),
  )

  const productInfoById = new Map
    string,
    { name: string | null; sku: string | null }
  >()
  if (productIds.length > 0) {
    const { data: products, error: prodErr } = await supabase
      .from('products')
      .select('id, name, sku')
      .in('id', productIds)
    if (prodErr) throw prodErr
    for (const p of (products ?? []) as Array<{
      id: string
      name: string | null
      sku: string | null
    }>) {
      productInfoById.set(p.id, { name: p.name, sku: p.sku })
    }
  }

  return raws.map((r) => {
    const info = productInfoById.get(r.product_id)
    return coercePurchaseOrderItem(
      r,
      info?.name ?? null,
      info?.sku ?? null,
    )
  })
}

// ---- lot trail --------------------------------------------

type RawInventoryLot = {
  id: string
  purchase_order_item_id: string
  lot_number: string | null
  qty_received: number | string
  qty_remaining: number | string
  unit_cost_dop: number | string | null
  received_at: string | null
}

type RawConsumption = {
  id: string
  sale_item_id: string
  lot_id: string
  qty_consumed: number | string
}

type SaleInfo = {
  id: string
  invoice_number: string | null
  sold_at: string
  seller_id: string | null
}

/** Compare ISO-timestamp strings, nulls last. */
function compareTs(a: string | null, b: string | null): number {
  if (a === b) return 0
  if (a == null) return 1
  if (b == null) return -1
  return a < b ? -1 : 1
}

/**
 * For a purchase order, return its lot trail grouped by line item.
 *
 *   inventory_lots
 *     -> sale_lot_consumption (lot_id)
 *     -> sale_items           (sale_item_id -> sale_id)
 *     -> sales                (id, invoice_number, sold_at, seller_id)
 *     -> profiles             (seller_id -> full_name)
 *
 * Six follow-up queries instead of one join chain. Matches the
 * "denormalise via in(...) lookup" pattern used by listPurchaseOrders
 * and getPurchaseOrderItems above.
 *
 * The returned Map is keyed by purchase_order_item_id. Every line
 * item on the order is a key, even if it has no lots yet (empty
 * array value) - lets the detail page iterate items and look up
 * trail without missing-key handling.
 *
 * Lots without a purchase_order_item_id (pre-migration data) are
 * NOT surfaced here - they belong to a future inventory view, not
 * to any specific purchase order.
 */
export async function getLotTrailForOrder(
  orderId: string,
): Promise<Map<string, LotTrailEntry[]>> {
  const supabase = await createClient()

  // 1. line items on this order
  const { data: itemsData, error: itemsErr } = await supabase
    .from('purchase_order_items')
    .select('id')
    .eq('purchase_order_id', orderId)
  if (itemsErr) throw itemsErr
  const itemIds = ((itemsData ?? []) as Array<{ id: string }>).map(
    (i) => i.id,
  )

  // Seed map with every item id so callers can rely on the key set.
  const trail = new Map<string, LotTrailEntry[]>()
  for (const id of itemIds) trail.set(id, [])
  if (itemIds.length === 0) return trail

  // 2. lots for those items
  const { data: lotsData, error: lotsErr } = await supabase
    .from('inventory_lots')
    .select(
      'id, purchase_order_item_id, lot_number, qty_received, ' +
        'qty_remaining, unit_cost_dop, received_at',
    )
    .in('purchase_order_item_id', itemIds)
  if (lotsErr) throw lotsErr
  const lots = (lotsData ?? []) as RawInventoryLot[]
  if (lots.length === 0) return trail

  // 3. consumption rows for those lots
  const lotIds = lots.map((l) => l.id)
  const { data: consData, error: consErr } = await supabase
    .from('sale_lot_consumption')
    .select('id, sale_item_id, lot_id, qty_consumed')
    .in('lot_id', lotIds)
  if (consErr) throw consErr
  const consumption = (consData ?? []) as RawConsumption[]

  // 4. sale_items -> sale_id bridge (only if there's consumption)
  const saleIdByItemId = new Map<string, string>()
  if (consumption.length > 0) {
    const saleItemIds = Array.from(
      new Set(consumption.map((c) => c.sale_item_id)),
    )
    const { data: siData, error: siErr } = await supabase
      .from('sale_items')
      .select('id, sale_id')
      .in('id', saleItemIds)
    if (siErr) throw siErr
    for (const si of (siData ?? []) as Array<{
      id: string
      sale_id: string
    }>) {
      saleIdByItemId.set(si.id, si.sale_id)
    }
  }

  // 5. sales for those sale_ids
  const saleById = new Map<string, SaleInfo>()
  const saleIds = Array.from(new Set(saleIdByItemId.values()))
  if (saleIds.length > 0) {
    const { data: salesData, error: salesErr } = await supabase
      .from('sales')
      .select('id, invoice_number, sold_at, seller_id')
      .in('id', saleIds)
    if (salesErr) throw salesErr
    for (const s of (salesData ?? []) as SaleInfo[]) {
      saleById.set(s.id, s)
    }
  }

  // 6. seller names
  const sellerIds = Array.from(
    new Set(
      Array.from(saleById.values())
        .map((s) => s.seller_id)
        .filter((x): x is string => !!x),
    ),
  )
  const sellerNameById = new Map<string, string>()
  if (sellerIds.length > 0) {
    const { data: profData, error: profErr } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', sellerIds)
    if (profErr) throw profErr
    for (const p of (profData ?? []) as Array<{
      id: string
      full_name: string
    }>) {
      sellerNameById.set(p.id, p.full_name)
    }
  }

  // 7. Group consumption by lot_id
  const consumptionByLotId = new Map
    string,
    LotTrailEntry['consumption']
  >()
  for (const c of consumption) {
    const saleId = saleIdByItemId.get(c.sale_item_id)
    if (!saleId) continue
    const sale = saleById.get(saleId)
    if (!sale) continue
    const arr = consumptionByLotId.get(c.lot_id) ?? []
    arr.push({
      sale_id: saleId,
      sale_invoice_number: sale.invoice_number,
      sale_occurred_at: sale.sold_at,
      qty_consumed: Number(c.qty_consumed),
      seller_id: sale.seller_id,
      seller_name:
        sale.seller_id ? sellerNameById.get(sale.seller_id) ?? null : null,
    })
    consumptionByLotId.set(c.lot_id, arr)
  }

  // 8. Assemble entries, group by purchase_order_item_id
  for (const lot of lots) {
    const entry: LotTrailEntry = {
      lot: {
        id: lot.id,
        lot_number: lot.lot_number,
        qty_received: Number(lot.qty_received),
        qty_remaining: Number(lot.qty_remaining),
        unit_cost_dop:
          lot.unit_cost_dop == null ? null : Number(lot.unit_cost_dop),
        received_at: lot.received_at,
      },
      consumption: (consumptionByLotId.get(lot.id) ?? []).sort((a, b) =>
        compareTs(a.sale_occurred_at, b.sale_occurred_at),
      ),
    }
    const bucket = trail.get(lot.purchase_order_item_id) ?? []
    bucket.push(entry)
    trail.set(lot.purchase_order_item_id, bucket)
  }

  // 9. Sort lots within each item by received_at asc (FIFO)
  for (const entries of trail.values()) {
    entries.sort((a, b) => compareTs(a.lot.received_at, b.lot.received_at))
  }

  return trail
}

// ---- filter options for the list page ---------------------

export type PurchaseFilterOptions = {
  suppliers: Array<{ id: string; name: string }>
  warehouses: Array<{ id: string; name: string }>
}

/**
 * Look up the supplier and warehouse filter options the list page
 * needs to populate its dropdowns.
 *
 *   suppliers - only ones that appear on at least one purchase
 *               order. The dropdown should not surface suppliers
 *               the business has never bought from. PostgREST has
 *               no DISTINCT; dedup the supplier_id column in JS.
 *
 *   warehouses - all of them. There are only ~2 in the system and
 *                the dropdown should include both even if no order
 *                currently uses one.
 *
 * Three round trips total: distinct supplier_ids from
 * purchase_orders (sequential), then supplier names + warehouses
 * (parallel).
 */
export async function getPurchaseFilterOptions(): Promise<PurchaseFilterOptions> {
  const supabase = await createClient()

  // 1. Distinct supplier_ids appearing on any purchase_order
  const { data: poRows, error: poErr } = await supabase
    .from('purchase_orders')
    .select('supplier_id')
    .not('supplier_id', 'is', null)
  if (poErr) throw poErr
  const supplierIds = Array.from(
    new Set(
      ((poRows ?? []) as Array<{ supplier_id: string | null }>)
        .map((r) => r.supplier_id)
        .filter((x): x is string => !!x),
    ),
  )

  // 2. Supplier names + warehouses in parallel
  const [suppliersRes, warehousesRes] = await Promise.all([
    supplierIds.length === 0
      ? Promise.resolve({ data: [] as Array<{ id: string; name: string }>, error: null })
      : supabase
          .from('suppliers')
          .select('id, name')
          .in('id', supplierIds)
          .order('name', { ascending: true }),
    supabase
      .from('warehouses')
      .select('id, name')
      .order('name', { ascending: true }),
  ])
  if (suppliersRes.error) throw suppliersRes.error
  if (warehousesRes.error) throw warehousesRes.error

  return {
    suppliers: (suppliersRes.data ?? []) as Array<{ id: string; name: string }>,
    warehouses: (warehousesRes.data ?? []) as Array<{ id: string; name: string }>,
  }
}

// ---- transport summary (per order) ------------------------

export type TransportAllocation = {
  allocation_id: string
  payment_id: string
  amount_dop: number
  paid_at: string
  courier_name: string | null
  money_account_name: string | null
  description: string | null
  reference: string | null
}

export type TransportSummary = {
  allocated_dop: number
  allocation_count: number
  allocations: TransportAllocation[]
}

/**
 * Read-side view of an order's transport activity. Returns the
 * sum of all courier_payment_allocations rows against this order,
 * along with the per-allocation detail (courier name, paid_at,
 * source money account, description).
 *
 * A courier_payments row IS the payment event - it always has a
 * paid_at (NOT NULL DEFAULT now()) and a money_account_id (NOT
 * NULL). There is no "paid?" flag to compute. The presence of an
 * allocation against an order means that order has had that
 * portion of courier cost paid.
 *
 * "complete" status does NOT require any transport activity at
 * all - many migrated complete orders have zero allocations
 * (direct delivery, no courier). See the spec amendment.
 *
 * Sorted by paid_at ascending so the UI reads as a timeline.
 */
export async function getTransportSummaryForOrder(
  orderId: string,
): Promise<TransportSummary> {
  const supabase = await createClient()

  // 1. Allocations against this order
  const { data: allocData, error: allocErr } = await supabase
    .from('courier_payment_allocations')
    .select('id, courier_payment_id, amount_dop')
    .eq('purchase_order_id', orderId)
  if (allocErr) throw allocErr
  const allocs = (allocData ?? []) as Array<{
    id: string
    courier_payment_id: string
    amount_dop: number | string
  }>

  if (allocs.length === 0) {
    return { allocated_dop: 0, allocation_count: 0, allocations: [] }
  }

  // 2. Pull the corresponding courier_payments rows
  const paymentIds = Array.from(
    new Set(allocs.map((a) => a.courier_payment_id)),
  )
  const { data: payData, error: payErr } = await supabase
    .from('courier_payments')
    .select(
      'id, courier_id, paid_at, money_account_id, description, reference',
    )
    .in('id', paymentIds)
  if (payErr) throw payErr
  const payments = (payData ?? []) as Array<{
    id: string
    courier_id: string
    paid_at: string
    money_account_id: string
    description: string | null
    reference: string | null
  }>

  const paymentById = new Map<string, (typeof payments)[number]>()
  for (const p of payments) paymentById.set(p.id, p)

  // 3. Look up courier (a suppliers row, kind='courier') names
  //    and money account names in parallel
  const courierIds = Array.from(new Set(payments.map((p) => p.courier_id)))
  const accountIds = Array.from(new Set(payments.map((p) => p.money_account_id)))

  const [couriersRes, accountsRes] = await Promise.all([
    courierIds.length === 0
      ? Promise.resolve({ data: [] as Array<{ id: string; name: string }>, error: null })
      : supabase
          .from('suppliers')
          .select('id, name')
          .in('id', courierIds),
    accountIds.length === 0
      ? Promise.resolve({ data: [] as Array<{ id: string; name: string }>, error: null })
      : supabase
          .from('money_accounts')
          .select('id, name')
          .in('id', accountIds),
  ])
  if (couriersRes.error) throw couriersRes.error
  if (accountsRes.error) throw accountsRes.error

  const courierNameById = new Map<string, string>()
  for (const c of (couriersRes.data ?? []) as Array<{ id: string; name: string }>) {
    courierNameById.set(c.id, c.name)
  }
  const accountNameById = new Map<string, string>()
  for (const a of (accountsRes.data ?? []) as Array<{ id: string; name: string }>) {
    accountNameById.set(a.id, a.name)
  }

  // 4. Assemble allocations with names, sort by paid_at asc
  const assembled: TransportAllocation[] = allocs
    .map((a) => {
      const p = paymentById.get(a.courier_payment_id)
      return {
        allocation_id: a.id,
        payment_id: a.courier_payment_id,
        amount_dop: Number(a.amount_dop),
        paid_at: p?.paid_at ?? '',
        courier_name: p ? courierNameById.get(p.courier_id) ?? null : null,
        money_account_name: p ? accountNameById.get(p.money_account_id) ?? null : null,
        description: p?.description ?? null,
        reference: p?.reference ?? null,
      }
    })
    .sort((a, b) => compareTs(a.paid_at, b.paid_at))

  const allocated_dop = assembled.reduce((s, x) => s + x.amount_dop, 0)

  return {
    allocated_dop,
    allocation_count: assembled.length,
    allocations: assembled,
  }
}

// ---- partial receive (per line) ---------------------------

export type PartialReceiveStatus = {
  ordered: number
  received: number
  is_partial: boolean   // received > 0 but < ordered
  is_unreceived: boolean // received === 0
  is_complete: boolean   // received >= ordered
}

/**
 * Pure helper. Given a line (qty ordered) and its lot trail
 * entries (each lot has qty_received), report whether the line
 * was fully received, partially received, or not yet received.
 *
 * is_complete: received >= ordered. Greater-than-or-equal because
 * legacy data can have rounding quirks; "more than ordered" is
 * treated as complete, not as a separate state.
 *
 * Notes:
 * - Uses qty_received (what was booked into stock on receipt),
 *   not qty_remaining (what is currently in stock after sales
 *   have consumed some). qty_remaining decreases over time as
 *   sales happen; that's a different concept.
 * - "Partial" is strictly between 0 and ordered. Zero is its own
 *   thing (is_unreceived).
 */
export function partialReceiveStatus(
  line: { qty: number },
  lots: LotTrailEntry[],
): PartialReceiveStatus {
  const ordered = Number(line.qty)
  const received = lots.reduce((s, e) => s + Number(e.lot.qty_received), 0)
  const is_unreceived = received === 0
  const is_complete = received >= ordered
  const is_partial = !is_unreceived && !is_complete
  return { ordered, received, is_partial, is_unreceived, is_complete }
}
