// Round 15.4 - Online orders read surface
//
// SERVER-ONLY data layer. Imports next/headers transitively via
// createClient — do not import this file from a 'use client'
// component.
//
// Read only. No INSERT / UPDATE / DELETE against sales or any
// sub-table. Writes go through the four RPCs via
// app/(dashboard)/online-orders/actions.ts:
//   create_online_order, mark_dispatched, mark_delivered,
//   mark_cancelled_online.
//
// public.sales is source of truth for online orders.
// source='online' rows are online orders. No separate table.
//
// Spec: docs/round-15-online-orders.md
// ============================================================

import { createClient } from '@/lib/supabase/server'

// ============================================================
// Types — exported
// ============================================================

export type SaleStatus =
  | 'draft'
  | 'confirmed'
  | 'paid'
  | 'partially_paid'
  | 'refunded'
  | 'cancelled'

export type FulfillmentMethod = 'in_store' | 'pickup' | 'delivery'

// tracking_status is text (not an enum). v1 vocabulary listed for
// reference; the column can legally hold other strings (one
// legacy row is 'pending'). Treat as plain string in code.
export type OnlineOrderRow = {
  id: string
  invoiceNumber: string | null
  saleStatus: SaleStatus
  trackingStatus: string | null
  fulfillmentMethod: FulfillmentMethod
  customerId: string | null
  customerName: string | null
  sellerId: string | null
  sellerName: string | null
  sourceWarehouseId: string | null
  sourceWarehouseName: string | null
  fulfillmentWarehouseId: string
  fulfillmentWarehouseName: string
  subtotalCents: number
  totalCents: number
  paidCents: number
  itemCount: number
  soldAt: string
  confirmedAt: string | null
  dispatchedAt: string | null
  deliveredAt: string | null
  createdAt: string
}

export type OnlineOrderItemRow = {
  id: string
  saleId: string
  productId: string
  productSku: string | null
  productName: string | null
  qty: number
  unitPriceCents: number
  discountCents: number
  lineTotalCents: number | null
  sellerCommissionPercent: number
  distributorCommissionPercent: number
  cogsCents: number | null
  createdAt: string
}

export type OnlineOrderPaymentRow = {
  id: string
  saleId: string
  method: string
  amountCents: number
  moneyAccountId: string
  moneyAccountName: string | null
  paidAt: string
  reference: string | null
  createdAt: string
}

export type OnlineOrderLotConsumptionRow = {
  id: string
  saleItemId: string
  lotId: string
  lotNumber: string | null
  productId: string | null
  productName: string | null
  qtyConsumed: number
  // DOP numeric value, NOT cents. unit_cost_dop is stored as
  // a numeric (not an integer cents column). The detail page
  // should render this as a DOP amount directly, not divide by 100.
  unitCostDop: number
  createdAt: string
}

export type OnlineOrderCommissionRow = {
  id: string
  saleItemId: string
  earnerId: string
  // 'seller' | 'distributor' (USER-DEFINED enum, treat as text here)
  earnerRole: string
  earnerName: string | null
  percent: number
  amountCents: number
  // 'pending' | 'paid' | 'void' (USER-DEFINED enum, treat as text)
  status: string
  payoutId: string | null
  createdAt: string
}

export type OnlineOrderDetail = {
  // Core
  id: string
  invoiceNumber: string | null
  source: 'online'
  saleStatus: SaleStatus
  trackingStatus: string | null

  // People
  customerId: string | null
  customerName: string | null
  customerEmail: string | null
  customerPhone: string | null
  sellerId: string | null
  sellerName: string | null

  // Warehouses + fulfillment
  sourceWarehouseId: string | null
  sourceWarehouseName: string | null
  fulfillmentWarehouseId: string
  fulfillmentWarehouseName: string
  fulfillmentMethod: FulfillmentMethod
  isMixedWarehouse: boolean

  // Money
  subtotalCents: number
  discountCents: number
  taxCents: number
  shippingCents: number
  totalCents: number | null
  paidCents: number
  cogsCents: number | null
  grossProfitCents: number | null

  // Timestamps
  soldAt: string
  confirmedAt: string | null
  paidAt: string | null
  dispatchedAt: string | null
  deliveredAt: string | null
  refundedAt: string | null
  createdAt: string
  updatedAt: string

  // Delivery
  shippingAddress: string | null
  shippingCity: string | null
  deliveryNotes: string | null
  trackingNumber: string | null
  refundReason: string | null

  // Sub-tables
  items: OnlineOrderItemRow[]
  payments: OnlineOrderPaymentRow[]
  lotConsumption: OnlineOrderLotConsumptionRow[]
  commissions: OnlineOrderCommissionRow[]
}

