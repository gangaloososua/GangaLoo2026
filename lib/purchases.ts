// ============================================================
// Round 14a - Purchases read surface
//
// SERVER-ONLY data layer. Imports next/headers via createClient
// transitively, so NEVER import this file from a 'use client'
// component. Client components import types and pure helpers
// from lib/purchases-types instead.
//
// All types and pure helpers are re-exported from
// lib/purchases-types so existing server-side callers can
// keep importing everything from @/lib/purchases.
//
// READ ONLY. No UPDATE / INSERT against purchase_orders,
// purchase_order_items, inventory_lots, courier_payments, or
// courier_payment_allocations from this module - those are
// 14b / 14c.
//
// Spec: docs/round-14-purchases.md
// ============================================================

import { createClient } from '@/lib/supabase/server'

import type {
  PurchaseStatus,
  PurchaseOrderRow,
  PurchaseOrderItemRow,
  LotTrailEntry,
  TransportAllocation,
  TransportSummary,
} from '@/lib/purchases-types'
import { statusMismatch } from '@/lib/purchases-types'

// Re-export everything from purchases-types so server-side
// callers can keep importing from @/lib/purchases unchanged.
export * from '@/lib/purchases-types'

// ============================================================
// Helpers used by multiple fetchers
// ============================================================

/** Compare ISO-timestamp strings, nulls last. */
function compareTs(a: string | null, b: string | null): number {
  if (a === b) return 0
  if (a == null) return 1
  if (b == null) return -1
  return a < b ? -1 : 1
}

// ============================================================
// Purchase orders (list + get) + the supplier/warehouse name
// denormalisation that both paths share
// ============================================================

const PURCHASE_ORDER_COLUMNS =
  'id, supplier_id, warehouse_id, supplier_payment_account_id, ' +
  'status, ' +
  'usd_subtotal, usd_shipping, usd_tax, usd_discount, usd_total, ' +
  'dop_paid_total, exchange_rate, dop_bank_fee, ' +
  'official_rate_at_payment, ' +
  'dop_refund_total, refund_at_dop, refund_account_id, ' +
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
  usd_discount: number | string
  usd_total: number | string
  dop_paid_total: number | string | null
  exchange_rate: number | string | null
  dop_bank_fee: number | string | null
  official_rate_at_payment: number | string | null
    dop_refund_total: number | string | null
    refund_at_dop: string | null
    refund_account_id: string | null
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
  refund_account_name: string | null,
): PurchaseOrderRow {
  return {
    ...r,
    usd_subtotal: Number(r.usd_subtotal),
    usd_shipping: Number(r.usd_shipping),
    usd_tax: Number(r.usd_tax),
    usd_discount: Number(r.usd_discount),
    usd_total: Number(r.usd_total),
    dop_paid_total: r.dop_paid_total == null ? null : Number(r.dop_paid_total),
    exchange_rate: r.exchange_rate == null ? null : Number(r.exchange_rate),
    dop_bank_fee: r.dop_bank_fee == null ? null : Number(r.dop_bank_fee),
    official_rate_at_payment:
      r.official_rate_at_payment == null ? null : Number(r.official_rate_at_payment),
    dop_refund_total: r.dop_refund_total == null ? null : Number(r.dop_refund_total),
    supplier_name,
    warehouse_name,
    refund_account_name,
  }
}

async function attachNames(
  supabase: Awaited<ReturnType<typeof createClient>>,
  raws: RawPurchaseOrder[],
): Promise<PurchaseOrderRow[]> {
  const supplierIds = Array.from(new Set(raws.map((r) => r.supplier_id).filter((x): x is string => !!x)))
  const warehouseIds = Array.from(new Set(raws.map((r) => r.warehouse_id).filter((x): x is string => !!x)))
  const refundAccountIds = Array.from(new Set(raws.map((r) => r.refund_account_id).filter((x): x is string => !!x)))

  const [suppliersRes, warehousesRes, refundAccountsRes] = await Promise.all([
    supplierIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabase.from('suppliers').select('id, name').in('id', supplierIds),
    warehouseIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabase.from('warehouses').select('id, name').in('id', warehouseIds),
    refundAccountIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabase.from('money_accounts').select('id, name').in('id', refundAccountIds),
  ])
  if (suppliersRes.error) throw suppliersRes.error
  if (warehousesRes.error) throw warehousesRes.error
  if (refundAccountsRes.error) throw refundAccountsRes.error

  const supplierNameById = new Map<string, string>()
  for (const s of (suppliersRes.data ?? []) as Array<{ id: string; name: string }>) {
    supplierNameById.set(s.id, s.name)
  }
  const warehouseNameById = new Map<string, string>()
  for (const w of (warehousesRes.data ?? []) as Array<{ id: string; name: string }>) {
    warehouseNameById.set(w.id, w.name)
  }
  const refundAccountNameById = new Map<string, string>()
  for (const a of (refundAccountsRes.data ?? []) as Array<{ id: string; name: string }>) {
    refundAccountNameById.set(a.id, a.name)
  }

  return raws.map((r) =>
    coercePurchaseOrder(
      r,
      r.supplier_id ? supplierNameById.get(r.supplier_id) ?? null : null,
      r.warehouse_id ? warehouseNameById.get(r.warehouse_id) ?? null : null,
      r.refund_account_id ? refundAccountNameById.get(r.refund_account_id) ?? null : null,
    ),
  )
}

