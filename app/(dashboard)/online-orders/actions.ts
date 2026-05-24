'use server'
// Round 15.3 — online orders server actions
//
// Thin TypeScript wrappers around the online-orders RPCs:
//   create_online_order       → createOnlineOrder
//   mark_dispatched           → markOnlineOrderDispatched
//   mark_delivered            → markOnlineOrderDelivered
//   mark_cancelled_online     → cancelOnlineOrder
//   confirm_storefront_order  → confirmStorefrontOrder   (Round 28: storefront drafts)
//
// RBAC: owner + admin only, gated via requireRole(['owner','admin']).
// The RPCs re-check at SQL layer (defence in depth) and are the
// authoritative validators.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/guard'

// ----------------------------------------------------------------------
// Shared result shape
// ----------------------------------------------------------------------
type Ok<T> = { ok: true } & T
type Err = { ok: false; error: string }

// ----------------------------------------------------------------------
// createOnlineOrder
// ----------------------------------------------------------------------
export type CreateOnlineOrderDiscountApplication = {
  rule_id: string
  rule_kind: string
  percent: number | null
  amount_cents: number
  cap_hit: boolean
}

export type CreateOnlineOrderItemInput = {
  productId: string
  qty: number
  unitPriceCents: number
  discountCents: number
  discountBreakdown?: CreateOnlineOrderDiscountApplication[]
}

export type CreateOnlineOrderPaymentInput = {
  method: string
  amountCents: number
  moneyAccountId: string
  reference: string | null
}

export type CreateOnlineOrderInput = {
  customerId: string | null
  sellerId: string
  sourceWarehouseId: string
  fulfillmentWarehouseId: string
  fulfillmentMethod: 'pickup' | 'delivery' | 'in_store'
  discountCents: number
  shippingCents: number
  shippingAddress: string | null
  shippingCity: string | null
  deliveryNotes: string | null
  items: CreateOnlineOrderItemInput[]
  payments: CreateOnlineOrderPaymentInput[]
}

export type CreateOnlineOrderResult =
  | Ok<{ saleId: string; invoiceNumber: string }>
  | Err

