'use client'

// app/encargo/[id]/encargo-client.tsx
// Customer-facing interactive page. Mobile-first. Shows the invoice, lets the
// customer choose pickup (free) or delivery (+fee, with a map pin + date +
// address), and submits through the guarded public RPC via ./actions.

import { useEffect, useRef, useState } from 'react'
import { formatDOP, formatDate } from '@/lib/format'
import { submitResponse, type PublicOrder } from './actions'

const NAVY = '#0f1e3d'
const GOLD = '#c9a227'

// Default map center: Sosúa, Puerto Plata
const DEFAULT_CENTER: [number, number] = [19.751, -70.5249]

const PLATFORM_LABEL: Record<string, string> = {
  amazon: 'Amazon',
  temu: 'Temu',
  shein: 'Shein',
  aliexpress: 'AliExpress',
  other: 'la tienda',
}

function todayISO(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

// Load Leaflet from CDN once.
function useLeaflet(active: boolean): boolean {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!active) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).L) {
      setReady(true)
      return
    }
    const cssId = 'leaflet-css'
    if (!document.getElementById(cssId)) {
      const css = document.createElement('link')
      css.id = cssId
      css.rel = 'stylesheet'
      css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      document.head.appendChild(css)
    }
    const scriptId = 'leaflet-js'
    const existing = document.getElementById(scriptId) as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener('load', () => setReady(true))
      return
    }
    const s = document.createElement('script')
    s.id = scriptId
    s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    s.async = true
    s.onload = () => setReady(true)
    document.body.appendChild(s)
  }, [active])
  return ready
}

export function EncargoClient({ order }: { order: PublicOrder }) {
  const responded = order.fulfilment != null || ['responded', 'ready', 'completed'].includes(order.stage)
  const open = order.stage === 'arrived' || order.stage === 'notified'

  const [done, setDone] = useState<PublicOrder | null>(null)
  const view = done || order
  const showConfirmation = done != null || responded

  return (
    <main className="min-h-screen bg-neutral-100 pb-16">
      {/* brand header */}
      <header className="px-5 py-6 text-center" style={{ background: NAVY }}>
        <div className="text-2xl font-bold tracking-wide" style={{ color: GOLD }}>
          GangaLoo
        </div>
        <div className="mt-0.5 text-xs uppercase tracking-[0.2em] text-white/70">Tu encargo</div>
      </header>

      <div className="mx-auto -mt-4 w-full max-w-md px-4">
        {showConfirmation ? (
          <Confirmation order={view} />
        ) : open ? (
          <ChooseForm order={order} onDone={(o) => setDone(o)} />
        ) : (
          <NotReady order={order} />
        )}
      </div>

      <footer className="mt-10 text-center text-xs text-neutral-400">
        GangaLoo · Sosúa, Puerto Plata
      </footer>
    </main>
  )
}

/* ─────────── invoice card (shared) ─────────── */
function InvoiceCard({ order, includeDelivery }: { order: PublicOrder; includeDelivery: boolean }) {
  const t = order.totals
  const deliveryCharge = includeDelivery ? order.delivery_fee_cents : 0
  const total = t.subtotal_cents + t.source_shipping_cents + t.gangaloo_fee_cents + t.financing_cents + deliveryCharge
  const balance = Math.max(0, total - t.paid_cents)

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Factura</span>
        <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-600">
          {PLATFORM_LABEL[order.platform] || order.platform}
          {order.source_ref ? ` · ${order.source_ref}` : ''}
        </span>
      </div>

      <div className="mt-3 space-y-1.5">
        {order.items && order.items.length ? (
          order.items.map((it, i) => (
            <Line key={i} label={`${it.qty}× ${it.name}`} value={formatDOP(it.qty * it.price_cents)} />
          ))
        ) : order.description ? (
          <Line label={order.description} value={formatDOP(t.subtotal_cents)} />
        ) : null}
      </div>

      <div className="mt-3 space-y-1.5 border-t border-neutral-100 pt-3">
        <Line label="Subtotal" value={formatDOP(t.subtotal_cents)} subtle />
        {t.source_shipping_cents > 0 ? (
          <Line label="Envío de origen" value={formatDOP(t.source_shipping_cents)} subtle />
        ) : null}
        {t.gangaloo_fee_cents > 0 ? (
          <Line label="Gestión GangaLoo" value={formatDOP(t.gangaloo_fee_cents)} subtle />
        ) : null}
        {t.financing_cents > 0 ? (
          <Line label="Financiamiento" value={formatDOP(t.financing_cents)} subtle />
        ) : null}
        {includeDelivery && deliveryCharge > 0 ? (
          <Line label="Entrega a domicilio" value={formatDOP(deliveryCharge)} subtle />
        ) : null}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-neutral-100 pt-3">
        <span className="font-semibold text-neutral-900">Total</span>
        <span className="font-bold text-neutral-900">{formatDOP(total)}</span>
      </div>
      {t.paid_cents > 0 ? (
        <div className="mt-1 flex items-center justify-between text-sm">
          <span className="text-emerald-600">Ya abonado</span>
          <span className="font-medium text-emerald-600">{formatDOP(t.paid_cents)}</span>
        </div>
      ) : null}
      <div className="mt-1 flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-500">Por pagar</span>
        <span className="text-lg font-bold" style={{ color: GOLD }}>
          {formatDOP(balance)}
        </span>
      </div>
    </div>
  )
}

