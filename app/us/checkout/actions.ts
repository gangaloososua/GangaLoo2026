'use server'

// Server actions for the public US dropship checkout.
//
// Mirrors the DR checkout (app/(shop)/tienda/[warehouse]/checkout/actions.ts) but:
//   - all amounts are USD (no peso conversion anywhere)
//   - the order's authoritative total is read SERVER-SIDE via
//     get_us_order_for_payment(); the client never sets the amount
//   - the order is created first (pending) by create_us_order, then a gateway
//     action opens Stripe/PayPal for that exact amount
//   - the order is marked paid later by the webhook / return handler
//     (mark_us_order_paid, service-role only), never here.

import { createClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe'
import { createPaypalOrder } from '@/lib/paypal'

// ---------------------------------------------------------------------------
// Place a US order (status 'pending'). Prices are recomputed server-side by
// create_us_order from the products table — the client's price is ignored.
// Returns the new order id; the form then routes to the chosen payment method.
// ---------------------------------------------------------------------------
export type PlaceUsOrderInput = {
  customerName: string
  customerEmail: string
  customerPhone?: string
  shipLine1: string
  shipLine2?: string
  shipCity: string
  shipState: string
  shipZip: string
  items: { product_id: string; qty: number }[]
}

export type PlaceUsOrderResult =
  | { ok: true; orderId: string; totalUsd: number }
  | { ok: false; error: string }

export async function placeUsOrder(
  input: PlaceUsOrderInput,
): Promise<PlaceUsOrderResult> {
  try {
    if (!input.items || input.items.length === 0) {
      return { ok: false, error: 'cart empty' }
    }
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('create_us_order', {
      p_customer_name: input.customerName,
      p_customer_email: input.customerEmail,
      p_customer_phone: input.customerPhone ?? null,
      p_ship_line1: input.shipLine1,
      p_ship_line2: input.shipLine2 ?? null,
      p_ship_city: input.shipCity,
      p_ship_state: input.shipState,
      p_ship_zip: input.shipZip,
      p_items: input.items,
    })
    if (error) {
      console.error('[placeUsOrder] rpc error:', error)
      return { ok: false, error: error.message }
    }
    const res = data as { ok?: boolean; order_id?: string; total_usd?: number } | null
    if (!res?.ok || !res.order_id) {
      console.error('[placeUsOrder] unexpected result:', data)
      return { ok: false, error: 'unexpected result' }
    }
    return { ok: true, orderId: res.order_id, totalUsd: Number(res.total_usd ?? 0) }
  } catch (e) {
    console.error('[placeUsOrder] threw:', e)
    return { ok: false, error: e instanceof Error ? e.message : 'unknown' }
  }
}

type UsOrderForPayment = {
  ok?: boolean
  order_id?: string
  status?: string
  payment_method?: string | null
  total_usd?: number
  customer_name?: string
  customer_email?: string
}

// Read the order's authoritative USD total + status. Shared by both gateways.
async function readUsOrder(orderId: string): Promise<UsOrderForPayment | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_us_order_for_payment', {
    p_order_id: orderId,
  })
  if (error) {
    console.error('[us-checkout] order read failed:', error)
    return null
  }
  return data as UsOrderForPayment | null
}

// ---------------------------------------------------------------------------
// Stripe: hosted Checkout Session in USD for an already-created US order.
// ---------------------------------------------------------------------------
export type UsStripeResult = { ok: true; url: string } | { ok: false; error: string }

export async function startUsStripeCheckout(input: {
  orderId: string
  origin: string
}): Promise<UsStripeResult> {
  try {
    if (!input.orderId) return { ok: false, error: 'no order id' }

    const order = await readUsOrder(input.orderId)
    if (!order?.ok) return { ok: false, error: 'order not found' }
    if (order.status !== 'pending') {
      return { ok: false, error: 'order status is ' + String(order.status) }
    }

    const totalUsd = Number(order.total_usd ?? 0)
    if (!(totalUsd > 0)) return { ok: false, error: 'amount is ' + String(totalUsd) }

    // USD is a 2-decimal currency: Stripe unit_amount is in US cents.
    const unitAmount = Math.round(totalUsd * 100)

    const origin = input.origin.replace(/\/+$/, '')
    const stripe = getStripe()

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: unitAmount,
            product_data: { name: `GangaLoo US order ${input.orderId.slice(0, 8)}` },
          },
        },
      ],
      // The webhook reads us_order_id to know which order to mark paid.
      metadata: { us_order_id: input.orderId },
      success_url: `${origin}/us/checkout/gracias?order=${encodeURIComponent(input.orderId)}`,
      cancel_url: `${origin}/us/checkout?cancelled=1`,
    })

    if (!session.url) return { ok: false, error: 'stripe returned no url' }
    return { ok: true, url: session.url }
  } catch (e) {
    console.error('[startUsStripeCheckout] threw:', e)
    return { ok: false, error: e instanceof Error ? e.message : 'unknown' }
  }
}

// ---------------------------------------------------------------------------
// PayPal: approval page in USD for an already-created US order.
// ---------------------------------------------------------------------------
// No conversion: the order total is already USD, unlike the DR flow which
// converts pesos -> USD.
export type UsPaypalResult = { ok: true; url: string } | { ok: false; error: string }

export async function startUsPaypalCheckout(input: {
  orderId: string
  origin: string
}): Promise<UsPaypalResult> {
  try {
    if (!input.orderId) return { ok: false, error: 'no order id' }

    const order = await readUsOrder(input.orderId)
    if (!order?.ok) return { ok: false, error: 'order not found' }
    if (order.status !== 'pending') {
      return { ok: false, error: 'order status is ' + String(order.status) }
    }

    const totalUsd = Number(order.total_usd ?? 0)
    if (!(totalUsd > 0)) return { ok: false, error: 'amount is ' + String(totalUsd) }

    const valueUSD = totalUsd.toFixed(2)
    const origin = input.origin.replace(/\/+$/, '')

    const created = await createPaypalOrder({
      valueUSD,
      saleId: input.orderId, // custom_id on the PayPal order
      invoice: input.orderId.slice(0, 8),
      returnUrl: `${origin}/us/checkout/paypal-return?order=${encodeURIComponent(input.orderId)}`,
      cancelUrl: `${origin}/us/checkout?cancelled=1`,
    })

    return { ok: true, url: created.approveUrl }
  } catch (e) {
    console.error('[startUsPaypalCheckout] threw:', e)
    return { ok: false, error: e instanceof Error ? e.message : 'unknown' }
  }
}

// ---------------------------------------------------------------------------
// Thank-you page reader: safe order summary for /us/checkout/gracias.
// Works for all three methods (Stripe, PayPal, bank deposit).
// ---------------------------------------------------------------------------
export type UsThanksResult =
  | {
      ok: true
      orderId: string
      status: string
      paymentMethod: string | null
      totalUsd: number
      customerName: string
    }
  | { ok: false }

export async function getUsOrderForThanks(orderId: string): Promise<UsThanksResult> {
  try {
    if (!orderId) return { ok: false }
    const order = await readUsOrder(orderId)
    if (!order?.ok) return { ok: false }
    return {
      ok: true,
      orderId: order.order_id ?? orderId,
      status: order.status ?? 'pending',
      paymentMethod: order.payment_method ?? null,
      totalUsd: Number(order.total_usd ?? 0),
      customerName: order.customer_name ?? '',
    }
  } catch (e) {
    console.error('[getUsOrderForThanks] threw:', e)
    return { ok: false }
  }
}
