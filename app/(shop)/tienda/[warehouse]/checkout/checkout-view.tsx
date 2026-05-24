'use client'

import { useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { formatDOP } from '@/lib/format'
import { ts, type Locale } from '@/lib/i18n/shop'
import { useCart } from '@/lib/store/cart'
import { placeOnlineOrder } from './actions'

const NAVY = '#0A2A66'
const RED = '#CE1126'
const INK = '#16181d'
const MUTED = '#6b7280'

function price(cents: number) {
  return formatDOP(cents, { decimals: 0 })
}

function Icon({ d, size = 22 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

const ICON = {
  back: 'M15 6l-6 6 6 6',
  store: 'M3 9l9-5 9 5v11H3zM7 20v-6h10v6',
  truck: 'M3 7h11v10H3zM14 10h4l3 3v4h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  check: 'M5 12l4 4 10-10',
}

const inputStyle: CSSProperties = {
  width: '100%',
  background: '#fff',
  border: '1px solid #d7dde6',
  borderRadius: 12,
  padding: '10px 12px',
  fontSize: 14,
  color: INK,
  outline: 'none',
}

export function CheckoutView({
  warehouseSlug,
  warehouseName,
}: {
  warehouseSlug: string
  warehouseName: string
}) {
  const [locale, setLocale] = useState<Locale>('es')
  const cart = useCart(warehouseSlug)

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [method, setMethod] = useState<'pickup' | 'delivery'>('pickup')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [invoice, setInvoice] = useState<string | null>(null)
  const [placedTotal, setPlacedTotal] = useState(0)

  const storeHref = `/tienda/${warehouseSlug}`

  const submit = async () => {
    setError('')
    if (!name.trim() || !phone.trim() || (method === 'delivery' && !address.trim())) {
      setError(ts(locale, 'shop.required'))
      return
    }
    setSubmitting(true)
    const res = await placeOnlineOrder({
      warehouseSlug,
      customer: { name: name.trim(), phone: phone.trim(), email: email.trim() || undefined },
      fulfillment: method,
      shippingAddress: address.trim() || undefined,
      shippingCity: city.trim() || undefined,
      items: cart.items.map((i) => ({ product_id: i.id, qty: i.qty })),
    })
    setSubmitting(false)
    if (res.ok) {
      setInvoice(res.invoiceNumber)
      setPlacedTotal(res.totalCents)
      cart.clear()
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
    } else {
      setError(ts(locale, 'shop.orderError'))
    }
  }

  return (
    <div style={{ background: '#f7f8fa', color: INK, minHeight: '100vh', paddingBottom: 24 }}>
      <header className="sticky top-0 z-30" style={{ background: NAVY, color: '#fff' }}>
        <div className="mx-auto flex w-full max-w-[720px] items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Link href={`${storeHref}/carrito`} aria-label={ts(locale, 'shop.back')} className="opacity-90"><Icon d={ICON.back} /></Link>
            <span className="text-[19px] font-semibold tracking-wide">GangaLoo</span>
          </div>
          <div className="flex overflow-hidden rounded-full text-[11px]" style={{ border: '1px solid rgba(255,255,255,.5)' }}>
            <button onClick={() => setLocale('es')} className="px-2.5 py-1 transition" style={locale === 'es' ? { background: '#fff', color: NAVY } : { color: '#cdd8ee' }}>ES</button>
            <button onClick={() => setLocale('en')} className="px-2.5 py-1 transition" style={locale === 'en' ? { background: '#fff', color: NAVY } : { color: '#cdd8ee' }}>EN</button>
          </div>
        </div>
        <div className="flex h-1">
          <div className="flex-1" style={{ background: NAVY }} />
          <div className="flex-1 bg-white" />
          <div className="flex-1" style={{ background: RED }} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[720px] px-4 py-6">
        {invoice ? (
          <div className="rounded-2xl bg-white p-6 text-center" style={{ border: '1px solid #eceef2' }}>
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full text-white" style={{ background: '#1d9e75' }}><Icon d={ICON.check} size={26} /></div>
            <h1 className="text-[20px] font-semibold" style={{ color: NAVY }}>{ts(locale, 'shop.orderPlaced')}</h1>
            <p className="mt-2 text-[13px]" style={{ color: MUTED }}>{ts(locale, 'shop.orderNumber')}</p>
            <p className="text-[22px] font-semibold tracking-wide" style={{ color: RED }}>{invoice}</p>
            <p className="mx-auto mt-2 max-w-sm text-[13px]" style={{ color: MUTED }}>{ts(locale, 'shop.orderConfirmText')}</p>
            <div className="mx-auto mt-4 max-w-sm rounded-xl p-3 text-left text-[13px]" style={{ background: '#f7f8fa' }}>
              <p><span style={{ color: MUTED }}>{ts(locale, 'shop.name')}:</span> {name}</p>
              <p><span style={{ color: MUTED }}>{ts(locale, 'shop.phone')}:</span> {phone}</p>
              <p><span style={{ color: MUTED }}>{ts(locale, 'shop.fulfillment')}:</span> {method === 'pickup' ? `${ts(locale, 'shop.pickup')} · ${warehouseName}` : `${ts(locale, 'shop.delivery')} · ${address}`}</p>
              <p className="mt-1"><span style={{ color: MUTED }}>{ts(locale, 'shop.total')}:</span> <span style={{ color: NAVY, fontWeight: 600 }}>{price(placedTotal)}</span></p>
            </div>
            <Link href={storeHref} className="mt-4 inline-block rounded-full px-6 py-2.5 text-[13px] font-semibold text-white" style={{ background: RED }}>{ts(locale, 'shop.keepShopping')}</Link>
          </div>
        ) : cart.items.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <p className="text-[15px]" style={{ color: MUTED }}>{ts(locale, 'shop.cartEmptyCheckout')}</p>
            <Link href={storeHref} className="rounded-full px-6 py-2.5 text-[13px] font-semibold text-white" style={{ background: RED }}>{ts(locale, 'shop.keepShopping')}</Link>
          </div>
        ) : (
          <>
            <h1 className="mb-4 text-[22px] font-semibold" style={{ color: NAVY }}>{ts(locale, 'shop.checkoutTitle')}</h1>

            <section className="mb-4 rounded-2xl bg-white p-4" style={{ border: '1px solid #eceef2' }}>
              <h2 className="mb-3 text-[14px] font-semibold" style={{ color: INK }}>{ts(locale, 'shop.contact')}</h2>
              <div className="flex flex-col gap-3">
                <div>
                  <label className="mb-1 block text-[12px]" style={{ color: MUTED }}>{ts(locale, 'shop.name')} *</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label className="mb-1 block text-[12px]" style={{ color: MUTED }}>{ts(locale, 'shop.phone')} *</label>
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" style={inputStyle} />
                </div>
                <div>
                  <label className="mb-1 block text-[12px]" style={{ color: MUTED }}>{ts(locale, 'shop.emailOpt')}</label>
                  <input value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" style={inputStyle} />
                </div>
              </div>
            </section>

            <section className="mb-4 rounded-2xl bg-white p-4" style={{ border: '1px solid #eceef2' }}>
              <h2 className="mb-3 text-[14px] font-semibold" style={{ color: INK }}>{ts(locale, 'shop.fulfillment')}</h2>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setMethod('pickup')} className="flex items-center gap-2 rounded-xl px-3 py-3 text-[13px] transition" style={method === 'pickup' ? { border: `2px solid ${NAVY}`, color: NAVY, background: '#fff' } : { border: '1px solid #d7dde6', color: INK, background: '#fff' }}>
                  <Icon d={ICON.store} size={18} /> {ts(locale, 'shop.pickup')}
                </button>
                <button onClick={() => setMethod('delivery')} className="flex items-center gap-2 rounded-xl px-3 py-3 text-[13px] transition" style={method === 'delivery' ? { border: `2px solid ${NAVY}`, color: NAVY, background: '#fff' } : { border: '1px solid #d7dde6', color: INK, background: '#fff' }}>
                  <Icon d={ICON.truck} size={18} /> {ts(locale, 'shop.delivery')}
                </button>
              </div>
              {method === 'pickup' && (
                <p className="mt-3 text-[12px]" style={{ color: MUTED }}>{ts(locale, 'shop.pickupAt')} {warehouseName}</p>
              )}
              {method === 'delivery' && (
                <div className="mt-3 flex flex-col gap-3">
                  <div>
                    <label className="mb-1 block text-[12px]" style={{ color: MUTED }}>{ts(locale, 'shop.address')} *</label>
                    <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
                  </div>
                  <div>
                    <label className="mb-1 block text-[12px]" style={{ color: MUTED }}>{ts(locale, 'shop.city')}</label>
                    <input value={city} onChange={(e) => setCity(e.target.value)} style={inputStyle} />
                  </div>
                </div>
              )}
            </section>

            <section className="mb-4 rounded-2xl bg-white p-4" style={{ border: '1px solid #eceef2' }}>
              <h2 className="mb-3 text-[14px] font-semibold" style={{ color: INK }}>{ts(locale, 'shop.orderSummary')}</h2>
              <div className="flex flex-col gap-2">
                {cart.items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between text-[13px]">
                    <span style={{ color: INK }}>{item.qty} × {item.name}</span>
                    <span style={{ color: NAVY, fontWeight: 500 }}>{price(item.priceCents * item.qty)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between border-t pt-3" style={{ borderColor: '#eceef2' }}>
                <span className="text-[14px]" style={{ color: MUTED }}>{ts(locale, 'shop.subtotal')}</span>
                <span className="text-[18px] font-semibold" style={{ color: NAVY }}>{price(cart.subtotalCents)}</span>
              </div>
            </section>

            {error && <p className="mb-3 text-[13px]" style={{ color: RED }}>{error}</p>}

            <button onClick={submit} disabled={submitting} className="w-full rounded-full px-6 py-3.5 text-[15px] font-semibold text-white transition active:scale-95 disabled:opacity-50" style={{ background: RED }}>
              {submitting ? ts(locale, 'shop.placing') : ts(locale, 'shop.placeOrder')}
            </button>
          </>
        )}
      </main>
    </div>
  )
}
