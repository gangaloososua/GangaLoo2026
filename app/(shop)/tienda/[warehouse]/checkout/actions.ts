'use server'

// Server actions for the public storefront checkout.
//
// Fees, tier discount, and payment method are NOT trusted from the client: the
// customer only sends their CHOICES; place_storefront_order() (and the read-only
// get_storefront_quote()) compute fees and the loyalty-tier discount server-side.

import { createClient } from '@/lib/supabase/server'
import { resolveStoreWarehouse } from '@/lib/store/catalog'

export type PlaceOrderInput = {
  warehouseSlug: string
  customer: { name: string; phone: string; email?: string }
  fulfillment: 'pickup' | 'delivery'
  pickupWarehouseId?: string
  deliveryRegion?: 'local' | 'national'
  paymentMethod: 'cash' | 'transfer' | 'stripe' | 'paypal'
  shippingAddress?: string
  shippingCity?: string
  items: { product_id: string; qty: number }[]
}

export type PlaceOrderResult =
  | {
      ok: true
      invoiceNumber: string
      subtotalCents: number
      subtotalBeforeCents: number
      memberDiscountCents: number
      shippingCents: number
      paymentFeeCents: number
      totalCents: number
      amountDueCents: number
      paymentMethod: 'cash' | 'transfer' | 'stripe' | 'paypal'
      tierName: string
      tierDiscountPct: number
    }
  | { ok: false; error: string }

export async function placeOnlineOrder(
  input: PlaceOrderInput,
): Promise<PlaceOrderResult> {
  try {
    if (!input.items || input.items.length === 0) {
      return { ok: false, error: 'cart empty' }
    }

    const warehouse = await resolveStoreWarehouse(input.warehouseSlug)
    if (!warehouse) return { ok: false, error: 'warehouse not found' }

    const supabase = await createClient()
    const payload = {
      warehouse_id: warehouse.id,
      customer: {
        name: input.customer.name,
        phone: input.customer.phone,
        email: input.customer.email ?? null,
      },
      fulfillment: input.fulfillment,
      pickup_warehouse_id: input.pickupWarehouseId ?? null,
      delivery_region: input.deliveryRegion ?? null,
      payment_method: input.paymentMethod,
      shipping_address: input.shippingAddress ?? null,
      shipping_city: input.shippingCity ?? null,
      items: input.items,
    }

    const { data, error } = await supabase.rpc('place_storefront_order', {
      payload,
    })

    if (error) {
      console.error('[placeOnlineOrder] rpc error:', error)
      return { ok: false, error: error.message }
    }

    const res = data as {
      ok?: boolean
      invoice_number?: string
      subtotal_cents?: number
      subtotal_before_cents?: number
      member_discount_cents?: number
      shipping_cents?: number
      payment_fee_cents?: number
      total_cents?: number
      amount_due_cents?: number
      payment_method?: string
      tier_name?: string
      tier_discount_pct?: number
    } | null
    if (!res?.ok || !res.invoice_number) {
      console.error('[placeOnlineOrder] unexpected result:', data)
      return { ok: false, error: 'unexpected result' }
    }
    return {
      ok: true,
      invoiceNumber: res.invoice_number,
      subtotalCents: res.subtotal_cents ?? 0,
      subtotalBeforeCents: res.subtotal_before_cents ?? res.subtotal_cents ?? 0,
      memberDiscountCents: res.member_discount_cents ?? 0,
      shippingCents: res.shipping_cents ?? 0,
      paymentFeeCents: res.payment_fee_cents ?? 0,
      totalCents: res.total_cents ?? 0,
      amountDueCents: res.amount_due_cents ?? (res.total_cents ?? 0) + (res.payment_fee_cents ?? 0),
      paymentMethod:
        res.payment_method === 'transfer' || res.payment_method === 'stripe' || res.payment_method === 'paypal'
          ? res.payment_method
          : 'cash',
      tierName: res.tier_name ?? '',
      tierDiscountPct: Number(res.tier_discount_pct ?? 0),
    }
  } catch (e) {
    console.error('[placeOnlineOrder] threw:', e)
    return { ok: false, error: e instanceof Error ? e.message : 'unknown' }
  }
}

// Read-only price quote for the cart so checkout can show an accurate
// "Member discount (Bronze 5%)" line. Tier resolves from the logged-in session.
export type OrderQuoteResult =
  | {
      ok: true
      subtotalBeforeCents: number
      memberDiscountCents: number
      tierName: string
      tierDiscountPct: number
    }
  | { ok: false }

export async function getOrderQuote(input: {
  warehouseSlug: string
  items: { product_id: string; qty: number }[]
}): Promise<OrderQuoteResult> {
  try {
    if (!input.items || input.items.length === 0) return { ok: false }
    const warehouse = await resolveStoreWarehouse(input.warehouseSlug)
    if (!warehouse) return { ok: false }
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('get_storefront_quote', {
      payload: { warehouse_id: warehouse.id, items: input.items },
    })
    if (error) {
      console.error('[getOrderQuote] rpc error:', error)
      return { ok: false }
    }
    const res = data as {
      ok?: boolean
      subtotal_before_cents?: number
      member_discount_cents?: number
      tier_name?: string
      tier_discount_pct?: number
    } | null
    if (!res?.ok) return { ok: false }
    return {
      ok: true,
      subtotalBeforeCents: res.subtotal_before_cents ?? 0,
      memberDiscountCents: res.member_discount_cents ?? 0,
      tierName: res.tier_name ?? '',
      tierDiscountPct: Number(res.tier_discount_pct ?? 0),
    }
  } catch (e) {
    console.error('[getOrderQuote] threw:', e)
    return { ok: false }
  }
}