export type ListOnlineOrdersOptions = {
  page?: number
  perPage?: number
  trackingStatus?: string | null
  saleStatus?: SaleStatus | null
  fulfillmentMethod?: FulfillmentMethod | null
  fulfillmentWarehouseId?: string | null
  customerId?: string | null
  sellerId?: string | null
  soldAfter?: string | null // ISO datetime
  soldBefore?: string | null // ISO datetime
}

export type ListOnlineOrdersResult = {
  rows: OnlineOrderRow[]
  total: number
  page: number
  perPage: number
}

export type OnlineOrderFilterOptions = {
  warehouses: Array<{ id: string; name: string }>
  trackingStatuses: string[]
}

// ============================================================
// Internal raw row types (snake_case as returned by Supabase)
// ============================================================

type RawSaleListRow = {
  id: string
  invoice_number: string | null
  status: SaleStatus
  tracking_status: string | null
  customer_id: string | null
  seller_id: string | null
  source_warehouse_id: string | null
  fulfillment_warehouse_id: string
  fulfillment_method: FulfillmentMethod
  subtotal_cents: number
  total_cents: number | null
  paid_cents: number
  sold_at: string
  confirmed_at: string | null
  dispatched_at: string | null
  delivered_at: string | null
  created_at: string
}

type RawSaleDetailRow = RawSaleListRow & {
  source: string
  is_mixed_warehouse: boolean
  discount_cents: number
  tax_cents: number
  shipping_cents: number
  cogs_cents: number | null
  gross_profit_cents: number | null
  paid_at: string | null
  refunded_at: string | null
  shipping_address: string | null
  shipping_city: string | null
  delivery_notes: string | null
  tracking_number: string | null
  refund_reason: string | null
  updated_at: string
}

type RawSaleItem = {
  id: string
  sale_id: string
  product_id: string
  qty: number | string
  unit_price_cents: number
  discount_cents: number
  line_total_cents: number | null
  seller_commission_percent: number | string
  distributor_commission_percent: number | string
  cogs_cents: number | null
  created_at: string
}

type RawSalePayment = {
  id: string
  sale_id: string
  method: string
  amount_cents: number
  money_account_id: string
  paid_at: string
  reference: string | null
  created_at: string
}

type RawLotConsumption = {
  id: string
  sale_item_id: string
  lot_id: string
  qty_consumed: number | string
  unit_cost_dop: number | string
  created_at: string
}

type RawCommission = {
  id: string
  sale_item_id: string
  earner_id: string
  earner_role: string
  percent: number | string
  amount_cents: number
  status: string
  payout_id: string | null
  created_at: string
}

// ============================================================
// Helpers
// ============================================================

function toNumber(v: number | string | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'string' ? Number(v) : v
}

// ============================================================
// listOnlineOrders
// ============================================================