export type ListPurchaseOrdersOptions = {
  search?: string
  status?: PurchaseStatus
  supplierId?: string
  warehouseId?: string
  dateFrom?: string
  dateTo?: string
  mismatchOnly?: boolean
  page?: number
  pageSize?: number
}

export type ListPurchaseOrdersResult = {
  rows: PurchaseOrderRow[]
  total: number
  page: number
  pageSize: number
}

export async function listPurchaseOrders(
  opts: ListPurchaseOrdersOptions = {},
): Promise<ListPurchaseOrdersResult> {
  const page = Math.max(1, opts.page ?? 1)
  const pageSize = Math.max(1, opts.pageSize ?? 50)
  const supabase = await createClient()

  let supplierIdsFromSearch: string[] | null = null
  if (opts.search && opts.search.trim()) {
    const qStr = opts.search.trim()
    const { data: matched, error: matchErr } = await supabase
      .from('suppliers')
      .select('id')
      .ilike('name', `%${qStr}%`)
    if (matchErr) throw matchErr
    supplierIdsFromSearch = (matched ?? []).map((r) => r.id as string)
  }

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
    const orParts = [`legacy_id.ilike.%${term}%`, `notes.ilike.%${term}%`]
    if (supplierIdsFromSearch && supplierIdsFromSearch.length > 0) {
      orParts.push(`supplier_id.in.(${supplierIdsFromSearch.join(',')})`)
    }
    q = q.or(orParts.join(','))
  }

  if (opts.mismatchOnly) {
    const { data, error } = await q
    if (error) throw error
    const raw = (data ?? []) as unknown as RawPurchaseOrder[]
    const filtered = raw.filter((r) => statusMismatch(r))
    const total = filtered.length
    const sliceStart = (page - 1) * pageSize
    const slice = filtered.slice(sliceStart, sliceStart + pageSize)
    const rows = await attachNames(supabase, slice)
    return { rows, total, page, pageSize }
  }

  const fromIdx = (page - 1) * pageSize
  const toIdx = fromIdx + pageSize - 1
  const { data, error, count } = await q.range(fromIdx, toIdx)
  if (error) throw error
  const raw = (data ?? []) as unknown as RawPurchaseOrder[]
  const rows = await attachNames(supabase, raw)
  return { rows, total: count ?? rows.length, page, pageSize }
}

export async function getPurchaseOrder(id: string): Promise<PurchaseOrderRow | null> {
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

// ============================================================
// Purchase order items
// ============================================================

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
    dop_unit_cost_base: r.dop_unit_cost_base == null ? null : Number(r.dop_unit_cost_base),
    dop_bank_share: r.dop_bank_share == null ? null : Number(r.dop_bank_share),
    dop_transport_share: r.dop_transport_share == null ? null : Number(r.dop_transport_share),
    dop_unit_landed_cost: r.dop_unit_landed_cost == null ? null : Number(r.dop_unit_landed_cost),
    product_name,
    product_sku,
  }
}

export async function getPurchaseOrderItems(orderId: string): Promise<PurchaseOrderItemRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('purchase_order_items')
    .select(PURCHASE_ORDER_ITEM_COLUMNS)
    .eq('purchase_order_id', orderId)
    .order('created_at', { ascending: true })
  if (error) throw error
  const raws = (data ?? []) as unknown as RawPurchaseOrderItem[]

  const productIds = Array.from(new Set(raws.map((r) => r.product_id).filter((x): x is string => !!x)))

  type ProductInfo = { name: string | null; sku: string | null }
  const productInfoById = new Map<string, ProductInfo>()
  if (productIds.length > 0) {
    const { data: products, error: prodErr } = await supabase
      .from('products')
      .select('id, name, sku')
      .in('id', productIds)
    if (prodErr) throw prodErr
    for (const p of (products ?? []) as Array<{ id: string; name: string | null; sku: string | null }>) {
      productInfoById.set(p.id, { name: p.name, sku: p.sku })
    }
  }

  return raws.map((r) => {
    const info = productInfoById.get(r.product_id)
    return coercePurchaseOrderItem(r, info?.name ?? null, info?.sku ?? null)
  })
}

// ============================================================
// Lot trail
// ============================================================

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

