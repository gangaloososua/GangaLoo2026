'use server'

// Round 14b.2 - purchases server actions
//
// Thin TypeScript wrappers around the purchases RPCs. Action result types
// are declared inline (project convention).

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireOwner } from '@/lib/auth/guard'

export type ActionResult = { ok: true } | { ok: false; error: string }

// ---------------------------------------------------------------------------
// markPaidSupplier
// ---------------------------------------------------------------------------

export type MarkPaidSupplierInput = {
  orderId: string
  dopPaidTotal: number
  exchangeRate: number
  officialRateAtPayment: number
  supplierPaymentAccountId: string
  paidAtDop: string // ISO
  categoryId: string
}

export async function markPaidSupplier(
  input: MarkPaidSupplierInput,
): Promise<ActionResult> {
  await requireOwner()

  if (!input.orderId) return { ok: false, error: 'Order id is required.' }
  if (!input.supplierPaymentAccountId)
    return { ok: false, error: 'Pick the account the supplier was paid from.' }
  if (!Number.isFinite(input.dopPaidTotal) || input.dopPaidTotal <= 0)
    return { ok: false, error: 'DOP paid total must be greater than zero.' }
  if (!Number.isFinite(input.exchangeRate) || input.exchangeRate <= 0)
    return { ok: false, error: 'Exchange rate must be greater than zero.' }
  if (!Number.isFinite(input.officialRateAtPayment) || input.officialRateAtPayment <= 0)
    return { ok: false, error: 'Official rate must be greater than zero.' }
  if (!input.paidAtDop) return { ok: false, error: 'Payment date is required.' }
  if (!input.categoryId)
    return { ok: false, error: 'Pick an expense category for this payment.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('mark_paid_supplier', {
    p_purchase_order_id: input.orderId,
    p_dop_paid_total: input.dopPaidTotal,
    p_exchange_rate: input.exchangeRate,
    p_official_rate_at_payment: input.officialRateAtPayment,
    p_supplier_payment_account_id: input.supplierPaymentAccountId,
    p_paid_at_dop: input.paidAtDop,
    p_category_id: input.categoryId,
  })
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/purchases/${input.orderId}`)
  revalidatePath('/purchases')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// markReceived
// ---------------------------------------------------------------------------

export type MarkReceivedInput = {
  orderId: string
  receipts: { lineId: string; receivedQty: number }[]
}

export async function markReceived(
  input: MarkReceivedInput,
): Promise<ActionResult> {
  await requireOwner()

  if (!input.orderId) return { ok: false, error: 'Order id is required.' }
  if (!Array.isArray(input.receipts) || input.receipts.length === 0)
    return { ok: false, error: 'No receipts provided.' }
  if (!input.receipts.some((r) => r.receivedQty > 0))
    return { ok: false, error: 'At least one line must have received qty > 0.' }
  for (const r of input.receipts) {
    if (!r.lineId) return { ok: false, error: 'Each receipt needs a line id.' }
    if (!Number.isFinite(r.receivedQty) || r.receivedQty < 0)
      return { ok: false, error: 'Received qty must be >= 0.' }
  }

  const payload = input.receipts.map((r) => ({
    line_id: r.lineId,
    received_qty: r.receivedQty,
  }))

  const supabase = await createClient()
  const { error } = await supabase.rpc('mark_received', {
    p_purchase_order_id: input.orderId,
    p_receipts: payload,
  })
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/purchases/${input.orderId}`)
  revalidatePath('/purchases')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// markComplete
// ---------------------------------------------------------------------------

