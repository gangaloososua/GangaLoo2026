'use client'

import { useState, useEffect, useRef, type CSSProperties } from 'react'
import Link from 'next/link'
import { formatDOP } from '@/lib/format'
import { ts, type Locale } from '@/lib/i18n/shop'
import { useCart } from '@/lib/store/cart'
import type { StoreWarehouse } from '@/lib/store/catalog'
import type { DeliveryFees } from '@/lib/store-config-types'
import { placeOnlineOrder, getOrderQuote, startStripeCheckout, startPaypalCheckout } from './actions'

const NAVY = '#0A2A66'
const RED = '#CE1126'
const INK = '#16181d'
const MUTED = '#6b7280'

// Delivery runs every day inside this single window. Edit to change hours.
const DELIVERY_WINDOW = { start: '14:00', end: '17:00' }
// Map starting center before the customer pins (Sosúa / Puerto Plata).
const MAP_DEFAULT = { lat: 19.7536, lng: -70.5169 }

// Build 30-min slots across DELIVERY_WINDOW, each with a 24h value ("14:30")
// and a 12h AM/PM label ("2:30 PM") for display.
function deliverySlots(): { value: string; label: string }[] {
  const [sh, sm] = DELIVERY_WINDOW.start.split(':').map(Number)
  const [eh, em] = DELIVERY_WINDOW.end.split(':').map(Number)
  const out: { value: string; label: string }[] = []
  for (let t = sh * 60 + sm; t <= eh * 60 + em; t += 30) {
    const h = Math.floor(t / 60)
    const m = t % 60
    const value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    const ampm = h >= 12 ? 'PM' : 'AM'
    const h12 = h % 12 === 0 ? 12 : h % 12
    out.push({ value, label: `${h12}:${String(m).padStart(2, '0')} ${ampm}` })
  }
  return out
}

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
  pin: 'M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  calendar: 'M4 5h16v16H4zM4 9h16M8 3v4M16 3v4',
  clock: 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18',
  locate: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v3M12 19v3M2 12h3M19 12h3',
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
    mapTitle: 'Ubicación en el mapa',
    useMyLocation: 'Usar mi ubicación actual',
    pinHint: 'Toca el mapa o arrastra el pin para marcar tu ubicación.',
    dateLabel: 'Fecha de entrega',
    timeLabel: 'Hora de entrega',
    windowHint: 'Entregas todos los días de 2:00 a 5:00 PM.',
    pinRequired: 'Marca tu ubicación en el mapa.',
    dateRequired: 'Elige la fecha de entrega.',
    timeRequired: 'Elige la hora de entrega.',
    timeOutOfWindow: 'La hora debe estar entre 2:00 y 5:00 PM.',
    payment: 'Pago',
    memberDiscount: 'Descuento socio',
    surcharge: 'Recargo',
    payCard: 'Tarjeta (Stripe)',
    payCardSub: 'Pago con tarjeta en línea',
    payPaypalSub: 'Paga con tu cuenta PayPal',
    payOnlineSoon: 'Pago en línea (en pruebas)',
    couponLabel: 'Cupón (opcional)',
    couponPlaceholder: 'Código',
    coupon: 'Cupón',
    couponNotApplied: 'Cupón no aplicado',
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
    mapTitle: 'Location on map',
    useMyLocation: 'Use my current location',
    pinHint: 'Tap the map or drag the pin to mark your location.',
    dateLabel: 'Delivery date',
    timeLabel: 'Delivery time',
    windowHint: 'Delivery every day from 2:00 to 5:00 PM.',
    pinRequired: 'Mark your location on the map.',
    dateRequired: 'Choose the delivery date.',
    timeRequired: 'Choose the delivery time.',
    timeOutOfWindow: 'Time must be between 2:00 and 5:00 PM.',
    payment: 'Payment',
    memberDiscount: 'Member discount',
    surcharge: 'Surcharge',
    payCard: 'Card (Stripe)',
    payCardSub: 'Pay by card online',
    payPaypalSub: 'Pay with your PayPal account',
    payOnlineSoon: 'Online payment (testing)',
    couponLabel: 'Coupon (optional)',
    couponPlaceholder: 'Code',
    coupon: 'Coupon',
    couponNotApplied: 'Coupon not applied',
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
type Payment = 'cash' | 'transfer' | 'stripe' | 'paypal'

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