export async function createOnlineOrder(
  input: CreateOnlineOrderInput,
): Promise<CreateOnlineOrderResult> {
  await requireRole(['owner', 'admin'] as const)

  if (!input.sellerId) return { ok: false, error: 'Seller is required' }
  if (!input.sourceWarehouseId)
    return { ok: false, error: 'Source warehouse is required' }
  if (!input.fulfillmentWarehouseId)
    return { ok: false, error: 'Fulfillment warehouse is required' }
  if (!input.fulfillmentMethod)
    return { ok: false, error: 'Fulfillment method is required' }
  if (!Array.isArray(input.items) || input.items.length === 0) {
    return { ok: false, error: 'At least one item is required' }
  }
  for (const item of input.items) {
    if (!item.productId)
      return { ok: false, error: 'Each item must select a product' }
    if (!Number.isFinite(item.qty) || item.qty <= 0)
      return { ok: false, error: 'Each item quantity must be > 0' }
    if (!Number.isFinite(item.unitPriceCents) || item.unitPriceCents < 0)
      return { ok: false, error: 'Each item unit price must be >= 0' }
    if (!Number.isFinite(item.discountCents) || item.discountCents < 0)
      return { ok: false, error: 'Each item discount must be >= 0' }
  }
  for (const pay of input.payments) {
    if (!pay.method)
      return { ok: false, error: 'Each payment must specify a method' }
    if (!Number.isFinite(pay.amountCents) || pay.amountCents <= 0)
      return { ok: false, error: 'Each payment amount must be > 0' }
    if (!pay.moneyAccountId)
      return { ok: false, error: 'Each payment must select a money account' }
  }
  if (!Number.isFinite(input.discountCents) || input.discountCents < 0)
    return { ok: false, error: 'Order discount must be >= 0' }
  if (!Number.isFinite(input.shippingCents) || input.shippingCents < 0)
    return { ok: false, error: 'Shipping fee must be >= 0' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('create_online_order', {
    p_payload: {
      customer_id: input.customerId,
      seller_id: input.sellerId,
      source_warehouse_id: input.sourceWarehouseId,
      fulfillment_warehouse_id: input.fulfillmentWarehouseId,
      fulfillment_method: input.fulfillmentMethod,
      discount_cents: input.discountCents,
      shipping_cents: input.shippingCents,
      shipping_address: input.shippingAddress,
      shipping_city: input.shippingCity,
      delivery_notes: input.deliveryNotes,
      items: input.items.map((i) => ({
        product_id: i.productId,
        qty: i.qty,
        unit_price_cents: i.unitPriceCents,
        discount_cents: i.discountCents,
        discount_breakdown: i.discountBreakdown,
      })),
      payments: input.payments.map((p) => ({
        method: p.method,
        amount_cents: p.amountCents,
        money_account_id: p.moneyAccountId,
        reference: p.reference,
      })),
    },
  })

  if (error) return { ok: false, error: error.message }

  const result = (data ?? {}) as {
    sale_id?: string
    invoice_number?: string
  }
  if (!result.sale_id || !result.invoice_number) {
    return {
      ok: false,
      error: 'create_online_order returned no sale_id / invoice_number',
    }
  }

  revalidatePath('/online-orders')
  revalidatePath(`/online-orders/${result.sale_id}`)

  return {
    ok: true,
    saleId: result.sale_id,
    invoiceNumber: result.invoice_number,
  }
}

// ----------------------------------------------------------------------
// confirmStorefrontOrder (Round 28) — confirm a storefront DRAFT
// ----------------------------------------------------------------------
export type ConfirmStorefrontInput = { saleId: string; sellerId: string }
export type ConfirmStorefrontResult = Ok<object> | Err

export async function confirmStorefrontOrder(
  input: ConfirmStorefrontInput,
): Promise<ConfirmStorefrontResult> {
  await requireRole(['owner', 'admin'] as const)

  if (!input.saleId) return { ok: false, error: 'Sale id is required' }
  if (!input.sellerId)
    return { ok: false, error: 'Please choose a salesperson to credit' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('confirm_storefront_order', {
    p_sale_id: input.saleId,
    p_seller_id: input.sellerId,
  })

  if (error) return { ok: false, error: error.message }

  revalidatePath('/online-orders')
  revalidatePath(`/online-orders/${input.saleId}`)
  return { ok: true }
}

// Sellers list for the confirm picker (owner/admin/seller/distributor profiles)
export type ConfirmSellerOption = { id: string; full_name: string }

export async function getSellersForConfirm(): Promise<ConfirmSellerOption[]> {
  await requireRole(['owner', 'admin'] as const)
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .in('role', ['owner', 'admin', 'seller', 'distributor'])
    .order('full_name')
  if (error) return []
  return (data ?? []).map((p) => ({
    id: p.id as string,
    full_name: p.full_name as string,
  }))
}

// ----------------------------------------------------------------------
// markOnlineOrderDispatched
// ----------------------------------------------------------------------
export type MarkDispatchedInput = {
  saleId: string
  trackingNumber: string | null
}
export type MarkDispatchedResult = Ok<object> | Err

export async function markOnlineOrderDispatched(
  input: MarkDispatchedInput,
): Promise<MarkDispatchedResult> {
  await requireRole(['owner', 'admin'] as const)

  if (!input.saleId) return { ok: false, error: 'Sale id is required' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('mark_dispatched', {
    p_sale_id: input.saleId,
    p_tracking_number: input.trackingNumber,
  })

  if (error) return { ok: false, error: error.message }

  revalidatePath('/online-orders')
  revalidatePath(`/online-orders/${input.saleId}`)
  return { ok: true }
}

// ----------------------------------------------------------------------
// markOnlineOrderDelivered
// ----------------------------------------------------------------------
export type MarkDeliveredInput = { saleId: string }
export type MarkDeliveredResult = Ok<object> | Err

export async function markOnlineOrderDelivered(
  input: MarkDeliveredInput,
): Promise<MarkDeliveredResult> {
  await requireRole(['owner', 'admin'] as const)

  if (!input.saleId) return { ok: false, error: 'Sale id is required' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('mark_delivered', {
    p_sale_id: input.saleId,
  })

  if (error) return { ok: false, error: error.message }

  revalidatePath('/online-orders')
  revalidatePath(`/online-orders/${input.saleId}`)
  return { ok: true }
}

// ----------------------------------------------------------------------
// cancelOnlineOrder
// ----------------------------------------------------------------------
export type CancelOnlineOrderInput = {
  saleId: string
  reason: string
}
export type CancelOnlineOrderResult = Ok<object> | Err

export async function cancelOnlineOrder(
  input: CancelOnlineOrderInput,
): Promise<CancelOnlineOrderResult> {
  await requireRole(['owner', 'admin'] as const)

  if (!input.saleId) return { ok: false, error: 'Sale id is required' }
  if (!input.reason || input.reason.trim().length === 0) {
    return { ok: false, error: 'Cancellation reason is required' }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('mark_cancelled_online', {
    p_sale_id: input.saleId,
    p_reason: input.reason.trim(),
  })

  if (error) return { ok: false, error: error.message }

  revalidatePath('/online-orders')
  revalidatePath(`/online-orders/${input.saleId}`)
  return { ok: true }
}