export async function listOnlineOrders(
  opts: ListOnlineOrdersOptions = {},
): Promise<ListOnlineOrdersResult> {
  const supabase = await createClient()
  const page = Math.max(1, opts.page ?? 1)
  const perPage = Math.max(1, Math.min(200, opts.perPage ?? 50))
  const from = (page - 1) * perPage
  const to = from + perPage - 1

  let q = supabase
    .from('sales')
    .select(
      'id, invoice_number, status, tracking_status, customer_id, seller_id, ' +
        'source_warehouse_id, fulfillment_warehouse_id, fulfillment_method, ' +
        'subtotal_cents, total_cents, paid_cents, sold_at, confirmed_at, ' +
        'dispatched_at, delivered_at, created_at',
      { count: 'exact' },
    )
    .eq('source', 'online')
    .order('sold_at', { ascending: false })
    .range(from, to)

  if (opts.trackingStatus) q = q.eq('tracking_status', opts.trackingStatus)
  if (opts.saleStatus) q = q.eq('status', opts.saleStatus)
  if (opts.fulfillmentMethod) q = q.eq('fulfillment_method', opts.fulfillmentMethod)
  if (opts.fulfillmentWarehouseId)
    q = q.eq('fulfillment_warehouse_id', opts.fulfillmentWarehouseId)
  if (opts.customerId) q = q.eq('customer_id', opts.customerId)
  if (opts.sellerId) q = q.eq('seller_id', opts.sellerId)
  if (opts.soldAfter) q = q.gte('sold_at', opts.soldAfter)
  if (opts.soldBefore) q = q.lte('sold_at', opts.soldBefore)

  const { data, error, count } = await q
  if (error) throw error

  const raw = (data ?? []) as unknown as RawSaleListRow[]
  const saleIds = raw.map((r) => r.id)
  const customerIds = Array.from(
    new Set(raw.map((r) => r.customer_id).filter((x): x is string => !!x)),
  )
  const sellerIds = Array.from(
    new Set(raw.map((r) => r.seller_id).filter((x): x is string => !!x)),
  )
  const sourceWhIds = Array.from(
    new Set(
      raw.map((r) => r.source_warehouse_id).filter((x): x is string => !!x),
    ),
  )
  const fulfillWhIds = Array.from(
    new Set(raw.map((r) => r.fulfillment_warehouse_id)),
  )
  const allWhIds = Array.from(new Set([...sourceWhIds, ...fulfillWhIds]))
  const allProfileIds = Array.from(new Set([...customerIds, ...sellerIds]))

  // Profiles (customers + sellers)
  const profileNameById = new Map<string, string>()
  if (allProfileIds.length > 0) {
    const { data: ps, error: pErr } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', allProfileIds)
    if (pErr) throw pErr
    for (const p of (ps ?? []) as Array<{ id: string; full_name: string }>) {
      profileNameById.set(p.id, p.full_name)
    }
  }

  // Warehouses (source + fulfillment, deduped)
  const warehouseNameById = new Map<string, string>()
  if (allWhIds.length > 0) {
    const { data: ws, error: wErr } = await supabase
      .from('warehouses')
      .select('id, name')
      .in('id', allWhIds)
    if (wErr) throw wErr
    for (const w of (ws ?? []) as Array<{ id: string; name: string }>) {
      warehouseNameById.set(w.id, w.name)
    }
  }

  // Item counts per sale
  const itemCountById = new Map<string, number>()
  if (saleIds.length > 0) {
    const { data: its, error: iErr } = await supabase
      .from('sale_items')
      .select('sale_id')
      .in('sale_id', saleIds)
    if (iErr) throw iErr
    for (const it of (its ?? []) as Array<{ sale_id: string }>) {
      itemCountById.set(it.sale_id, (itemCountById.get(it.sale_id) ?? 0) + 1)
    }
  }

  const rows: OnlineOrderRow[] = raw.map((r) => ({
    id: r.id,
    invoiceNumber: r.invoice_number,
    saleStatus: r.status,
    trackingStatus: r.tracking_status,
    fulfillmentMethod: r.fulfillment_method,
    customerId: r.customer_id,
    customerName: r.customer_id
      ? profileNameById.get(r.customer_id) ?? null
      : null,
    sellerId: r.seller_id,
    sellerName: r.seller_id ? profileNameById.get(r.seller_id) ?? null : null,
    sourceWarehouseId: r.source_warehouse_id,
    sourceWarehouseName: r.source_warehouse_id
      ? warehouseNameById.get(r.source_warehouse_id) ?? null
      : null,
    fulfillmentWarehouseId: r.fulfillment_warehouse_id,
    fulfillmentWarehouseName:
      warehouseNameById.get(r.fulfillment_warehouse_id) ?? '(unknown warehouse)',
    subtotalCents: r.subtotal_cents,
    totalCents: r.total_cents ?? 0,
    paidCents: r.paid_cents,
    itemCount: itemCountById.get(r.id) ?? 0,
    soldAt: r.sold_at,
    confirmedAt: r.confirmed_at,
    dispatchedAt: r.dispatched_at,
    deliveredAt: r.delivered_at,
    createdAt: r.created_at,
  }))

  return { rows, total: count ?? 0, page, perPage }
}

// ============================================================
// listOnlineOrdersByStatus
//
// Convenience wrapper around listOnlineOrders for the
// status-segmented list views (e.g. "Received", "Dispatched",
// "Delivered" tabs).
// ============================================================