export async function markComplete(orderId: string): Promise<ActionResult> {
  await requireOwner()

  if (!orderId) return { ok: false, error: 'Order id is required.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('mark_complete', {
    p_purchase_order_id: orderId,
  })
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/purchases/${orderId}`)
  revalidatePath('/purchases')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// markCancelled
// ---------------------------------------------------------------------------

export type MarkCancelledInput = {
  orderId: string
  refund?: {
    dopRefundTotal: number
    refundAtDop: string
    refundAccountId: string
  }
}

export async function markCancelled(
  input: MarkCancelledInput,
): Promise<ActionResult> {
  await requireOwner()

  if (!input.orderId) return { ok: false, error: 'Order id is required.' }

  if (input.refund) {
    if (!Number.isFinite(input.refund.dopRefundTotal) || input.refund.dopRefundTotal <= 0)
      return { ok: false, error: 'Refund amount must be greater than zero.' }
    if (!input.refund.refundAtDop)
      return { ok: false, error: 'Refund date is required.' }
    if (!input.refund.refundAccountId)
      return { ok: false, error: 'Pick the account the refund went to.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('mark_cancelled', {
    p_purchase_order_id: input.orderId,
    p_dop_refund_total: input.refund?.dopRefundTotal ?? null,
    p_refund_at_dop: input.refund?.refundAtDop ?? null,
    p_refund_account_id: input.refund?.refundAccountId ?? null,
  })
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/purchases/${input.orderId}`)
  revalidatePath('/purchases')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// markLost
// ---------------------------------------------------------------------------