export async function getLotTrailForOrder(orderId: string): Promise<Map<string, LotTrailEntry[]>> {
  const supabase = await createClient()

  const { data: itemsData, error: itemsErr } = await supabase
    .from('purchase_order_items')
    .select('id')
    .eq('purchase_order_id', orderId)
  if (itemsErr) throw itemsErr
  const itemIds = ((itemsData ?? []) as Array<{ id: string }>).map((i) => i.id)

  const trail = new Map<string, LotTrailEntry[]>()
  for (const id of itemIds) trail.set(id, [])
  if (itemIds.length === 0) return trail

  const { data: lotsData, error: lotsErr } = await supabase
    .from('inventory_lots')
    .select('id, purchase_order_item_id, lot_number, qty_received, qty_remaining, unit_cost_dop, received_at')
    .in('purchase_order_item_id', itemIds)
  if (lotsErr) throw lotsErr
  const lots = (lotsData ?? []) as RawInventoryLot[]
  if (lots.length === 0) return trail

  const lotIds = lots.map((l) => l.id)
  const { data: consData, error: consErr } = await supabase
    .from('sale_lot_consumption')
    .select('id, sale_item_id, lot_id, qty_consumed')
    .in('lot_id', lotIds)
  if (consErr) throw consErr
  const consumption = (consData ?? []) as RawConsumption[]

  const saleIdByItemId = new Map<string, string>()
  if (consumption.length > 0) {
    const saleItemIds = Array.from(new Set(consumption.map((c) => c.sale_item_id)))
    const { data: siData, error: siErr } = await supabase
      .from('sale_items')
      .select('id, sale_id')
      .in('id', saleItemIds)
    if (siErr) throw siErr
    for (const si of (siData ?? []) as Array<{ id: string; sale_id: string }>) {
      saleIdByItemId.set(si.id, si.sale_id)
    }
  }

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

  const sellerIds = Array.from(
    new Set(Array.from(saleById.values()).map((s) => s.seller_id).filter((x): x is string => !!x)),
  )
  const sellerNameById = new Map<string, string>()
  if (sellerIds.length > 0) {
    const { data: profData, error: profErr } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', sellerIds)
    if (profErr) throw profErr
    for (const p of (profData ?? []) as Array<{ id: string; full_name: string }>) {
      sellerNameById.set(p.id, p.full_name)
    }
  }

  type ConsumptionItem = LotTrailEntry['consumption'][number]
  const consumptionByLotId = new Map<string, ConsumptionItem[]>()
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
      seller_name: sale.seller_id ? sellerNameById.get(sale.seller_id) ?? null : null,
    })
    consumptionByLotId.set(c.lot_id, arr)
  }

  for (const lot of lots) {
    const entry: LotTrailEntry = {
      lot: {
        id: lot.id,
        lot_number: lot.lot_number,
        qty_received: Number(lot.qty_received),
        qty_remaining: Number(lot.qty_remaining),
        unit_cost_dop: lot.unit_cost_dop == null ? null : Number(lot.unit_cost_dop),
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

  for (const entries of trail.values()) {
    entries.sort((a, b) => compareTs(a.lot.received_at, b.lot.received_at))
  }

  return trail
}

// ============================================================
// Filter options for the list page
// ============================================================

export type PurchaseFilterOptions = {
  suppliers: Array<{ id: string; name: string }>
  warehouses: Array<{ id: string; name: string }>
}

export async function getPurchaseFilterOptions(): Promise<PurchaseFilterOptions> {
  const supabase = await createClient()

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

  const [suppliersRes, warehousesRes] = await Promise.all([
    supplierIds.length === 0
      ? Promise.resolve({ data: [] as Array<{ id: string; name: string }>, error: null })
      : supabase.from('suppliers').select('id, name').in('id', supplierIds).order('name', { ascending: true }),
    supabase.from('warehouses').select('id, name').order('name', { ascending: true }),
  ])
  if (suppliersRes.error) throw suppliersRes.error
  if (warehousesRes.error) throw warehousesRes.error

  return {
    suppliers: (suppliersRes.data ?? []) as Array<{ id: string; name: string }>,
    warehouses: (warehousesRes.data ?? []) as Array<{ id: string; name: string }>,
  }
}

// ============================================================
// Transport summary (per order)
// ============================================================

export async function getTransportSummaryForOrder(orderId: string): Promise<TransportSummary> {
  const supabase = await createClient()

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

  const paymentIds = Array.from(new Set(allocs.map((a) => a.courier_payment_id)))
  const { data: payData, error: payErr } = await supabase
    .from('courier_payments')
    .select('id, courier_id, paid_at, money_account_id, description, reference')
    .in('id', paymentIds)
  if (payErr) throw payErr
  type PaymentRow = {
    id: string
    courier_id: string
    paid_at: string
    money_account_id: string
    description: string | null
    reference: string | null
  }
  const payments = (payData ?? []) as PaymentRow[]

  const paymentById = new Map<string, PaymentRow>()
  for (const p of payments) paymentById.set(p.id, p)

  // 3. Look up courier (a suppliers row, kind='courier') names
  //    and money account names in parallel
  const courierIds = Array.from(new Set(payments.map((p) => p.courier_id)))
  const accountIds = Array.from(new Set(payments.map((p) => p.money_account_id)))

  const [couriersRes, accountsRes] = await Promise.all([
    courierIds.length === 0
      ? Promise.resolve({ data: [] as Array<{ id: string; name: string }>, error: null })
      : supabase.from('suppliers').select('id, name').in('id', courierIds),
    accountIds.length === 0
      ? Promise.resolve({ data: [] as Array<{ id: string; name: string }>, error: null })
      : supabase.from('money_accounts').select('id, name').in('id', accountIds),
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

// ============================================================
// Form-side fetchers (14b.3 - /purchases/new)
// ============================================================
// These are gated by the consuming page (requireOwner on
// /purchases/new), matching the pattern of every other fetcher
// in this file.

// Couriers picker: name + id list, active suppliers with kind='courier'.
export type CourierPickerItem = { id: string; name: string }

export async function listCouriersForPicker(): Promise<CourierPickerItem[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('suppliers')
    .select('id, name')
    .eq('kind', 'courier')
    .eq('is_active', true)
    .order('name')

  if (error) throw new Error(error.message)
  return (data ?? []) as CourierPickerItem[]
}

// Suppliers picker: name + id list, active suppliers with kind='supplier'.
// The form's combobox seeds from this list; typing a brand-new name and
// submitting causes create_purchase_order to insert the supplier.
export type SupplierPickerItem = { id: string; name: string }

export async function listSuppliersForPicker(): Promise<SupplierPickerItem[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('suppliers')
    .select('id, name')
    .eq('kind', 'supplier')
    .eq('is_active', true)
    .order('name')

  if (error) throw new Error(error.message)
  return (data ?? []) as SupplierPickerItem[]
}

// Product picker grouped by category. A product appears under every
// category it is tagged with (is_visible = true). Products with no
// visible category memberships land in an "Uncategorized" bucket.
//
// Returns categories in display_order, then product groups within each
// category alphabetised by product name. The "Uncategorized" bucket
// goes last when present.
export type ProductPickerItem = {
  id: string
  sku: string
  name: string
}

export type ProductPickerCategoryGroup = {
  category_id: string | null   // null for the Uncategorized bucket
  category_name: string
  products: ProductPickerItem[]
}

export async function listProductsGroupedByCategory(): Promise<ProductPickerCategoryGroup[]> {
  const supabase = await createClient()

  const { data: products, error: prodErr } = await supabase
    .from('products')
    .select('id, sku, name')
    .eq('is_active', true)
    .order('name')
  if (prodErr) throw new Error(prodErr.message)

  const { data: memberships, error: memErr } = await supabase
    .from('product_categories')
    .select('product_id, category_id, is_visible')
    .eq('is_visible', true)
  if (memErr) throw new Error(memErr.message)

  const { data: categories, error: catErr } = await supabase
    .from('categories')
    .select('id, name, display_order, is_active')
    .eq('is_active', true)
    .order('display_order')
    .order('name')
  if (catErr) throw new Error(catErr.message)

  const productMap = new Map<string, ProductPickerItem>()
  for (const p of products ?? []) productMap.set(p.id, p as ProductPickerItem)

  const taggedProductIds = new Set<string>()
  const productsByCategory = new Map<string, Set<string>>()
  for (const m of memberships ?? []) {
    if (!productMap.has(m.product_id)) continue
    taggedProductIds.add(m.product_id)
    if (!productsByCategory.has(m.category_id)) {
      productsByCategory.set(m.category_id, new Set())
    }
    productsByCategory.get(m.category_id)!.add(m.product_id)
  }

  const groups: ProductPickerCategoryGroup[] = []
  for (const cat of categories ?? []) {
    const pidSet = productsByCategory.get(cat.id)
    if (!pidSet || pidSet.size === 0) continue
    const productsInCat = Array.from(pidSet)
      .map((pid) => productMap.get(pid)!)
      .sort((a, b) => a.name.localeCompare(b.name))
    groups.push({
      category_id: cat.id,
      category_name: cat.name,
      products: productsInCat,
    })
  }

  const orphans = (products ?? [])
    .filter((p) => !taggedProductIds.has(p.id))
    .map((p) => p as ProductPickerItem)
    .sort((a, b) => a.name.localeCompare(b.name))

  if (orphans.length > 0) {
    groups.push({
      category_id: null,
      category_name: 'Uncategorized',
      products: orphans,
    })
  }

  return groups
}