export async function listOnlineOrdersByStatus(
  trackingStatus: string,
  opts: Omit<ListOnlineOrdersOptions, 'trackingStatus'> = {},
): Promise<ListOnlineOrdersResult> {
  return listOnlineOrders({ ...opts, trackingStatus })
}

// ============================================================
// getOnlineOrderById
//
// Returns the full sale row plus sub-table arrays:
//   items, payments, lotConsumption, commissions
// All joined names resolved via batch lookup tables.
//
// Returns null if the row doesn't exist OR is not an online sale
// (source != 'online'). The source filter is a safety guard so
// this fetcher cannot accidentally surface POS sales to the
// online-orders UI.
// ============================================================

export async function getOnlineOrderById(
  id: string,
): Promise<OnlineOrderDetail | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('sales')
    .select(
      'id, invoice_number, source, status, tracking_status, customer_id, ' +
        'seller_id, source_warehouse_id, fulfillment_warehouse_id, ' +
        'fulfillment_method, is_mixed_warehouse, subtotal_cents, ' +
        'discount_cents, tax_cents, shipping_cents, total_cents, ' +
        'paid_cents, cogs_cents, gross_profit_cents, sold_at, ' +
        'confirmed_at, paid_at, dispatched_at, delivered_at, ' +
        'refunded_at, shipping_address, shipping_city, delivery_notes, ' +
        'tracking_number, refund_reason, created_at, updated_at',
    )
    .eq('id', id)
    .eq('source', 'online')
    .maybeSingle()
  if (error) throw error
  if (!data) return null

  const sale = data as unknown as RawSaleDetailRow

  // Customer (full profile)
  let customerName: string | null = null
  let customerEmail: string | null = null
  let customerPhone: string | null = null
  if (sale.customer_id) {
    const { data: c, error: cErr } = await supabase
      .from('profiles')
      .select('full_name, email, phone')
      .eq('id', sale.customer_id)
      .maybeSingle()
    if (cErr) throw cErr
    if (c) {
      const cp = c as {
        full_name: string
        email: string | null
        phone: string | null
      }
      customerName = cp.full_name
      customerEmail = cp.email
      customerPhone = cp.phone
    }
  }

  // Seller (name only)
  let sellerName: string | null = null
  if (sale.seller_id) {
    const { data: s, error: sErr } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', sale.seller_id)
      .maybeSingle()
    if (sErr) throw sErr
    if (s) sellerName = (s as { full_name: string }).full_name
  }

  // Warehouses (both source + fulfillment, deduped)
  const whIds = [sale.fulfillment_warehouse_id]
  if (sale.source_warehouse_id && sale.source_warehouse_id !== sale.fulfillment_warehouse_id) {
    whIds.push(sale.source_warehouse_id)
  }
  const warehouseNameById = new Map<string, string>()
  {
    const { data: ws, error: wErr } = await supabase
      .from('warehouses')
      .select('id, name')
      .in('id', whIds)
    if (wErr) throw wErr
    for (const w of (ws ?? []) as Array<{ id: string; name: string }>) {
      warehouseNameById.set(w.id, w.name)
    }
  }

  // Items
  const { data: itemsRaw, error: iErr } = await supabase
    .from('sale_items')
    .select(
      'id, sale_id, product_id, qty, unit_price_cents, discount_cents, ' +
        'line_total_cents, seller_commission_percent, ' +
        'distributor_commission_percent, cogs_cents, created_at',
    )
    .eq('sale_id', id)
    .order('created_at', { ascending: true })
  if (iErr) throw iErr
  const itemsRow = (itemsRaw ?? []) as unknown as RawSaleItem[]
  const itemIds = itemsRow.map((it) => it.id)
  const productIds = Array.from(new Set(itemsRow.map((it) => it.product_id)))

  // Products (used by items AND by lot consumption rows below)
  const productById = new Map<string, { sku: string; name: string }>()
  if (productIds.length > 0) {
    const { data: ps, error: pErr } = await supabase
      .from('products')
      .select('id, sku, name')
      .in('id', productIds)
    if (pErr) throw pErr
    for (const p of (ps ?? []) as Array<{
      id: string
      sku: string
      name: string
    }>) {
      productById.set(p.id, { sku: p.sku, name: p.name })
    }
  }

  const items: OnlineOrderItemRow[] = itemsRow.map((it) => {
    const prod = productById.get(it.product_id)
    return {
      id: it.id,
      saleId: it.sale_id,
      productId: it.product_id,
      productSku: prod?.sku ?? null,
      productName: prod?.name ?? null,
      qty: toNumber(it.qty),
      unitPriceCents: it.unit_price_cents,
      discountCents: it.discount_cents,
      lineTotalCents: it.line_total_cents,
      sellerCommissionPercent: toNumber(it.seller_commission_percent),
      distributorCommissionPercent: toNumber(it.distributor_commission_percent),
      cogsCents: it.cogs_cents,
      createdAt: it.created_at,
    }
  })

  // Payments
  const { data: paysRaw, error: payErr } = await supabase
    .from('sale_payments')
    .select(
      'id, sale_id, method, amount_cents, money_account_id, paid_at, ' +
        'reference, created_at',
    )
    .eq('sale_id', id)
    .order('paid_at', { ascending: true })
  if (payErr) throw payErr
  const paysRow = (paysRaw ?? []) as unknown as RawSalePayment[]
  const accountIds = Array.from(new Set(paysRow.map((p) => p.money_account_id)))
  const accountNameById = new Map<string, string>()
  if (accountIds.length > 0) {
    const { data: ms, error: mErr } = await supabase
      .from('money_accounts')
      .select('id, name')
      .in('id', accountIds)
    if (mErr) throw mErr
    for (const m of (ms ?? []) as Array<{ id: string; name: string }>) {
      accountNameById.set(m.id, m.name)
    }
  }
  const payments: OnlineOrderPaymentRow[] = paysRow.map((p) => ({
    id: p.id,
    saleId: p.sale_id,
    method: p.method,
    amountCents: p.amount_cents,
    moneyAccountId: p.money_account_id,
    moneyAccountName: accountNameById.get(p.money_account_id) ?? null,
    paidAt: p.paid_at,
    reference: p.reference,
    createdAt: p.created_at,
  }))

  // Lot consumption
  let lotConsumption: OnlineOrderLotConsumptionRow[] = []
  if (itemIds.length > 0) {
    const { data: lcsRaw, error: lcErr } = await supabase
      .from('sale_lot_consumption')
      .select(
        'id, sale_item_id, lot_id, qty_consumed, unit_cost_dop, created_at',
      )
      .in('sale_item_id', itemIds)
      .order('created_at', { ascending: true })
    if (lcErr) throw lcErr
    const lcsRow = (lcsRaw ?? []) as RawLotConsumption[]
    const lotIds = Array.from(new Set(lcsRow.map((l) => l.lot_id)))

    const lotById = new Map<
      string,
      { lot_number: string; product_id: string }
    >()
    if (lotIds.length > 0) {
      const { data: ls, error: lErr } = await supabase
        .from('inventory_lots')
        .select('id, lot_number, product_id')
        .in('id', lotIds)
      if (lErr) throw lErr
      for (const l of (ls ?? []) as Array<{
        id: string
        lot_number: string
        product_id: string
      }>) {
        lotById.set(l.id, {
          lot_number: l.lot_number,
          product_id: l.product_id,
        })
      }
    }

    lotConsumption = lcsRow.map((lc) => {
      const lot = lotById.get(lc.lot_id)
      const prod = lot ? productById.get(lot.product_id) : undefined
      return {
        id: lc.id,
        saleItemId: lc.sale_item_id,
        lotId: lc.lot_id,
        lotNumber: lot?.lot_number ?? null,
        productId: lot?.product_id ?? null,
        productName: prod?.name ?? null,
        qtyConsumed: toNumber(lc.qty_consumed),
        unitCostDop: toNumber(lc.unit_cost_dop),
        createdAt: lc.created_at,
      }
    })
  }

  // Commissions
  let commissions: OnlineOrderCommissionRow[] = []
  if (itemIds.length > 0) {
    const { data: csRaw, error: cmErr } = await supabase
      .from('sale_commissions')
      .select(
        'id, sale_item_id, earner_id, earner_role, percent, amount_cents, ' +
          'status, payout_id, created_at',
      )
      .in('sale_item_id', itemIds)
      .order('created_at', { ascending: true })
    if (cmErr) throw cmErr
    const csRow = (csRaw ?? []) as unknown as RawCommission[]
    const earnerIds = Array.from(new Set(csRow.map((c) => c.earner_id)))
    const earnerNameById = new Map<string, string>()
    if (earnerIds.length > 0) {
      const { data: es, error: eErr } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', earnerIds)
      if (eErr) throw eErr
      for (const e of (es ?? []) as Array<{
        id: string
        full_name: string
      }>) {
        earnerNameById.set(e.id, e.full_name)
      }
    }
    commissions = csRow.map((c) => ({
      id: c.id,
      saleItemId: c.sale_item_id,
      earnerId: c.earner_id,
      earnerRole: c.earner_role,
      earnerName: earnerNameById.get(c.earner_id) ?? null,
      percent: toNumber(c.percent),
      amountCents: c.amount_cents,
      status: c.status,
      payoutId: c.payout_id,
      createdAt: c.created_at,
    }))
  }

  return {
    id: sale.id,
    invoiceNumber: sale.invoice_number,
    source: 'online',
    saleStatus: sale.status,
    trackingStatus: sale.tracking_status,
    customerId: sale.customer_id,
    customerName,
    customerEmail,
    customerPhone,
    sellerId: sale.seller_id,
    sellerName,
    sourceWarehouseId: sale.source_warehouse_id,
    sourceWarehouseName: sale.source_warehouse_id
      ? warehouseNameById.get(sale.source_warehouse_id) ?? null
      : null,
    fulfillmentWarehouseId: sale.fulfillment_warehouse_id,
    fulfillmentWarehouseName:
      warehouseNameById.get(sale.fulfillment_warehouse_id) ??
      '(unknown warehouse)',
    fulfillmentMethod: sale.fulfillment_method,
    isMixedWarehouse: sale.is_mixed_warehouse,
    subtotalCents: sale.subtotal_cents,
    discountCents: sale.discount_cents,
    taxCents: sale.tax_cents,
    shippingCents: sale.shipping_cents,
    totalCents: sale.total_cents,
    paidCents: sale.paid_cents,
    cogsCents: sale.cogs_cents,
    grossProfitCents: sale.gross_profit_cents,
    soldAt: sale.sold_at,
    confirmedAt: sale.confirmed_at,
    paidAt: sale.paid_at,
    dispatchedAt: sale.dispatched_at,
    deliveredAt: sale.delivered_at,
    refundedAt: sale.refunded_at,
    createdAt: sale.created_at,
    updatedAt: sale.updated_at,
    shippingAddress: sale.shipping_address,
    shippingCity: sale.shipping_city,
    deliveryNotes: sale.delivery_notes,
    trackingNumber: sale.tracking_number,
    refundReason: sale.refund_reason,
    items,
    payments,
    lotConsumption,
    commissions,
  }
}