export async function markLost(orderId: string): Promise<ActionResult> {
  await requireOwner()

  if (!orderId) return { ok: false, error: 'Order id is required.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('mark_lost', {
    p_purchase_order_id: orderId,
  })
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/purchases/${orderId}`)
  revalidatePath('/purchases')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// createPurchaseOrder
// ---------------------------------------------------------------------------

export type CreatePurchaseOrderInput = {
  supplierName: string
  warehouseId: string
  orderedAt: string // ISO
  expectedAt: string | null
  notes: string | null
  lines: { productId: string; qty: number; usdUnitCost: number }[]
  usdShipping: number
  usdTax: number
  usdDiscount: number
  payment?: {
    dopPaidTotal: number
    exchangeRate: number
    officialRateAtPayment: number
    supplierPaymentAccountId: string
    paidAtDop: string
    categoryId: string
  }
  transport?: {
    amountDop: number
    courierId: string
    accountId: string
    paidAt: string
    description?: string | null
    reference?: string | null
  }
}

export type CreatePurchaseOrderResult =
  | { ok: true; orderId: string }
  | { ok: false; error: string }

export async function createPurchaseOrder(
  input: CreatePurchaseOrderInput,
): Promise<CreatePurchaseOrderResult> {
  await requireOwner()

  const supplierName = input.supplierName.trim()
  if (!supplierName) return { ok: false, error: 'Supplier name is required.' }
  if (!input.warehouseId) return { ok: false, error: 'Warehouse is required.' }
  if (!input.orderedAt) return { ok: false, error: 'Order date is required.' }

  if (!Array.isArray(input.lines) || input.lines.length === 0)
    return { ok: false, error: 'Add at least one line to the order.' }
  for (const ln of input.lines) {
    if (!ln.productId) return { ok: false, error: 'Each line needs a product.' }
    if (!Number.isFinite(ln.qty) || ln.qty <= 0)
      return { ok: false, error: 'Each line qty must be greater than zero.' }
    if (!Number.isFinite(ln.usdUnitCost) || ln.usdUnitCost < 0)
      return { ok: false, error: 'Each line unit cost must be zero or more.' }
  }

  const shipping = Number.isFinite(input.usdShipping) ? input.usdShipping : 0
  const tax      = Number.isFinite(input.usdTax)      ? input.usdTax      : 0
  const discount = Number.isFinite(input.usdDiscount) ? input.usdDiscount : 0
  if (shipping < 0) return { ok: false, error: 'Shipping must be zero or more.' }
  if (tax      < 0) return { ok: false, error: 'Tax must be zero or more.' }
  if (discount < 0) return { ok: false, error: 'Discount must be zero or more.' }

  if (input.payment) {
    const p = input.payment
    if (!Number.isFinite(p.dopPaidTotal) || p.dopPaidTotal <= 0)
      return { ok: false, error: 'DOP paid total must be greater than zero.' }
    if (!Number.isFinite(p.exchangeRate) || p.exchangeRate <= 0)
      return { ok: false, error: 'Exchange rate must be greater than zero.' }
    if (!Number.isFinite(p.officialRateAtPayment) || p.officialRateAtPayment <= 0)
      return { ok: false, error: 'Official rate must be greater than zero.' }
    if (!p.supplierPaymentAccountId)
      return { ok: false, error: 'Pick the account the supplier was paid from.' }
    if (!p.paidAtDop) return { ok: false, error: 'Payment date is required.' }
    if (!p.categoryId)
      return { ok: false, error: 'Pick an expense category for this payment.' }
  }

  if (input.transport) {
    const t = input.transport
    if (!Number.isFinite(t.amountDop) || t.amountDop <= 0)
      return { ok: false, error: 'Transport amount must be greater than zero.' }
    if (!t.courierId) return { ok: false, error: 'Pick a courier.' }
    if (!t.accountId) return { ok: false, error: 'Pick the account the courier was paid from.' }
    if (!t.paidAt) return { ok: false, error: 'Transport payment date is required.' }
  }
  if (input.transport && !input.payment) {
    return { ok: false, error: 'Inline transport requires inline payment.' }
  }

  const linesPayload = input.lines.map((ln) => ({
    product_id: ln.productId,
    qty: ln.qty,
    usd_unit_cost: ln.usdUnitCost,
  }))

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('create_purchase_order', {
    p_supplier_name:               supplierName,
    p_warehouse_id:                input.warehouseId,
    p_ordered_at:                  input.orderedAt,
    p_expected_at:                 input.expectedAt,
    p_notes:                       input.notes,
    p_lines:                       linesPayload,
    p_usd_shipping:                shipping,
    p_usd_tax:                     tax,
    p_usd_discount:                discount,
    p_dop_paid_total:              input.payment?.dopPaidTotal ?? null,
    p_exchange_rate:               input.payment?.exchangeRate ?? null,
    p_official_rate_at_payment:    input.payment?.officialRateAtPayment ?? null,
    p_supplier_payment_account_id: input.payment?.supplierPaymentAccountId ?? null,
    p_paid_at_dop:                 input.payment?.paidAtDop ?? null,
    p_category_id:                 input.payment?.categoryId ?? null,
    p_transport_amount_dop:        input.transport?.amountDop ?? null,
    p_courier_id:                  input.transport?.courierId ?? null,
    p_transport_account_id:        input.transport?.accountId ?? null,
    p_transport_paid_at:           input.transport?.paidAt ?? null,
    p_transport_description:       input.transport?.description ?? null,
    p_transport_reference:         input.transport?.reference ?? null,
  })

  if (error) return { ok: false, error: error.message }

  const orderId = typeof data === 'string' ? data : null
  if (!orderId) {
    return { ok: false, error: 'create_purchase_order did not return an order id.' }
  }

  revalidatePath('/purchases')
  return { ok: true, orderId }
}

// ---------------------------------------------------------------------------
// correctSupplierPayment (Round 24g)
// ---------------------------------------------------------------------------

export type CorrectSupplierPaymentInput = {
  orderId: string
  dopPaidTotal: number
  exchangeRate: number
  officialRateAtPayment: number
  supplierPaymentAccountId: string
  paidAtDop: string // ISO
  categoryId: string
}

export async function correctSupplierPayment(
  input: CorrectSupplierPaymentInput,
): Promise<ActionResult> {
  await requireOwner()

  if (!input.orderId) return { ok: false, error: 'Order id is required.' }
  if (!input.supplierPaymentAccountId)
    return { ok: false, error: 'Pick the account the supplier was paid from.' }
  if (!Number.isFinite(input.dopPaidTotal) || input.dopPaidTotal <= 0)
    return { ok: false, error: 'DOP paid total must be greater than zero.' }
  if (!Number.isFinite(input.exchangeRate) || input.exchangeRate <= 0)
    return { ok: false, error: 'Exchange rate must be greater than zero.' }
  if (!Number.isFinite(input.officialRateAtPayment) || input.officialRateAtPayment <= 0)
    return { ok: false, error: 'Official rate must be greater than zero.' }
  if (!input.paidAtDop) return { ok: false, error: 'Payment date is required.' }
  if (!input.categoryId)
    return { ok: false, error: 'Pick an expense category for this payment.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('correct_supplier_payment', {
    p_purchase_order_id: input.orderId,
    p_dop_paid_total: input.dopPaidTotal,
    p_exchange_rate: input.exchangeRate,
    p_official_rate_at_payment: input.officialRateAtPayment,
    p_supplier_payment_account_id: input.supplierPaymentAccountId,
    p_paid_at_dop: input.paidAtDop,
    p_category_id: input.categoryId,
  })
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/purchases/${input.orderId}`)
  revalidatePath('/purchases')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// editPendingPurchaseCosts (round-38a) — narrow shipping/tax/discount only.
