'use client'

// app/us/checkout/us-checkout-form.tsx
// US checkout form (single-product "Buy now"). English, USD.
// Collects customer + US shipping address, then on a payment choice:
//   - card   -> placeUsOrder then startUsStripeCheckout (redirect to Stripe)
//   - paypal -> placeUsOrder then startUsPaypalCheckout (redirect to PayPal)
//   - deposit-> placeUsOrder then go to the thank-you page (pay-by-deposit info)
// The displayed total is informational; create_us_order recomputes the real
// price server-side, so the client can't change what is charged.

import { useState } from 'react'
import Link from 'next/link'
import {
  placeUsOrder,
  startUsStripeCheckout,
  startUsPaypalCheckout,
} from './actions'

const NAVY = '#0A2A66'
const RED = '#CE1126'
const MUTED = '#6b7280'

function usd(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

type Method = 'card' | 'paypal' | 'deposit'

export function UsCheckoutForm({
  productId,
  name,
  imageUrl,
  priceUsd,
  initialQty,
}: {
  productId: string
  name: string
  imageUrl: string | null
  priceUsd: number
  initialQty: number
}) {
  const [qty, setQty] = useState(initialQty)
  const [form, setForm] = useState({
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    shipLine1: '',
    shipLine2: '',
    shipCity: '',
    shipState: '',
    shipZip: '',
  })
  const [busy, setBusy] = useState<Method | null>(null)
  const [error, setError] = useState<string | null>(null)

  const lineTotal = priceUsd * qty

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  function validate(): string | null {
    if (!form.customerName.trim()) return 'Please enter your name.'
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.customerEmail.trim()))
      return 'Please enter a valid email address.'
    if (!form.shipLine1.trim()) return 'Please enter your street address.'
    if (!form.shipCity.trim()) return 'Please enter your city.'
    if (!form.shipState.trim()) return 'Please enter your state.'
    if (!form.shipZip.trim()) return 'Please enter your ZIP code.'
    return null
  }

  async function handle(method: Method) {
    setError(null)
    const v = validate()
    if (v) {
      setError(v)
      return
    }
    setBusy(method)
    try {
      const placed = await placeUsOrder({
        customerName: form.customerName.trim(),
        customerEmail: form.customerEmail.trim(),
        customerPhone: form.customerPhone.trim() || undefined,
        shipLine1: form.shipLine1.trim(),
        shipLine2: form.shipLine2.trim() || undefined,
        shipCity: form.shipCity.trim(),
        shipState: form.shipState.trim(),
        shipZip: form.shipZip.trim(),
        items: [{ product_id: productId, qty }],
      })
      if (!placed.ok) {
        setError('We could not place your order. Please try again.')
        setBusy(null)
        return
      }

      const origin = window.location.origin

      if (method === 'deposit') {
        window.location.href = `/us/checkout/gracias?order=${encodeURIComponent(placed.orderId)}`
        return
      }

      if (method === 'card') {
        const s = await startUsStripeCheckout({ orderId: placed.orderId, origin })
        if (s.ok) {
          window.location.href = s.url
          return
        }
        setError('Could not start card payment. Please try again.')
        setBusy(null)
        return
      }

      // paypal
      const p = await startUsPaypalCheckout({ orderId: placed.orderId, origin })
      if (p.ok) {
        window.location.href = p.url
        return
      }
      setError('Could not start PayPal. Please try again.')
      setBusy(null)
    } catch {
      setError('Something went wrong. Please try again.')
      setBusy(null)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '11px 13px',
    borderRadius: 10,
    border: '1px solid #d7dbe3',
    fontSize: 15,
    background: '#fff',
    color: '#16181d',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 13,
    fontWeight: 600,
    color: NAVY,
    marginBottom: 5,
  }

  return (
    <div>
      <Link href="/us" className="mb-5 inline-block text-[13px] font-semibold" style={{ color: NAVY }}>
        ← Back to shop
      </Link>

      {/* Order summary */}
      <div className="rounded-2xl bg-white p-4" style={{ border: '1px solid #eceef2' }}>
        <div className="flex items-center gap-4">
          <div
            className="shrink-0 overflow-hidden rounded-xl"
            style={{ width: 72, height: 72, background: '#f3f4f7', border: '1px solid #eceef2' }}
          >
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt={name} className="h-full w-full object-contain" />
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-[14px] font-medium" style={{ color: '#16181d' }}>
              {name}
            </p>
            <p className="mt-1 text-[13px]" style={{ color: MUTED }}>
              {usd(priceUsd)} each
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              className="h-8 w-8 rounded-lg text-[18px] font-semibold"
              style={{ border: '1px solid #d7dbe3', background: '#fff', color: NAVY }}
              aria-label="Decrease quantity"
            >
              −
            </button>
            <span className="w-6 text-center text-[15px] font-semibold">{qty}</span>
            <button
              type="button"
              onClick={() => setQty((q) => Math.min(99, q + 1))}
              className="h-8 w-8 rounded-lg text-[18px] font-semibold"
              style={{ border: '1px solid #d7dbe3', background: '#fff', color: NAVY }}
              aria-label="Increase quantity"
            >
              +
            </button>
          </div>
        </div>
        <div
          className="mt-4 flex items-center justify-between border-t pt-3"
          style={{ borderColor: '#eceef2' }}
        >
          <span className="text-[14px]" style={{ color: MUTED }}>
            Total (free shipping)
          </span>
          <span className="text-[20px] font-semibold" style={{ color: NAVY }}>
            {usd(lineTotal)}
          </span>
        </div>
      </div>

      {/* Customer + shipping */}
      <div className="mt-5 rounded-2xl bg-white p-5" style={{ border: '1px solid #eceef2' }}>
        <h2 className="mb-4 text-[16px] font-semibold" style={{ color: NAVY }}>
          Your details
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label style={labelStyle}>Full name</label>
            <input style={inputStyle} value={form.customerName} onChange={(e) => set('customerName', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Email</label>
            <input style={inputStyle} type="email" value={form.customerEmail} onChange={(e) => set('customerEmail', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Phone (optional)</label>
            <input style={inputStyle} value={form.customerPhone} onChange={(e) => set('customerPhone', e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label style={labelStyle}>Street address</label>
            <input style={inputStyle} value={form.shipLine1} onChange={(e) => set('shipLine1', e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label style={labelStyle}>Apt / unit (optional)</label>
            <input style={inputStyle} value={form.shipLine2} onChange={(e) => set('shipLine2', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>City</label>
            <input style={inputStyle} value={form.shipCity} onChange={(e) => set('shipCity', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>State</label>
            <input style={inputStyle} value={form.shipState} onChange={(e) => set('shipState', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>ZIP code</label>
            <input style={inputStyle} value={form.shipZip} onChange={(e) => set('shipZip', e.target.value)} />
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-xl px-4 py-3 text-[13px]" style={{ background: '#fde8e8', color: '#9b1c1c' }}>
          {error}
        </div>
      )}

      {/* Payment buttons */}
      <div className="mt-5 space-y-3">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => handle('card')}
          className="w-full rounded-xl px-5 py-4 text-[15px] font-semibold text-white disabled:opacity-60"
          style={{ background: NAVY }}
        >
          {busy === 'card' ? 'Starting…' : `Pay with card · ${usd(lineTotal)}`}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => handle('paypal')}
          className="w-full rounded-xl px-5 py-4 text-[15px] font-semibold disabled:opacity-60"
          style={{ background: '#ffc439', color: '#0a1a3d' }}
        >
          {busy === 'paypal' ? 'Starting…' : 'Pay with PayPal'}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => handle('deposit')}
          className="w-full rounded-xl px-5 py-4 text-[14px] font-semibold disabled:opacity-60"
          style={{ background: '#fff', color: NAVY, border: '1px solid ' + NAVY }}
        >
          {busy === 'deposit' ? 'Placing…' : 'Bank deposit'}
          <span className="ml-2 text-[12px] font-normal" style={{ color: MUTED }}>
            (local clients only)
          </span>
        </button>
      </div>

      <p className="mt-4 text-center text-[12px]" style={{ color: MUTED }}>
        Prices in US dollars · Free shipping · Secure payment
      </p>
    </div>
  )
}
