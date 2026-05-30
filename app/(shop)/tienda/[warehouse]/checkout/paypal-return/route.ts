import { NextRequest, NextResponse } from 'next/server'
import { capturePaypalOrder } from '@/lib/paypal'
import { createAdminClient } from '@/lib/supabase/admin'

// PayPal sends the customer back here after they approve the payment. This is
// where the money actually moves: we capture the order, then mark the matching
// order paid via finalize_online_payment (idempotent, books US$ into the PayPal
// money account), then send the customer to the thank-you page.
//
// If the customer approves but never returns, nothing is captured and no money
// moves — the order simply stays unpaid. Never cache.
export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ warehouse: string }> },
) {
  const { warehouse } = await ctx.params
  const url = new URL(req.url)
  const saleId = url.searchParams.get('sale') ?? ''
  const orderId = url.searchParams.get('token') ?? '' // PayPal appends ?token=<orderId>
  const base = `${url.origin}/tienda/${warehouse}/checkout`

  if (!saleId || !orderId) {
    return NextResponse.redirect(`${base}?payfail=1`, { status: 303 })
  }

  try {
    const cap = await capturePaypalOrder(orderId)
    if (!cap.ok || cap.amountUSDCents <= 0) {
      console.error('[paypal-return] capture not completed', { saleId, orderId })
      return NextResponse.redirect(`${base}?payfail=1`, { status: 303 })
    }

    const admin = createAdminClient()
    const { data, error } = await admin.rpc('finalize_online_payment', {
      p_provider: 'paypal',
      p_provider_ref: cap.captureId,
      p_sale_id: saleId,
      p_amount_cents: cap.amountUSDCents,
      p_raw: cap.raw as Record<string, unknown>,
      p_currency: 'USD',
    })
    if (error) {
      console.error('[paypal-return] finalize error:', error)
      return NextResponse.redirect(`${base}?payfail=1`, { status: 303 })
    }

    const res = data as { invoice_number?: string } | null
    const inv = res?.invoice_number ?? ''
    return NextResponse.redirect(
      `${base}/gracias?inv=${encodeURIComponent(inv)}`,
      { status: 303 },
    )
  } catch (e) {
    console.error('[paypal-return] threw:', e)
    return NextResponse.redirect(`${base}?payfail=1`, { status: 303 })
  }
}
