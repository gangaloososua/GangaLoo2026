import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { getStripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'

// Stripe pings this URL the moment a payment succeeds. We verify the signature
// (so only the real Stripe can trigger it), then mark the matching order paid
// via finalize_online_payment(). That function is idempotent, so Stripe's normal
// retries can never double-count a payment.
//
// Needs the raw request body for signature verification, so never cache.
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    console.error('[stripe webhook] STRIPE_WEBHOOK_SECRET not set')
    return NextResponse.json({ error: 'not configured' }, { status: 500 })
  }

  const sig = req.headers.get('stripe-signature')
  if (!sig) {
    return NextResponse.json({ error: 'no signature' }, { status: 400 })
  }

  const body = await req.text()

  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(body, sig, secret)
  } catch (e) {
    console.error('[stripe webhook] signature verification failed:', e)
    return NextResponse.json({ error: 'bad signature' }, { status: 400 })
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session
      if (session.payment_status === 'paid') {
        const saleId = session.metadata?.sale_id
        const amount = session.amount_total ?? 0
        if (saleId) {
          const admin = createAdminClient()
          const { error } = await admin.rpc('finalize_online_payment', {
            p_provider: 'stripe',
            p_provider_ref: session.id,
            p_sale_id: saleId,
            p_amount_cents: amount,
            p_raw: event as unknown as Record<string, unknown>,
          })
          if (error) {
            // Return 500 so Stripe retries later.
            console.error('[stripe webhook] finalize_online_payment error:', error)
            return NextResponse.json({ error: 'finalize failed' }, { status: 500 })
          }
        } else {
          console.error('[stripe webhook] checkout.session.completed with no sale_id metadata')
        }
      }
    }
    // Other event types are acknowledged and ignored for now.
  } catch (e) {
    console.error('[stripe webhook] handler threw:', e)
    return NextResponse.json({ error: 'handler error' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
