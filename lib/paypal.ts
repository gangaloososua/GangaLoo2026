import 'server-only'

// Server-only PayPal helper (Orders v2 REST API).
// Reads credentials from the environment:
//   PAYPAL_CLIENT_ID, PAYPAL_SECRET  — from your PayPal app
//   PAYPAL_ENV = 'sandbox' | 'live'  — defaults to 'sandbox'
// Use sandbox + sandbox credentials while testing; switch PAYPAL_ENV to 'live'
// with live credentials to go live. Importing this from a client component
// throws at build time (server-only).

function paypalBase(): string {
  const env = (process.env.PAYPAL_ENV || 'sandbox').toLowerCase()
  return env === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com'
}

async function getAccessToken(): Promise<string> {
  const id = process.env.PAYPAL_CLIENT_ID
  const secret = process.env.PAYPAL_SECRET
  if (!id || !secret) throw new Error('PAYPAL_CLIENT_ID / PAYPAL_SECRET not set')

  const basic = Buffer.from(`${id}:${secret}`).toString('base64')
  const res = await fetch(`${paypalBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`paypal token failed: ${res.status} ${await res.text()}`)
  }
  const json = (await res.json()) as { access_token?: string }
  if (!json.access_token) throw new Error('paypal token: no access_token')
  return json.access_token
}

export type CreatedPaypalOrder = { id: string; approveUrl: string }

export async function createPaypalOrder(input: {
  valueUSD: string // e.g. "0.85"
  saleId: string
  invoice: string
  returnUrl: string
  cancelUrl: string
}): Promise<CreatedPaypalOrder> {
  const token = await getAccessToken()
  const res = await fetch(`${paypalBase()}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [
        {
          custom_id: input.saleId,
          description: input.invoice ? `Pedido ${input.invoice}` : 'Pedido GangaLoo',
          amount: { currency_code: 'USD', value: input.valueUSD },
        },
      ],
      application_context: {
        brand_name: 'GangaLoo',
        user_action: 'PAY_NOW',
        shipping_preference: 'NO_SHIPPING',
        return_url: input.returnUrl,
        cancel_url: input.cancelUrl,
      },
    }),
  })
  if (!res.ok) {
    throw new Error(`paypal create order failed: ${res.status} ${await res.text()}`)
  }
  const json = (await res.json()) as {
    id?: string
    links?: { rel: string; href: string }[]
  }
  const approve = json.links?.find((l) => l.rel === 'approve')?.href
  if (!json.id || !approve) {
    throw new Error('paypal create order: missing id/approve link')
  }
  return { id: json.id, approveUrl: approve }
}

type PaypalCaptureResponse = {
  status?: string
  purchase_units?: {
    payments?: {
      captures?: {
        id?: string
        status?: string
        amount?: { value?: string; currency_code?: string }
      }[]
    }
  }[]
}

export type CapturedPaypalOrder = {
  ok: boolean
  captureId: string
  amountUSDCents: number
  raw: unknown
}

export async function capturePaypalOrder(orderId: string): Promise<CapturedPaypalOrder> {
  const token = await getAccessToken()
  const res = await fetch(
    `${paypalBase()}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    },
  )
  const json = (await res.json()) as PaypalCaptureResponse
  if (!res.ok) {
    throw new Error(`paypal capture failed: ${res.status} ${JSON.stringify(json)}`)
  }
  const cap = json.purchase_units?.[0]?.payments?.captures?.[0]
  const completed = json.status === 'COMPLETED' && cap?.status === 'COMPLETED'
  const value = cap?.amount?.value
  return {
    ok: Boolean(completed && cap?.id),
    captureId: cap?.id ?? '',
    amountUSDCents: value ? Math.round(parseFloat(value) * 100) : 0,
    raw: json,
  }
}
