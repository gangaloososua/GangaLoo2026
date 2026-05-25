'use server'

// Server action for the public storefront checkout. Calls the locked-down,
// draft-only place_storefront_order() function. Logs the real error to the dev
// terminal so failures are diagnosable.
//
// Fees + payment method are NOT trusted from the client: the customer only
// sends their CHOICES (fulfillment, which pickup store, delivery region,
// payment method) and place_storefront_order() computes the actual fee
// server-side from store_config.delivery_fees.

import { createClient } from '@/lib/supabase/server'
import { resolveStoreWarehouse } from '@/lib/store/catalog'

export type PlaceOrderInput = {
  warehouseSlug: string
  customer: { name: string; phone: string; email?: string }
  fulfillment: 'pickup' | 'delivery'
  pickupWarehouseId?: string // chosen pickup store (when collecting at another store)
  deliveryRegion?: 'local' | 'national' // delivery only
  paymentMethod: 'cash' | 'transfer'
  shippingAddress?: string
  shippingCity?: string
  items: { product_id: string; qty: number }[]
}

export type PlaceOrderResult =
  | {
      ok: true
      invoiceNumber: string
      subtotalCents: number
      shippingCents: number
      totalCents: number
      paymentMethod: 'cash' | 'transfer'
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
      shipping_cents?: number
      total_cents?: number
      payment_method?: string
    } | null
    if (!res?.ok || !res.invoice_number) {
      console.error('[placeOnlineOrder] unexpected result:', data)
      return { ok: false, error: 'unexpected result' }
    }
    return {
      ok: true,
      invoiceNumber: res.invoice_number,
      subtotalCents: res.subtotal_cents ?? 0,
      shippingCents: res.shipping_cents ?? 0,
      totalCents: res.total_cents ?? 0,
      paymentMethod: res.payment_method === 'transfer' ? 'transfer' : 'cash',
    }
  } catch (e) {
    console.error('[placeOnlineOrder] threw:', e)
    return { ok: false, error: e instanceof Error ? e.message : 'unknown' }
  }
}