// Loads Leaflet from the CDN once (client-only) — no npm dependency. Shows a
// draggable pin and reports the chosen lat/lng up to the form.
let leafletLoading: Promise<unknown> | null = null
function loadLeaflet(): Promise<unknown> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'))
  const w = window as unknown as { L?: unknown }
  if (w.L) return Promise.resolve(w.L)
  if (leafletLoading) return leafletLoading
  leafletLoading = new Promise((resolve, reject) => {
    if (!document.querySelector('link[data-leaflet]')) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      link.setAttribute('data-leaflet', '1')
      document.head.appendChild(link)
    }
    const script = document.createElement('script')
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    script.async = true
    script.onload = () => resolve((window as unknown as { L: unknown }).L)
    script.onerror = () => reject(new Error('leaflet load failed'))
    document.body.appendChild(script)
  })
  return leafletLoading
}

function DeliveryMap({
  lat,
  lng,
  onChange,
  hint,
  locateLabel,
}: {
  lat: number | null
  lng: number | null
  onChange: (lat: number, lng: number) => void
  hint: string
  locateLabel: string
}) {
  const mapRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapObj = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markerObj = useRef<any>(null)
  const [locating, setLocating] = useState(false)
  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange }, [onChange])

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    loadLeaflet().then((L: any) => {
      if (cancelled || !mapRef.current || mapObj.current) return
      L.Marker.prototype.options.icon = L.icon({
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
      })
      const start: [number, number] = lat != null && lng != null ? [lat, lng] : [MAP_DEFAULT.lat, MAP_DEFAULT.lng]
      const map = L.map(mapRef.current).setView(start, 14)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap', maxZoom: 19 }).addTo(map)
      const marker = L.marker(start, { draggable: true }).addTo(map)
      marker.on('dragend', () => { const p = marker.getLatLng(); onChangeRef.current(p.lat, p.lng) })
      map.on('click', (e: { latlng: { lat: number; lng: number } }) => { marker.setLatLng(e.latlng); onChangeRef.current(e.latlng.lat, e.latlng.lng) })
      mapObj.current = map
      markerObj.current = marker
      setTimeout(() => map.invalidateSize(), 100)
    })
    return () => {
      cancelled = true
      if (mapObj.current) { mapObj.current.remove(); mapObj.current = null; markerObj.current = null }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (mapObj.current && markerObj.current && lat != null && lng != null) {
      markerObj.current.setLatLng([lat, lng])
      mapObj.current.setView([lat, lng], 15)
    }
  }, [lat, lng])

  const useMyLocation = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLocating(false); onChangeRef.current(pos.coords.latitude, pos.coords.longitude) },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  return (
    <div>
      <button type="button" onClick={useMyLocation} disabled={locating} className="mb-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] disabled:opacity-50" style={{ border: `1px solid ${NAVY}`, color: NAVY, background: '#fff' }}>
        <Icon d={ICON.locate} size={14} /> {locating ? '…' : locateLabel}
      </button>
      <div ref={mapRef} style={{ height: 240, width: '100%', borderRadius: 12, overflow: 'hidden', border: '1px solid #d7dde6' }} />
      <p className="mt-1.5 text-[11px]" style={{ color: MUTED }}>{hint}</p>
    </div>
  )
}