// ============================================================
// getOnlineOrderFilterOptions
//
// Used by the list page (15.5) to populate the warehouse +
// tracking-status filter dropdowns. Returns only values that
// actually appear on online sales (avoids showing irrelevant
// POS-only warehouses).
// ============================================================

export async function getOnlineOrderFilterOptions(): Promise<OnlineOrderFilterOptions> {
  const supabase = await createClient()

  // Warehouses that appear as fulfillment_warehouse_id on any online order
  const { data: salesWh, error: swErr } = await supabase
    .from('sales')
    .select('fulfillment_warehouse_id')
    .eq('source', 'online')
  if (swErr) throw swErr
  const whIds = Array.from(
    new Set(
      ((salesWh ?? []) as Array<{ fulfillment_warehouse_id: string }>).map(
        (r) => r.fulfillment_warehouse_id,
      ),
    ),
  )

  let warehouses: Array<{ id: string; name: string }> = []
  if (whIds.length > 0) {
    const { data: ws, error: wErr } = await supabase
      .from('warehouses')
      .select('id, name')
      .in('id', whIds)
      .order('name', { ascending: true })
    if (wErr) throw wErr
    warehouses = ((ws ?? []) as Array<{ id: string; name: string }>).map(
      (w) => ({ id: w.id, name: w.name }),
    )
  }

  // tracking_status values currently in use on online sales
  const { data: tsData, error: tsErr } = await supabase
    .from('sales')
    .select('tracking_status')
    .eq('source', 'online')
    .not('tracking_status', 'is', null)
  if (tsErr) throw tsErr
  const trackingStatuses = Array.from(
    new Set(
      ((tsData ?? []) as Array<{ tracking_status: string }>)
        .map((r) => r.tracking_status)
        .filter((x): x is string => !!x),
    ),
  ).sort()

  return { warehouses, trackingStatuses }
}
