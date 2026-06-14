import { NextRequest, NextResponse } from 'next/server'
import { capturePaypalOrder } from '@/lib/paypal'
import { createAdminClient } from '@/lib/supabase/admin'

// PayPal sends the US customer back here after they approve. This is where the
// money moves: we capture the PayPal order, then mark the matching US order paid
// via mark_us_order_paid (idempotent, service-role only), then send the customer
// to the US thank-you page.
//
// USD throughout — no peso conversion (unlike the DR paypal-return). If the
// customer approves but never returns, nothing is captured and the order simply
// stays pending. Never cache.
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const orderId = url.searchParams.get('order') ?? ''   // our us_orders.id
  const ppToken = url.searchParams.get('token') ?? ''    // PayPal appends ?token=<paypalOrderId>
  const base = `${url.origin}/us/checkout`

  if (!orderId || !ppToken) {
    return NextResponse.redirect(`${base}?payfail=1`, { status: 303 })
  }

  try {
    const cap = await capturePaypalOrder(ppToken)
    if (!cap.ok || cap.amountUSDCents <= 0) {
      console.error('[us paypal-return] capture not completed', { orderId, ppToken })
      return NextResponse.redirect(`${base}?payfail=1`, { status: 303 })
    }

    const admin = createAdminClient()
    const { error } = await admin.rpc('mark_us_order_paid', {
      p_order_id: orderId,
      p_method: 'paypal',
      p_ref: cap.captureId,
    })
    if (error) {
      console.error('[us paypal-return] mark_us_order_paid error:', error)
      return NextResponse.redirect(`${base}?payfail=1`, { status: 303 })
    }

    return NextResponse.redirect(
      `${base}/gracias?order=${encodeURIComponent(orderId)}`,
      { status: 303 },
    )
  } catch (e) {
    console.error('[us paypal-return] threw:', e)
    return NextResponse.redirect(`${base}?payfail=1`, { status: 303 })
  }
}