export function CheckoutView({
  warehouseId,
  warehouseSlug,
  warehouseName,
  stores,
  deliveryFees,
  bankInfo,
  paymentConfig,
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
  paymentConfig: {
    enabled: boolean
    stripePct: number
    stripeFixed: number
    paypalPct: number
    paypalFixed: number
    paypalName: string
  }
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
  const [deliveryLat, setDeliveryLat] = useState<number | null>(null)
  const [deliveryLng, setDeliveryLng] = useState<number | null>(null)
  const [deliveryDate, setDeliveryDate] = useState('')
  const [deliveryTime, setDeliveryTime] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [invoice, setInvoice] = useState<string | null>(null)
  const [placedTotal, setPlacedTotal] = useState(0)
  const [placedShipping, setPlacedShipping] = useState(0)
  const [placedPayment, setPlacedPayment] = useState<Payment>('cash')
  const [memberDiscountCents, setMemberDiscountCents] = useState(0)
  const [tierName, setTierName] = useState('')
  const [isClubMember, setIsClubMember] = useState(false)
  const [placedMemberDiscount, setPlacedMemberDiscount] = useState(0)
  const [placedSubtotalBefore, setPlacedSubtotalBefore] = useState(0)
  const [placedTierName, setPlacedTierName] = useState('')
  const [placedSurcharge, setPlacedSurcharge] = useState(0)
  const [placedAmountDue, setPlacedAmountDue] = useState(0)
  const [placedItems, setPlacedItems] = useState<{ name: string; qty: number; priceCents: number }[]>([])
  const [placedMethod, setPlacedMethod] = useState<Method>('pickup')
  const [placedPickupId, setPlacedPickupId] = useState('')
  // Round 42: coupon code (applied server-side at order placement).
  const [couponCode, setCouponCode] = useState('')
  const [placedCouponDiscount, setPlacedCouponDiscount] = useState(0)
  const [placedCouponCode, setPlacedCouponCode] = useState<string | null>(null)
  const [placedCouponApplied, setPlacedCouponApplied] = useState(false)

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
  // Club members get free shipping (server zeroes it on the charge too).
  const fee = isClubMember ? 0 : previewFee()
  // Card surcharge (Stripe/PayPal), previewed from config; server is authoritative.
  const surchargeRate =
    payment === 'stripe'
      ? { pct: paymentConfig.stripePct, fixed: paymentConfig.stripeFixed }
      : payment === 'paypal'
        ? { pct: paymentConfig.paypalPct, fixed: paymentConfig.paypalFixed }
        : { pct: 0, fixed: 0 }
  const baseForSurcharge = cart.subtotalCents - memberDiscountCents + fee
  const surcharge =
    surchargeRate.pct > 0 || surchargeRate.fixed > 0
      ? Math.round((baseForSurcharge * surchargeRate.pct) / 100) + Math.round(surchargeRate.fixed * 100)
      : 0
  const grandTotal = baseForSurcharge + surcharge

  // Fetch an accurate member-discount preview from the server (tier is
  // resolved from the logged-in session; guests get none). Item pricing
  // doesn't depend on fulfillment/payment, so this only needs to run once.
  useEffect(() => {
    let active = true
    if (cart.items.length === 0) return
    getOrderQuote({
      warehouseSlug,
      items: cart.items.map((i) => ({ product_id: i.id, qty: i.qty })),
    }).then((q) => {
      if (!active) return
      if (q.ok) {
        setMemberDiscountCents(q.memberDiscountCents)
        setTierName(q.tierName)
        setIsClubMember(q.isClubMember)
      }
    })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouseSlug])

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
    if (method === 'delivery') {
      if (deliveryLat == null || deliveryLng == null) { setError(tx.pinRequired); return }
      if (!deliveryDate) { setError(tx.dateRequired); return }
      if (!deliveryTime) { setError(tx.timeRequired); return }
      if (deliveryTime < DELIVERY_WINDOW.start || deliveryTime > DELIVERY_WINDOW.end) { setError(tx.timeOutOfWindow); return }
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
      deliveryLat: method === 'delivery' && deliveryLat != null ? deliveryLat : undefined,
      deliveryLng: method === 'delivery' && deliveryLng != null ? deliveryLng : undefined,
      deliveryAt: method === 'delivery' && deliveryDate && deliveryTime ? new Date(`${deliveryDate}T${deliveryTime}`).toISOString() : undefined,
      items: cart.items.map((i) => ({ product_id: i.id, qty: i.qty })),
      couponCode: couponCode.trim() || undefined,
    })
    setSubmitting(false)
    if (res.ok) {
      // Stripe: hand off to the hosted Stripe checkout page to actually pay.
      // (The order is marked paid later by the Stripe webhook, not here.)
      if (payment === 'stripe') {
        setSubmitting(true)
        const pay = await startStripeCheckout({
          saleId: res.saleId,
          warehouseSlug,
          origin: typeof window !== 'undefined' ? window.location.origin : '',
        })
        if (pay.ok) {
          cart.clear()
          window.location.href = pay.url
          return
        }
        setSubmitting(false)
        setError(ts(locale, 'shop.orderError'))
        return
      }

      // PayPal: hand off to PayPal's approval page (charged in US$, converted
      // from the peso total at your current rate). The order is marked paid by
      // the return handler after PayPal confirms, not here.
      if (payment === 'paypal') {
        setSubmitting(true)
        const pay = await startPaypalCheckout({
          saleId: res.saleId,
          warehouseSlug,
          origin: typeof window !== 'undefined' ? window.location.origin : '',
        })
        if (pay.ok) {
          cart.clear()
          window.location.href = pay.url
          return
        }
        setSubmitting(false)
        setError(ts(locale, 'shop.orderError'))
        return
      }

      setInvoice(res.invoiceNumber)
      setPlacedTotal(res.totalCents)
      setPlacedShipping(res.shippingCents)
      setPlacedPayment(res.paymentMethod)
      setPlacedMemberDiscount(res.memberDiscountCents)
      setPlacedSubtotalBefore(res.subtotalBeforeCents)
      setPlacedTierName(res.tierName)
      setPlacedSurcharge(res.paymentFeeCents)
      setPlacedAmountDue(res.amountDueCents)
      setPlacedItems(cart.items.map((i) => ({ name: i.name, qty: i.qty, priceCents: i.priceCents })))
      setPlacedMethod(method)
      setPlacedPickupId(pickupStoreId)
      setPlacedCouponDiscount(res.couponDiscountCents)
      setPlacedCouponCode(res.couponCode)
      setPlacedCouponApplied(res.couponApplied)
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
              <p><span style={{ color: MUTED }}>{tx.payment}:</span> {placedPayment === 'transfer' ? tx.payTransfer : placedPayment === 'stripe' ? tx.payCard : placedPayment === 'paypal' ? (paymentConfig.paypalName || 'PayPal') : tx.payCash}</p>
              {placedSurcharge > 0 && (
                <p><span style={{ color: MUTED }}>{tx.surcharge}:</span> {price(placedSurcharge)}</p>
              )}
              {placedMemberDiscount > 0 && (
                <p><span style={{ color: MUTED }}>{tx.memberDiscount}{placedTierName ? ` (${placedTierName})` : ''}:</span> <span style={{ color: '#1d9e75' }}>-{price(placedMemberDiscount)}</span></p>
              )}
              {placedCouponApplied && placedCouponDiscount > 0 && (
                <p><span style={{ color: MUTED }}>{tx.coupon}{placedCouponCode ? ` (${placedCouponCode})` : ''}:</span> <span style={{ color: '#1d9e75' }}>-{price(placedCouponDiscount)}</span></p>
              )}
              {!placedCouponApplied && placedCouponCode && (
                <p><span style={{ color: MUTED }}>{tx.coupon}{` (${placedCouponCode})`}:</span> <span style={{ color: '#b91c1c' }}>{tx.couponNotApplied}</span></p>
              )}
              <p className="mt-1"><span style={{ color: MUTED }}>{tx.deliveryFee}:</span> {placedShipping > 0 ? price(placedShipping) : tx.free}</p>
              <p className="mt-1"><span style={{ color: MUTED }}>{ts(locale, 'shop.total')}:</span> <span style={{ color: NAVY, fontWeight: 600 }}>{price(placedSurcharge > 0 ? placedAmountDue : placedTotal)}</span></p>
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
            {(() => {
              const pickupStore =
                placedMethod === 'pickup_other'
                  ? stores.find((s) => s.id === placedPickupId)
                  : stores.find((s) => s.id === warehouseId)
              if (placedMethod === 'delivery') {
                return (
                  <div className="mx-auto mt-3 max-w-sm rounded-xl p-3 text-left text-[13px]" style={{ background: '#fff', border: `1px solid ${NAVY}` }}>
                    <p className="mb-1 font-semibold" style={{ color: NAVY }}>{locale === 'en' ? 'Delivery' : 'Entrega a domicilio'}</p>
                    <p style={{ color: MUTED }}>{locale === 'en' ? 'We will deliver to the address you provided. We will contact you to coordinate.' : 'Te llevaremos a la direccion indicada. Te contactaremos para coordinar.'}</p>
                  </div>
                )
              }
              if (!pickupStore) return null
              const mapHref =
                pickupStore.mapsUrl ||
                (pickupStore.address ? `https://maps.google.com/?q=${encodeURIComponent(pickupStore.address)}` : '')
              return (
                <div className="mx-auto mt-3 max-w-sm rounded-xl p-3 text-left text-[13px]" style={{ background: '#fff', border: `1px solid ${NAVY}` }}>
                  <p className="mb-1 font-semibold" style={{ color: NAVY }}>{locale === 'en' ? 'Where to pick up' : 'Donde recoger'}</p>
                  <p style={{ color: INK }}>{pickupStore.name}</p>
                  {pickupStore.address && <p style={{ color: MUTED }}>{pickupStore.address}</p>}
                  {pickupStore.phone && <p><span style={{ color: MUTED }}>{locale === 'en' ? 'Phone' : 'Telefono'}:</span> {pickupStore.phone}</p>}
                  {mapHref && (
                    <a href={mapHref} target="_blank" rel="noopener noreferrer" style={{ color: NAVY, fontWeight: 600 }}>
                      {locale === 'en' ? 'View on map' : 'Ver en mapa'}
                    </a>
                  )}
                </div>
              )
            })()}
            {(() => {
              const waStore =
                placedMethod === 'pickup_other'
                  ? stores.find((s) => s.id === placedPickupId)
                  : stores.find((s) => s.id === warehouseId)
              const waNum = (waStore?.whatsapp || '').replace(/[^0-9]/g, '')
              if (!waNum) return null
              const payLabel =
                placedPayment === 'transfer' ? 'Transferencia'
                : placedPayment === 'stripe' ? 'Tarjeta'
                : placedPayment === 'paypal' ? 'PayPal'
                : 'Efectivo'
              const itemLines = placedItems
                .map((i) => `   ${i.qty}x ${i.name} (${price(i.priceCents * i.qty)})`)
                .join('\n')
              const lines = [
                '🛒 *Nuevo Pedido GangaLoo*',
                `👤 ${name}  📞 ${phone}`,
                `📍 Tienda: ${waStore?.name ?? ''}`,
                `🔑 ${invoice}`,
                '━━━━━━━━━━━━',
                '📦 *Productos:*',
                itemLines,
                `💰 *Total: ${price(placedSurcharge > 0 ? placedAmountDue : placedTotal)}*`,
                '━━━━━━━━━━━━',
                `🚚 ${fulfillLabel()}`,
                `💳 Pago: ${payLabel}`,
              ]
              const waText = encodeURIComponent(lines.join('\n'))
              return (
                <a
                  href={`https://wa.me/${waNum}?text=${waText}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 flex items-center justify-center gap-2 rounded-full px-6 py-3 text-[14px] font-semibold text-white"
                  style={{ background: '#25D366' }}
                >
                  {locale === 'en' ? 'Send my order via WhatsApp' : 'Enviar mi pedido por WhatsApp'}
                </a>
              )
            })()}
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

                  <div>
                    <label className="mb-1 block text-[12px]" style={{ color: MUTED }}>{tx.mapTitle} *</label>
                    <DeliveryMap
                      lat={deliveryLat}
                      lng={deliveryLng}
                      onChange={(la, ln) => { setDeliveryLat(la); setDeliveryLng(ln) }}
                      hint={tx.pinHint}
                      locateLabel={tx.useMyLocation}
                    />
                  </div>

                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="mb-1 block text-[12px]" style={{ color: MUTED }}>{tx.dateLabel} *</label>
                      <input type="date" value={deliveryDate} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDeliveryDate(e.target.value)} style={inputStyle} />
                    </div>
                    <div className="flex-1">
                      <label className="mb-1 block text-[12px]" style={{ color: MUTED }}>{tx.timeLabel} *</label>
                      <select value={deliveryTime} onChange={(e) => setDeliveryTime(e.target.value)} style={inputStyle}>
                        <option value="">—</option>
                        {deliverySlots().map((s) => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <p className="text-[11px]" style={{ color: MUTED }}>{tx.windowHint}</p>
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
                {paymentConfig.enabled && paymentConfig.stripePct >= 0 && (
                  <button onClick={() => setPayment('stripe')} className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-[13px] transition" style={optionStyle(payment === 'stripe')}>
                    <Icon d={ICON.cash} size={18} />
                    <span className="flex-1">
                      <span className="block font-medium">{tx.payCard}{paymentConfig.stripePct > 0 ? ` (+${paymentConfig.stripePct}%)` : ''}</span>
                      <span className="block text-[11px]" style={{ color: MUTED }}>{tx.payCardSub}</span>
                    </span>
                  </button>
                )}
                {paymentConfig.enabled && (
                  <button onClick={() => setPayment('paypal')} className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-[13px] transition" style={optionStyle(payment === 'paypal')}>
                    <Icon d={ICON.bank} size={18} />
                    <span className="flex-1">
                      <span className="block font-medium">{paymentConfig.paypalName || 'PayPal'}{paymentConfig.paypalPct > 0 ? ` (+${paymentConfig.paypalPct}%)` : ''}</span>
                      <span className="block text-[11px]" style={{ color: MUTED }}>{tx.payPaypalSub}</span>
                    </span>
                  </button>
                )}
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
              <label className="mb-2 block text-[14px] font-semibold" style={{ color: INK }}>{tx.couponLabel}</label>
              <input
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                placeholder={tx.couponPlaceholder}
                className="w-full rounded-xl px-3 py-2 text-[14px] uppercase"
                style={inputStyle}
              />
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
              {memberDiscountCents > 0 && (
                <div className="mt-1 flex items-center justify-between text-[13px]">
                  <span style={{ color: MUTED }}>{tx.memberDiscount}{tierName ? ` (${tierName})` : ''}</span>
                  <span style={{ color: '#1d9e75' }}>-{price(memberDiscountCents)}</span>
                </div>
              )}
              <div className="mt-1 flex items-center justify-between text-[13px]">
                <span style={{ color: MUTED }}>{tx.deliveryFee}</span>
                <span style={{ color: INK }}>{fee > 0 ? price(fee) : tx.free}</span>
              </div>
              {surcharge > 0 && (
                <div className="mt-1 flex items-center justify-between text-[13px]">
                  <span style={{ color: MUTED }}>{tx.surcharge}{surchargeRate.pct > 0 ? ` (${surchargeRate.pct}%)` : ''}</span>
                  <span style={{ color: INK }}>{price(surcharge)}</span>
                </div>
              )}
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
