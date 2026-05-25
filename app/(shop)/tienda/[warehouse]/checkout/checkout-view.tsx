'use client'

import { useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { formatDOP } from '@/lib/format'
import { ts, type Locale } from '@/lib/i18n/shop'
import { useCart } from '@/lib/store/cart'
import type { StoreWarehouse } from '@/lib/store/catalog'
import type { DeliveryFees } from '@/lib/store-config-types'
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
  swap: 'M7 7h11l-3-3M17 17H6l3 3',
  truck: 'M3 7h11v10H3zM14 10h4l3 3v4h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  cash: 'M2 7h20v10H2zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  bank: 'M3 10l9-6 9 6M5 10v9h14v-9M9 19v-5h6v5',
  check: 'M5 12l4 4 10-10',
}

// New strings kept local (the shared dictionary is added to by migrations, not
// here) so this screen stays self-contained and bilingual.
const CT = {
  es: {
    fulfillTitle: 'Entrega',
    pickupHere: 'Recoger en esta tienda',
    pickupOther: 'Recoger en otra tienda',
    delivery: 'Envío a domicilio',
    chooseStore: 'Elige la tienda para recoger',
    regionLabel: 'Zona de envío',
    regionLocal: 'Local (Sosúa / Los Castillos)',
    regionNational: 'Nacional (resto del país)',
    free: 'Gratis',
    deliveryFee: 'Envío',
    payTitle: 'Forma de pago',
    payCash: 'Efectivo',
    payCashSub: 'Pagas al recibir / al recoger',
    payTransfer: 'Transferencia bancaria',
    payTransferSub: 'Transfiere y envíanos el comprobante',
    bankTitle: 'Datos para la transferencia',
    bankName: 'Banco',
    bankAccount: 'Cuenta',
    bankAccountName: 'A nombre de',
    bankAccountType: 'Tipo',
    chooseStoreError: 'Elige la tienda donde vas a recoger.',
    payment: 'Pago',
  },
  en: {
    fulfillTitle: 'Fulfillment',
    pickupHere: 'Pick up at this store',
    pickupOther: 'Pick up at another store',
    delivery: 'Home delivery',
    chooseStore: 'Choose the store to collect from',
    regionLabel: 'Delivery zone',
    regionLocal: 'Local (Sosúa / Los Castillos)',
    regionNational: 'National (rest of the country)',
    free: 'Free',
    deliveryFee: 'Delivery',
    payTitle: 'Payment method',
    payCash: 'Cash',
    payCashSub: 'Pay on delivery / on pickup',
    payTransfer: 'Bank transfer',
    payTransferSub: 'Transfer and send us the receipt',
    bankTitle: 'Bank transfer details',
    bankName: 'Bank',
    bankAccount: 'Account',
    bankAccountName: 'Account name',
    bankAccountType: 'Type',
    chooseStoreError: 'Choose the store where you will collect.',
    payment: 'Payment',
  },
} as const

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

type Method = 'pickup' | 'pickup_other' | 'delivery'
type Region = 'local' | 'national'
type Payment = 'cash' | 'transfer'

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

