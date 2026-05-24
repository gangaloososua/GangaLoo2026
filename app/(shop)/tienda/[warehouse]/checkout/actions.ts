'use server'

// Server action for the public storefront checkout. Calls the locked-down,
// draft-only place_storefront_order() function. Logs the real error to the dev
// terminal so failures are diagnosable.

import { createClient } from '@/lib/supabase/server'
import { resolveStoreWarehouse } from '@/lib/store/catalog'

export type PlaceOrderInput = {
  warehouseSlug: string
  customer: { name: string; phone: string; email?: string }
  fulfillment: 'pickup' | 'delivery'
  shippingAddress?: string
  shippingCity?: string
  items: { product_id: string; qty: number }[]
}

export type PlaceOrderResult =
  | { ok: true; invoiceNumber: string; totalCents: number }
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
      total_cents?: number
    } | null
    if (!res?.ok || !res.invoice_number) {
      console.error('[placeOnlineOrder] unexpected result:', data)
      return { ok: false, error: 'unexpected result' }
    }
    return {
      ok: true,
      invoiceNumber: res.invoice_number,
      totalCents: res.total_cents ?? 0,
    }
  } catch (e) {
    console.error('[placeOnlineOrder] threw:', e)
    return { ok: false, error: e instanceof Error ? e.message : 'unknown' }
  }
}