// Kept for back-compat. The UI now uses updatePendingPurchaseOrder (round-40)
// which supersedes this.
// ---------------------------------------------------------------------------

export type EditPendingPurchaseCostsInput = {
  orderId: string
  usdShipping: number
  usdTax: number
  usdDiscount: number
}

export async function editPendingPurchaseCosts(
  input: EditPendingPurchaseCostsInput,
): Promise<ActionResult> {
  await requireOwner()

  if (!input.orderId) return { ok: false, error: 'Order id is required.' }
  if (!Number.isFinite(input.usdShipping) || input.usdShipping < 0)
    return { ok: false, error: 'Shipping must be zero or more.' }
  if (!Number.isFinite(input.usdTax) || input.usdTax < 0)
    return { ok: false, error: 'Tax must be zero or more.' }
  if (!Number.isFinite(input.usdDiscount) || input.usdDiscount < 0)
    return { ok: false, error: 'Discount must be zero or more.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('edit_pending_purchase_costs', {
    p_purchase_order_id: input.orderId,
    p_usd_shipping: input.usdShipping,
    p_usd_tax: input.usdTax,
    p_usd_discount: input.usdDiscount,
  })
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/purchases/${input.orderId}`)
  revalidatePath('/purchases')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// updatePendingPurchaseOrder (round-40) — FULL edit of a pending PO.
// Items (qty/price/product, add/remove), supplier, warehouse, dates, notes,
// and the three USD adjustments. Calls update_pending_purchase_order RPC which
// rejects anything that isn't strictly pending + unpaid + no transport.
// ---------------------------------------------------------------------------

export type UpdatePendingPurchaseOrderInput = {
  orderId: string
  supplierName: string
  warehouseId: string
  orderedAt: string // ISO
  expectedAt: string | null
  notes: string | null
  lines: { productId: string; qty: number; usdUnitCost: number }[]
  usdShipping: number
  usdTax: number
  usdDiscount: number
}

export async function updatePendingPurchaseOrder(
  input: UpdatePendingPurchaseOrderInput,
): Promise<ActionResult> {
  await requireOwner()

  if (!input.orderId) return { ok: false, error: 'Order id is required.' }

  const supplierName = input.supplierName.trim()
  if (!supplierName) return { ok: false, error: 'Supplier name is required.' }
  if (!input.warehouseId) return { ok: false, error: 'Warehouse is required.' }
  if (!input.orderedAt) return { ok: false, error: 'Order date is required.' }

  if (!Array.isArray(input.lines) || input.lines.length === 0)
    return { ok: false, error: 'Add at least one line to the order.' }
  for (const ln of input.lines) {
    if (!ln.productId) return { ok: false, error: 'Each line needs a product.' }
    if (!Number.isFinite(ln.qty) || ln.qty <= 0)
      return { ok: false, error: 'Each line qty must be greater than zero.' }
    if (!Number.isFinite(ln.usdUnitCost) || ln.usdUnitCost < 0)
      return { ok: false, error: 'Each line unit cost must be zero or more.' }
  }

  const shipping = Number.isFinite(input.usdShipping) ? input.usdShipping : 0
  const tax      = Number.isFinite(input.usdTax)      ? input.usdTax      : 0
  const discount = Number.isFinite(input.usdDiscount) ? input.usdDiscount : 0
  if (shipping < 0) return { ok: false, error: 'Shipping must be zero or more.' }
  if (tax      < 0) return { ok: false, error: 'Tax must be zero or more.' }
  if (discount < 0) return { ok: false, error: 'Discount must be zero or more.' }

  const linesPayload = input.lines.map((ln) => ({
    product_id: ln.productId,
    qty: ln.qty,
    usd_unit_cost: ln.usdUnitCost,
  }))

  const supabase = await createClient()
  const { error } = await supabase.rpc('update_pending_purchase_order', {
    p_purchase_order_id: input.orderId,
    p_supplier_name:     supplierName,
    p_warehouse_id:      input.warehouseId,
    p_ordered_at:        input.orderedAt,
    p_expected_at:       input.expectedAt,
    p_notes:             input.notes,
    p_lines:             linesPayload,
    p_usd_shipping:      shipping,
    p_usd_tax:           tax,
    p_usd_discount:      discount,
  })

  if (error) return { ok: false, error: error.message }

  revalidatePath(`/purchases/${input.orderId}`)
  revalidatePath(`/purchases/${input.orderId}/edit`)
  revalidatePath('/purchases')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// paySupplierForReceived (round-38c)
// ---------------------------------------------------------------------------

export type PaySupplierForReceivedInput = {
  orderId: string
  dopPaidTotal: number
  exchangeRate: number
  officialRateAtPayment: number
  supplierPaymentAccountId: string
  paidAtDop: string // ISO
  categoryId: string
}

export async function paySupplierForReceived(
  input: PaySupplierForReceivedInput,
): Promise<ActionResult> {
  await requireOwner()

  if (!input.orderId) return { ok: false, error: 'Order id is required.' }
  if (!input.supplierPaymentAccountId)
    return { ok: false, error: 'Pick the account the supplier was paid from.' }
  if (!Number.isFinite(input.dopPaidTotal) || input.dopPaidTotal <= 0)
    return { ok: false, error: 'DOP paid total must be greater than zero.' }
  if (!Number.isFinite(input.exchangeRate) || input.exchangeRate <= 0)
    return { ok: false, error: 'Exchange rate must be greater than zero.' }
  if (!Number.isFinite(input.officialRateAtPayment) || input.officialRateAtPayment <= 0)
    return { ok: false, error: 'Official rate must be greater than zero.' }
  if (!input.paidAtDop) return { ok: false, error: 'Payment date is required.' }
  if (!input.categoryId)
    return { ok: false, error: 'Pick an expense category for this payment.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('pay_supplier_for_received', {
    p_purchase_order_id: input.orderId,
    p_dop_paid_total: input.dopPaidTotal,
    p_exchange_rate: input.exchangeRate,
    p_official_rate_at_payment: input.officialRateAtPayment,
    p_supplier_payment_account_id: input.supplierPaymentAccountId,
    p_paid_at_dop: input.paidAtDop,
    p_category_id: input.categoryId,
  })
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/purchases/${input.orderId}`)
  revalidatePath('/purchases')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// completePaymentRecord (round-38e)
// ---------------------------------------------------------------------------

export type CompletePaymentRecordInput = {
  orderId: string
  supplierPaymentAccountId: string
  paidAtDop: string // ISO
  officialRateAtPayment?: number | null
  categoryId?: string | null
}

export async function completePaymentRecord(
  input: CompletePaymentRecordInput,
): Promise<ActionResult> {
  await requireOwner()

  if (!input.orderId) return { ok: false, error: 'Order id is required.' }
  if (!input.supplierPaymentAccountId)
    return { ok: false, error: 'Pick the account the supplier was paid from.' }
  if (!input.paidAtDop) return { ok: false, error: 'Payment date is required.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('complete_payment_record', {
    p_purchase_order_id: input.orderId,
    p_supplier_payment_account_id: input.supplierPaymentAccountId,
    p_paid_at_dop: input.paidAtDop,
    p_official_rate_at_payment: input.officialRateAtPayment ?? null,
    p_category_id: input.categoryId ?? null,
  })
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/purchases/${input.orderId}`)
  revalidatePath('/purchases')
  return { ok: true }
}
