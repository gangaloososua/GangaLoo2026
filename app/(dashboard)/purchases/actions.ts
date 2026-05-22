'use server'

// Round 14b.2 - purchases server actions
//
// Thin TypeScript wrappers around the 7 purchases RPCs.
// 6 are user-facing (markPaidSupplier, markReceived, markComplete,
// markCancelled, markLost, createPurchaseOrder). The 7th
// (_allocate_supplier_payment) is a private PL/pgSQL helper used
// by markPaidSupplier and createPurchaseOrder; never called directly
// from TS.
//
// All actions are owner-only per RBAC. Light client-side validation
// happens here before the round-trip; the RPCs re-validate.
//
// Per project convention, action result types are declared inline
// in this file (not in lib/purchases-types.ts). purchases-types.ts
// is for shapes consumed across the read surface; actions and their
// input/output types co-locate with the action.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireOwner } from '@/lib/auth/guard'

export type ActionResult = { ok: true } | { ok: false; error: string }

// ---------------------------------------------------------------------------
// markPaidSupplier
// ---------------------------------------------------------------------------
// pending -> paid_supplier. Allocates the DOP payment across lines,
// computes bank fee, sets dop_unit_landed_cost on every line.
// Round 24f: also posts the payment to the accounting ledger under the
// chosen expense category (required) and moves the account balance.
// ---------------------------------------------------------------------------

export type MarkPaidSupplierInput = {
  orderId: string
  dopPaidTotal: number
  exchangeRate: number
  officialRateAtPayment: number
  supplierPaymentAccountId: string
  paidAtDop: string // ISO
  categoryId: string // expense category - required, posts to the ledger (Round 24f)
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
// paid_supplier|received -> received. Creates inventory_lots rows for
// each receipt with qty > 0. Re-entrant for partial-receive flows.
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

  // Convert to the snake_case shape the RPC expects in the jsonb array.
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
// received -> complete. Pure acknowledgment. Transport-paid check is
// the user's responsibility per spec.
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
// pending|paid_supplier -> cancelled. Optional refund triple
// (amount + date + account) - app enforces "all three or none" here,
// DB stays permissive.
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
// received -> lost. Auto-detected loss per line (ordered - received).
// Recomputes cost basis on surviving unconsumed lots.
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
// The atomic multi-table write. Creates supplier (if needed), header,
// lines, optional inline supplier payment, optional inline transport.
// Returns the new order id so the form can redirect to /purchases/[id].
//
// Status outcome:
//   - no inline payment  -> pending
//   - inline payment     -> paid_supplier
//
// Round 24f: when there IS an inline payment, the chosen expense
// category (required) rides along and the payment posts to the ledger.
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
    categoryId: string // expense category - required when paying (Round 24f)
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

  // ---- Basic field checks ----
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

  // ---- Inline payment validation ----
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

  // ---- Inline transport validation ----
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

  // ---- Build the line payload in snake_case ----
  const linesPayload = input.lines.map((ln) => ({
    product_id: ln.productId,
    qty: ln.qty,
    usd_unit_cost: ln.usdUnitCost,
  }))

  // ---- Call the RPC ----
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

  // The RPC returns the new uuid as a scalar; supabase-js delivers it
  // directly as `data` (not wrapped in an object).
  const orderId = typeof data === 'string' ? data : null
  if (!orderId) {
    return { ok: false, error: 'create_purchase_order did not return an order id.' }
  }

  revalidatePath('/purchases')
  return { ok: true, orderId }
}