export function CheckoutView({
  warehouseId,
  warehouseSlug,
  warehouseName,
  stores,
  deliveryFees,
  bankInfo,
  initialName = '',
  initialPhone = '',
  initialEmail = '',
}: {
  warehouseId: string
  warehouseSlug: string
  warehouseName: string
  stores: StoreWarehouse[]
  deliveryFees: DeliveryFees
  bankInfo: { name: string; account: string; accountName: string; accountType: string }
  initialName?: string
  initialPhone?: string
  initialEmail?: string
}) {
  const [locale, setLocale] = useState<Locale>('es')
  const cart = useCart(warehouseSlug)
  const tx = CT[locale]

  const [name, setName] = useState(initialName)
  const [phone, setPhone] = useState(initialPhone)
  const [email, setEmail] = useState(initialEmail)
  const [method, setMethod] = useState<Method>('pickup')
  const [pickupStoreId, setPickupStoreId] = useState('')
  const [region, setRegion] = useState<Region>('local')
  const [regionTouched, setRegionTouched] = useState(false)
  const [payment, setPayment] = useState<Payment>('cash')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [invoice, setInvoice] = useState<string | null>(null)
  const [placedTotal, setPlacedTotal] = useState(0)
  const [placedShipping, setPlacedShipping] = useState(0)
  const [placedPayment, setPlacedPayment] = useState<Payment>('cash')

  const storeHref = `/tienda/${warehouseSlug}`
  const otherStores = stores.filter((s) => s.id !== warehouseId)

  // Live fee preview (the server recomputes the authoritative value).
  function previewFee(): number {
    if (method === 'delivery') {
      return region === 'national'
        ? deliveryFees.nationalDeliveryCents
        : deliveryFees.localDeliveryCents
    }
    if (method === 'pickup_other' && pickupStoreId) {
      const m = deliveryFees.warehousePickupFees.find(
        (f) => f.fromWarehouseId === warehouseId && f.toWarehouseId === pickupStoreId,
      )
      return m ? m.feeCents : 0
    }
    return 0
  }
  const fee = previewFee()
  const grandTotal = cart.subtotalCents + fee

  // Auto-detect Local vs National from the typed city, unless the customer has
  // manually changed the dropdown.
  const onCityChange = (v: string) => {
    setCity(v)
    if (regionTouched) return
    const nv = norm(v)
    if (!nv) return
    const isLocal = deliveryFees.localCities.some((c) => {
      const nc = norm(c)
      return nc.length > 0 && (nv === nc || nv.includes(nc) || nc.includes(nv))
    })
    setRegion(isLocal ? 'local' : 'national')
  }

  const fulfillLabel = (): string => {
    if (method === 'delivery') return `${tx.delivery} · ${address}`
    if (method === 'pickup_other') {
      const s = otherStores.find((o) => o.id === pickupStoreId)
      return `${tx.pickupOther} · ${s?.name ?? ''}`
    }
    return `${ts(locale, 'shop.pickup')} · ${warehouseName}`
  }

  const submit = async () => {
    setError('')
    if (!name.trim() || !phone.trim()) {
      setError(ts(locale, 'shop.required'))
      return
    }
    if (method === 'delivery' && !address.trim()) {
      setError(ts(locale, 'shop.required'))
      return
    }
    if (method === 'pickup_other' && !pickupStoreId) {
      setError(tx.chooseStoreError)
      return
    }
    setSubmitting(true)
    const res = await placeOnlineOrder({
      warehouseSlug,
      customer: { name: name.trim(), phone: phone.trim(), email: email.trim() || undefined },
      fulfillment: method === 'delivery' ? 'delivery' : 'pickup',
      pickupWarehouseId: method === 'pickup_other' ? pickupStoreId : undefined,
      deliveryRegion: method === 'delivery' ? region : undefined,
      paymentMethod: payment,
      shippingAddress: method === 'delivery' ? address.trim() || undefined : undefined,
      shippingCity: method === 'delivery' ? city.trim() || undefined : undefined,
      items: cart.items.map((i) => ({ product_id: i.id, qty: i.qty })),
    })
    setSubmitting(false)
    if (res.ok) {
      setInvoice(res.invoiceNumber)
      setPlacedTotal(res.totalCents)
      setPlacedShipping(res.shippingCents)
      setPlacedPayment(res.paymentMethod)
      cart.clear()
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
    } else {
      setError(ts(locale, 'shop.orderError'))
    }
  }

  const optionStyle = (active: boolean): CSSProperties =>
    active
      ? { border: `2px solid ${NAVY}`, color: NAVY, background: '#fff' }
      : { border: '1px solid #d7dde6', color: INK, background: '#fff' }

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
              <p><span style={{ color: MUTED }}>{ts(locale, 'shop.fulfillment')}:</span> {fulfillLabel()}</p>
              <p><span style={{ color: MUTED }}>{tx.payment}:</span> {placedPayment === 'transfer' ? tx.payTransfer : tx.payCash}</p>
              <p className="mt-1"><span style={{ color: MUTED }}>{tx.deliveryFee}:</span> {placedShipping > 0 ? price(placedShipping) : tx.free}</p>
              <p className="mt-1"><span style={{ color: MUTED }}>{ts(locale, 'shop.total')}:</span> <span style={{ color: NAVY, fontWeight: 600 }}>{price(placedTotal)}</span></p>
            </div>
            {placedPayment === 'transfer' && bankInfo.account && (
              <div className="mx-auto mt-3 max-w-sm rounded-xl p-3 text-left text-[13px]" style={{ background: '#fff', border: `1px solid ${NAVY}` }}>
                <p className="mb-1 font-semibold" style={{ color: NAVY }}>{tx.bankTitle}</p>
                {bankInfo.name && <p><span style={{ color: MUTED }}>{tx.bankName}:</span> {bankInfo.name}</p>}
                {bankInfo.account && <p><span style={{ color: MUTED }}>{tx.bankAccount}:</span> {bankInfo.account}</p>}
                {bankInfo.accountName && <p><span style={{ color: MUTED }}>{tx.bankAccountName}:</span> {bankInfo.accountName}</p>}
                {bankInfo.accountType && <p><span style={{ color: MUTED }}>{tx.bankAccountType}:</span> {bankInfo.accountType}</p>}
              </div>
            )}
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
              <h2 className="mb-3 text-[14px] font-semibold" style={{ color: INK }}>{tx.fulfillTitle}</h2>
              <div className="flex flex-col gap-2">
                <button onClick={() => setMethod('pickup')} className="flex items-center gap-2 rounded-xl px-3 py-3 text-left text-[13px] transition" style={optionStyle(method === 'pickup')}>
                  <Icon d={ICON.store} size={18} /> <span className="flex-1">{tx.pickupHere}</span>
                  <span style={{ color: MUTED }}>{tx.free}</span>
                </button>
                {otherStores.length > 0 && (
                  <button onClick={() => setMethod('pickup_other')} className="flex items-center gap-2 rounded-xl px-3 py-3 text-left text-[13px] transition" style={optionStyle(method === 'pickup_other')}>
                    <Icon d={ICON.swap} size={18} /> <span className="flex-1">{tx.pickupOther}</span>
                  </button>
                )}
                <button onClick={() => setMethod('delivery')} className="flex items-center gap-2 rounded-xl px-3 py-3 text-left text-[13px] transition" style={optionStyle(method === 'delivery')}>
                  <Icon d={ICON.truck} size={18} /> <span className="flex-1">{tx.delivery}</span>
                </button>
              </div>

              {method === 'pickup' && (
                <p className="mt-3 text-[12px]" style={{ color: MUTED }}>{ts(locale, 'shop.pickupAt')} {warehouseName}</p>
              )}

              {method === 'pickup_other' && (
                <div className="mt-3">
                  <label className="mb-1 block text-[12px]" style={{ color: MUTED }}>{tx.chooseStore} *</label>
                  <select value={pickupStoreId} onChange={(e) => setPickupStoreId(e.target.value)} style={inputStyle}>
                    <option value="">—</option>
                    {otherStores.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {method === 'delivery' && (
                <div className="mt-3 flex flex-col gap-3">
                  <div>
                    <label className="mb-1 block text-[12px]" style={{ color: MUTED }}>{ts(locale, 'shop.address')} *</label>
                    <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
                  </div>
                  <div>
                    <label className="mb-1 block text-[12px]" style={{ color: MUTED }}>{ts(locale, 'shop.city')}</label>
                    <input value={city} onChange={(e) => onCityChange(e.target.value)} style={inputStyle} />
                  </div>
                  <div>
                    <label className="mb-1 block text-[12px]" style={{ color: MUTED }}>{tx.regionLabel}</label>
                    <select
                      value={region}
                      onChange={(e) => { setRegion(e.target.value as Region); setRegionTouched(true) }}
                      style={inputStyle}
                    >
                      <option value="local">{tx.regionLocal} · {price(deliveryFees.localDeliveryCents)}</option>
                      <option value="national">{tx.regionNational} · {price(deliveryFees.nationalDeliveryCents)}</option>
                    </select>
                  </div>
                </div>
              )}
            </section>

            <section className="mb-4 rounded-2xl bg-white p-4" style={{ border: '1px solid #eceef2' }}>
              <h2 className="mb-3 text-[14px] font-semibold" style={{ color: INK }}>{tx.payTitle}</h2>
              <div className="flex flex-col gap-2">
                <button onClick={() => setPayment('cash')} className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-[13px] transition" style={optionStyle(payment === 'cash')}>
                  <Icon d={ICON.cash} size={18} />
                  <span className="flex-1">
                    <span className="block font-medium">{tx.payCash}</span>
                    <span className="block text-[11px]" style={{ color: MUTED }}>{tx.payCashSub}</span>
                  </span>
                </button>
                <button onClick={() => setPayment('transfer')} className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-[13px] transition" style={optionStyle(payment === 'transfer')}>
                  <Icon d={ICON.bank} size={18} />
                  <span className="flex-1">
                    <span className="block font-medium">{tx.payTransfer}</span>
                    <span className="block text-[11px]" style={{ color: MUTED }}>{tx.payTransferSub}</span>
                  </span>
                </button>
              </div>
              {payment === 'transfer' && bankInfo.account && (
                <div className="mt-3 rounded-xl p-3 text-[13px]" style={{ background: '#f7f8fa' }}>
                  <p className="mb-1 font-semibold" style={{ color: NAVY }}>{tx.bankTitle}</p>
                  {bankInfo.name && <p><span style={{ color: MUTED }}>{tx.bankName}:</span> {bankInfo.name}</p>}
                  {bankInfo.account && <p><span style={{ color: MUTED }}>{tx.bankAccount}:</span> {bankInfo.account}</p>}
                  {bankInfo.accountName && <p><span style={{ color: MUTED }}>{tx.bankAccountName}:</span> {bankInfo.accountName}</p>}
                  {bankInfo.accountType && <p><span style={{ color: MUTED }}>{tx.bankAccountType}:</span> {bankInfo.accountType}</p>}
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
              <div className="mt-3 flex items-center justify-between border-t pt-3 text-[13px]" style={{ borderColor: '#eceef2' }}>
                <span style={{ color: MUTED }}>{ts(locale, 'shop.subtotal')}</span>
                <span style={{ color: INK }}>{price(cart.subtotalCents)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[13px]">
                <span style={{ color: MUTED }}>{tx.deliveryFee}</span>
                <span style={{ color: INK }}>{fee > 0 ? price(fee) : tx.free}</span>
              </div>
              <div className="mt-2 flex items-center justify-between border-t pt-2" style={{ borderColor: '#eceef2' }}>
                <span className="text-[14px]" style={{ color: MUTED }}>{ts(locale, 'shop.total')}</span>
                <span className="text-[18px] font-semibold" style={{ color: NAVY }}>{price(grandTotal)}</span>
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