function Line({ label, value, subtle }: { label: string; value: string; subtle?: boolean }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className={subtle ? 'text-neutral-500' : 'text-neutral-700'}>{label}</span>
      <span className={subtle ? 'text-neutral-500' : 'text-neutral-800'}>{value}</span>
    </div>
  )
}

/* ─────────── state: not ready yet ─────────── */
function NotReady({ order }: { order: PublicOrder }) {
  const msg =
    order.stage === 'ordered'
      ? 'Tu pedido ya fue realizado. Te avisaremos por WhatsApp en cuanto llegue para coordinar la entrega. 📦'
      : 'Coordina el depósito inicial con GangaLoo por WhatsApp para empezar a procesar tu pedido. 🙏'
  return (
    <div className="space-y-4">
      <InvoiceCard order={order} includeDelivery={false} />
      <div className="rounded-2xl bg-white p-5 text-center text-sm text-neutral-600 shadow-sm">{msg}</div>
    </div>
  )
}

/* ─────────── state: choose pickup / delivery ─────────── */
function ChooseForm({ order, onDone }: { order: PublicOrder; onDone: (o: PublicOrder) => void }) {
  const [mode, setMode] = useState<'pickup' | 'delivery' | null>(null)
  const [date, setDate] = useState('')
  const [address, setAddress] = useState('')
  const [note, setNote] = useState('')
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const leafletReady = useLeaflet(mode === 'delivery')
  const mapBoxRef = useRef<HTMLDivElement | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markerRef = useRef<any>(null)

  // init / teardown the map when delivery is selected
  useEffect(() => {
    if (mode !== 'delivery' || !leafletReady || !mapBoxRef.current) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const L = (window as any).L
    if (mapRef.current) return

    const map = L.map(mapBoxRef.current).setView(DEFAULT_CENTER, 13)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(map)

    function place(lat: number, lng: number) {
      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lng])
      } else {
        markerRef.current = L.circleMarker([lat, lng], {
          radius: 9,
          color: GOLD,
          fillColor: GOLD,
          fillOpacity: 0.9,
          weight: 3,
        }).addTo(map)
      }
      setCoords({ lat, lng })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    map.on('click', (e: any) => place(e.latlng.lat, e.latlng.lng))
    mapRef.current = map
    // give the container a tick to size correctly
    setTimeout(() => map.invalidateSize(), 200)

    return () => {
      map.remove()
      mapRef.current = null
      markerRef.current = null
    }
  }, [mode, leafletReady])

  function useMyLocation() {
    if (!navigator.geolocation) {
      setErr('Tu navegador no permite ubicación. Marca el punto en el mapa.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords
        setCoords({ lat: latitude, lng: longitude })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const L = (window as any).L
        const map = mapRef.current
        if (map && L) {
          map.setView([latitude, longitude], 16)
          if (markerRef.current) markerRef.current.setLatLng([latitude, longitude])
          else
            markerRef.current = L.circleMarker([latitude, longitude], {
              radius: 9,
              color: GOLD,
              fillColor: GOLD,
              fillOpacity: 0.9,
              weight: 3,
            }).addTo(map)
        }
      },
      () => setErr('No pudimos obtener tu ubicación. Marca el punto en el mapa.'),
    )
  }

  async function submit() {
    setErr(null)
    if (!mode) {
      setErr('Elige cómo quieres recibir tu pedido.')
      return
    }
    if (mode === 'delivery') {
      if (!date) {
        setErr('Elige la fecha de entrega.')
        return
      }
      if (!address.trim()) {
        setErr('Escribe la dirección de entrega.')
        return
      }
    }
    setBusy(true)
    try {
      const r = await submitResponse({
        id: order.id,
        fulfilment: mode,
        deliveryDate: mode === 'delivery' ? date : null,
        deliveryAddress: mode === 'delivery' ? address.trim() : null,
        deliveryNote: mode === 'delivery' ? note.trim() || null : null,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
      })
      if (!r.ok) setErr(r.error)
      else onDone(r.order)
    } catch {
      setErr('Hubo un problema de conexión. Inténtalo de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  const deliveryFeeLabel = formatDOP(order.delivery_fee_cents)
  const liveBalance = (() => {
    const t = order.totals
    const base = t.subtotal_cents + t.source_shipping_cents + t.gangaloo_fee_cents + t.financing_cents
    const withDelivery = base + (mode === 'delivery' ? order.delivery_fee_cents : 0)
    return Math.max(0, withDelivery - t.paid_cents)
  })()

  return (
    <div className="space-y-4">
      <InvoiceCard order={order} includeDelivery={mode === 'delivery'} />

      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <div className="text-base font-semibold text-neutral-900">¡Tu pedido llegó! 🎉</div>
        <p className="mt-1 text-sm text-neutral-500">¿Cómo prefieres recibirlo?</p>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <Choice
            active={mode === 'pickup'}
            onClick={() => setMode('pickup')}
            emoji="🏪"
            title="Recoger"
            sub="En tienda · gratis"
          />
          <Choice
            active={mode === 'delivery'}
            onClick={() => setMode('delivery')}
            emoji="🚚"
            title="Entrega"
            sub={`A domicilio · +${deliveryFeeLabel}`}
          />
        </div>

        {mode === 'delivery' ? (
          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-neutral-700">Fecha de entrega</span>
              <input
                type="date"
                min={todayISO()}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-neutral-700">Dirección</span>
              <textarea
                rows={2}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Calle, número, sector, referencia…"
                className="mt-1 w-full resize-none rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
              />
            </label>

            <div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-neutral-700">Ubicación en el mapa</span>
                <button
                  type="button"
                  onClick={useMyLocation}
                  className="text-xs font-medium text-blue-600 underline"
                >
                  Usar mi ubicación
                </button>
              </div>
              <p className="mb-2 mt-0.5 text-xs text-neutral-400">Toca el mapa para marcar tu punto exacto (opcional).</p>
              <div
                ref={mapBoxRef}
                className="h-56 w-full overflow-hidden rounded-lg border border-neutral-200 bg-neutral-100"
              >
                {!leafletReady ? (
                  <div className="flex h-full items-center justify-center text-xs text-neutral-400">
                    Cargando mapa…
                  </div>
                ) : null}
              </div>
              {coords ? (
                <p className="mt-1 text-xs text-emerald-600">
                  📍 Ubicación marcada ({coords.lat.toFixed(5)}, {coords.lng.toFixed(5)})
                </p>
              ) : null}
            </div>

            <label className="block">
              <span className="text-sm font-medium text-neutral-700">Nota (opcional)</span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ej. llamar al llegar"
                className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
              />
            </label>
          </div>
        ) : null}

        {mode ? (
          <div className="mt-5 flex items-center justify-between rounded-lg bg-neutral-50 px-4 py-3">
            <span className="text-sm text-neutral-500">A pagar al recibir</span>
            <span className="text-lg font-bold" style={{ color: GOLD }}>
              {formatDOP(liveBalance)}
            </span>
          </div>
        ) : null}

        {err ? <p className="mt-3 text-sm text-red-600">{err}</p> : null}

        <button
          type="button"
          onClick={submit}
          disabled={busy || !mode}
          className="mt-4 w-full rounded-xl py-3 text-sm font-semibold text-white transition disabled:opacity-50"
          style={{ background: NAVY }}
        >
          {busy ? 'Enviando…' : 'Confirmar'}
        </button>
      </div>
    </div>
  )
}

function Choice({
  active,
  onClick,
  emoji,
  title,
  sub,
}: {
  active: boolean
  onClick: () => void
  emoji: string
  title: string
  sub: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center rounded-xl border-2 p-4 text-center transition ${
        active ? 'bg-neutral-50' : 'border-neutral-200 hover:border-neutral-300'
      }`}
      style={active ? { borderColor: NAVY } : undefined}
    >
      <span className="text-2xl">{emoji}</span>
      <span className="mt-1 text-sm font-semibold text-neutral-900">{title}</span>
      <span className="text-xs text-neutral-500">{sub}</span>
    </button>
  )
}

/* ─────────── state: confirmed ─────────── */
function Confirmation({ order }: { order: PublicOrder }) {
  const isDel = order.fulfilment === 'delivery'
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
        <div className="text-4xl">✅</div>
        <h1 className="mt-2 text-xl font-bold text-neutral-900">
          {isDel ? '¡Entrega confirmada!' : '¡Listo para recoger!'}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Gracias, {order.client_name}. {isDel ? 'Te contactaremos el día de la entrega.' : 'Pasa por la tienda cuando gustes.'}
        </p>
      </div>

      {isDel ? (
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="space-y-1.5 text-sm">
            <Line label="📅 Fecha" value={order.delivery_date ? formatDate(order.delivery_date) : 'A coordinar'} />
            <Line label="📍 Dirección" value={order.delivery_address || '—'} />
          </div>
        </div>
      ) : null}

      <InvoiceCard order={order} includeDelivery={isDel} />

      <div className="rounded-2xl p-4 text-center text-sm font-medium text-white" style={{ background: NAVY }}>
        A pagar al {isDel ? 'recibir' : 'recoger'}:{' '}
        <span style={{ color: GOLD }}>{formatDOP(order.totals.balance_cents)}</span>
      </div>
    </div>
  )
}
