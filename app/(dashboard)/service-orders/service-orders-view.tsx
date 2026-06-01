'use client'

// app/(dashboard)/service-orders/service-orders-view.tsx
// The interactive admin screen for service orders (personal-shopper / encargos).
// Matches the rest of the admin (shadcn tokens + Tailwind). Money is in CENTS.

import { useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2, Copy, Check, Search, Bell } from 'lucide-react'
import {
  computeTotals,
  productCount,
  num,
  PLATFORMS,
  STAGES,
  DEFAULT_DELIVERY_FEE_CENTS,
  type ServiceOrder,
  type ServicePlatform,
  type ServiceStage,
} from '@/lib/service-orders'
import {
  saveServiceOrder,
  recordPayment,
  removePayment,
  advanceStage,
  completeOrder,
  deleteServiceOrder,
  type SaveServiceOrderInput,
} from './actions'

/* ─────────────── helpers ─────────────── */
function dop(cents: number): string {
  return (
    'RD$ ' +
    (num(cents) / 100).toLocaleString('es-DO', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  )
}
function dopShort(cents: number): string {
  const v = num(cents) / 100
  return 'RD$ ' + (v >= 1000 ? (v / 1000).toFixed(v % 1000 ? 1 : 0) + 'k' : v.toFixed(0))
}
function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-DO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}
function fmtWhen(ms: number): string {
  return new Date(ms).toLocaleString('es-DO', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}
function cleanPhone(p: string): string {
  return (p || '').replace(/[\s\-()+]/g, '')
}
function waLink(phone: string, msg: string): string {
  return `https://wa.me/${cleanPhone(phone)}?text=${encodeURIComponent(msg)}`
}
function openWa(phone: string, msg: string) {
  if (typeof window !== 'undefined') window.open(waLink(phone, msg), '_blank')
}
function toCents(pesos: string): number {
  return Math.max(0, Math.round((parseFloat(pesos) || 0) * 100))
}

const PLATFORM_LABEL: Record<ServicePlatform, string> = {
  amazon: 'Amazon',
  temu: 'Temu',
  shein: 'Shein',
  aliexpress: 'AliExpress',
  other: 'Otra',
}
function platformBadge(p: ServicePlatform): string {
  switch (p) {
    case 'amazon':
      return 'bg-[#ff9900] text-black'
    case 'temu':
      return 'bg-[#f0380a] text-white'
    case 'shein':
      return 'bg-neutral-800 text-white'
    case 'aliexpress':
      return 'bg-[#e62f18] text-white'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

const STAGE_LABEL: Record<ServiceStage, string> = {
  invoice: 'Factura',
  ordered: 'Pedido',
  arrived: 'Llegó',
  notified: 'Notificado',
  responded: 'Respondió',
  ready: 'Listo',
  completed: 'Completado',
}
const STAGE_FULL: Record<ServiceStage, string> = {
  invoice: 'Factura creada',
  ordered: 'Pedido en la tienda',
  arrived: 'Llegó',
  notified: 'Cliente notificado',
  responded: 'Cliente respondió',
  ready: 'Listo / agendado',
  completed: 'Completado',
}
function stageBadge(s: ServiceStage): string {
  switch (s) {
    case 'responded':
      return 'border border-purple-500 text-purple-500'
    case 'ready':
      return 'border border-yellow-500 text-yellow-600'
    case 'completed':
      return 'border border-border text-muted-foreground'
    default:
      return 'border border-emerald-500 text-emerald-500'
  }
}

/* ─────────────── WhatsApp message builders ─────────────── */
function itemLines(o: ServiceOrder): string {
  if (o.items && o.items.length) return o.items.map((it) => `   • ${it.qty}× ${it.name}`).join('\n')
  if (o.description) return `   • ${o.description}`
  return ''
}
function moneyBlock(o: ServiceOrder, includeDelivery: boolean): string {
  const t = computeTotals(o)
  const dCharge = includeDelivery ? t.deliveryChargeCents : 0
  const total =
    t.subtotalCents + t.sourceShippingCents + t.gangalooFeeCents + t.financingCents + dCharge
  const bal = Math.max(0, total - t.paidCents)
  let m = `\n💵 Subtotal: *${dop(t.subtotalCents)}*`
  if (t.sourceShippingCents > 0) m += `\n📦 Envío origen: *${dop(t.sourceShippingCents)}*`
  if (t.gangalooFeeCents > 0) m += `\n🏷️ Gestión GangaLoo: *${dop(t.gangalooFeeCents)}*`
  if (t.financingCents > 0) m += `\n💳 Interés financiero: *${dop(t.financingCents)}*`
  if (includeDelivery && dCharge > 0) m += `\n🚚 Entrega a domicilio: *${dop(dCharge)}*`
  m += `\n🧾 Total: *${dop(total)}*`
  if (t.paidCents > 0) m += `\n✅ Abonado: *${dop(t.paidCents)}*`
  m += `\n⚡ Por pagar: *${dop(bal)}*`
  return m
}
function buildInvoiceMsg(o: ServiceOrder, link: string): string {
  let m = `Hola ${o.client_name}! 👋\n\nAquí está tu factura de GangaLoo 🧾\n`
  m += `🛒 Pedido de *${PLATFORM_LABEL[o.platform]}*`
  if (o.source_ref) m += ` · Ref: ${o.source_ref}`
  m += '\n'
  const il = itemLines(o)
  if (il) m += il + '\n'
  m += moneyBlock(o, false) + '\n'
  m += `\nPara empezar a procesar tu pedido necesitamos un *depósito inicial*. Avísanos cuando lo hayas enviado 🙏\n`
  m += `\n👉 Ver tu pedido: ${link}`
  return m
}
function buildNotifyMsg(o: ServiceOrder, link: string): string {
  const dfee = num(o.delivery_fee_cents) > 0 ? num(o.delivery_fee_cents) : DEFAULT_DELIVERY_FEE_CENTS
  let m = `Hola ${o.client_name}! 👋\n\n¡Tu pedido de *${PLATFORM_LABEL[o.platform]}* ya llegó! 📦`
  if (o.source_ref) m += `\n🔖 Ref: ${o.source_ref}`
  const il = itemLines(o)
  if (il) m += '\n' + il
  m += moneyBlock(o, false)
  m += `\n\n¿Cómo prefieres recibirlo?\n🏪 *Recojo en tienda* (gratis)\n🚚 *Envío a domicilio* (+${dop(dfee)})\n`
  m += `\nResponde aquí o haz clic para elegir fecha y dirección de entrega:\n👉 ${link}`
  return m
}
function buildConfirmMsg(o: ServiceOrder): string {
  const bal = computeTotals(o).balanceCents
  if (o.fulfilment === 'delivery') {
    let m = `✅ *Entrega confirmada — GangaLoo* 🎉\n\nHola ${o.client_name}!\n`
    m += `📅 Fecha: *${o.delivery_date || 'a coordinar'}*\n📍 Dirección: ${o.delivery_address || '—'}\n\n`
    m += `💳 *A pagar al recibir:* ${dop(bal)}\n\nTe contactamos el día de la entrega. ¡Gracias! 🙏`
    return m
  }
  return `✅ *Listo para recoger — GangaLoo* 🎉\n\nHola ${o.client_name}! Tu pedido está listo en tienda.\n💳 *A pagar al recoger:* ${dop(bal)}\n\nPasa cuando gustes. ¡Te esperamos! 🙌`
}
function msgForStage(o: ServiceOrder, link: string): string {
  if (o.stage === 'invoice') return buildInvoiceMsg(o, link)
  if (o.stage === 'ordered' || o.stage === 'arrived' || o.stage === 'notified')
    return buildNotifyMsg(o, link)
  return buildConfirmMsg(o)
}

/* ─────────────── form types ─────────────── */
type FormItem = { name: string; qty: string; price: string }
type FormState = {
  id?: string
  clientName: string
  clientPhone: string
  platform: ServicePlatform
  sourceRef: string
  items: FormItem[]
  description: string
  amount: string
  sourceShipping: string
  deliveryFee: string
  gangalooFee: string
  financing: string
  deposit: string
  notes: string
}
function blankForm(): FormState {
  return {
    clientName: '',
    clientPhone: '',
    platform: 'amazon',
    sourceRef: '',
    items: [{ name: '', qty: '1', price: '' }],
    description: '',
    amount: '',
    sourceShipping: '0',
    deliveryFee: '200',
    gangalooFee: '0',
    financing: '0',
    deposit: '',
    notes: '',
  }
}

/* ─────────────── tiny UI atoms (Tailwind only) ─────────────── */
function Btn({
  children,
  onClick,
  variant = 'primary',
  disabled,
  full,
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'ghost' | 'wa' | 'danger' | 'soft'
  disabled?: boolean
  full?: boolean
}) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition disabled:opacity-50 disabled:pointer-events-none'
  const styles: Record<string, string> = {
    primary: 'bg-primary text-primary-foreground hover:opacity-90',
    soft: 'bg-secondary text-secondary-foreground hover:opacity-90',
    ghost: 'border border-border text-foreground hover:bg-muted',
    wa: 'bg-[#25D366] text-white hover:opacity-90',
    danger: 'border border-destructive text-destructive hover:bg-destructive hover:text-white',
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${styles[variant]} ${full ? 'w-full' : ''}`}
    >
      {children}
    </button>
  )
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  )
}
const inputCls =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary'

/* ─────────────── main component ─────────────── */
export function ServiceOrdersView({ orders }: { orders: ServiceOrder[] }) {
  const router = useRouter()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | ServiceStage>('all')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [origin, setOrigin] = useState('')
  const [copied, setCopied] = useState(false)

  // order modal
  const [orderModal, setOrderModal] = useState(false)
  const [form, setForm] = useState<FormState>(blankForm())

  // payment modal
  const [payModal, setPayModal] = useState(false)
  const [payKind, setPayKind] = useState<'deposit' | 'final' | 'other'>('final')
  const [payAmount, setPayAmount] = useState('')
  const [payNote, setPayNote] = useState('')
  const [payTargetId, setPayTargetId] = useState<string | null>(null)

  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])
  useEffect(() => {
    if (!toast) return
    const h = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(h)
  }, [toast])

  const selected = orders.find((o) => o.id === selectedId) || null
  const formLink = (id: string) => `${origin || ''}/encargo/${id}`

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    setBusy(true)
    try {
      const r = await fn()
      if (!r.ok) setToast(r.error || 'Algo salió mal.')
      else {
        if (after) after()
        router.refresh()
      }
    } catch {
      setToast('Error de conexión.')
    } finally {
      setBusy(false)
    }
  }

  /* ----- modal openers ----- */
  function openNew() {
    setForm(blankForm())
    setOrderModal(true)
  }
  function openEdit(o: ServiceOrder) {
    setForm({
      id: o.id,
      clientName: o.client_name,
      clientPhone: o.client_phone,
      platform: o.platform,
      sourceRef: o.source_ref || '',
      items:
        o.items && o.items.length
          ? o.items.map((it) => ({
              name: it.name,
              qty: String(it.qty),
              price: (it.price_cents / 100).toString(),
            }))
          : [{ name: '', qty: '1', price: '' }],
      description: o.description || '',
      amount: o.amount_cents ? (o.amount_cents / 100).toString() : '',
      sourceShipping: (o.source_shipping_cents / 100).toString(),
      deliveryFee: (o.delivery_fee_cents / 100).toString(),
      gangalooFee: (o.gangaloo_fee_cents / 100).toString(),
      financing: (o.financing_cents / 100).toString(),
      deposit: '',
      notes: o.internal_notes || '',
    })
    setOrderModal(true)
  }
  function openPay(id: string, kind: 'deposit' | 'final' | 'other', presetCents?: number) {
    setPayTargetId(id)
    setPayKind(kind)
    setPayAmount(presetCents != null ? (presetCents / 100).toString() : '')
    setPayNote('')
    setPayModal(true)
  }

  /* ----- save order ----- */
  function buildSaveInput(): SaveServiceOrderInput {
    const items = form.items
      .filter((it) => it.name.trim() && (parseFloat(it.qty) || 0) > 0)
      .map((it) => ({
        name: it.name.trim(),
        qty: Math.round(parseFloat(it.qty) || 0),
        priceCents: toCents(it.price),
      }))
    return {
      id: form.id,
      clientName: form.clientName,
      clientPhone: form.clientPhone,
      platform: form.platform,
      sourceRef: form.sourceRef,
      items,
      description: form.description,
      amountCents: toCents(form.amount),
      sourceShippingCents: toCents(form.sourceShipping),
      deliveryFeeCents: toCents(form.deliveryFee),
      gangalooFeeCents: toCents(form.gangalooFee),
      financingCents: toCents(form.financing),
      internalNotes: form.notes,
      depositCents: form.id ? 0 : toCents(form.deposit),
    }
  }
  function saveOrder() {
    if (!form.clientName.trim() || !form.clientPhone.trim()) {
      setToast('Nombre y WhatsApp del cliente son obligatorios.')
      return
    }
    const input = buildSaveInput()
    ;(async () => {
      setBusy(true)
      try {
        const r = await saveServiceOrder(input)
        if (!r.ok) {
          setToast(r.error)
          return
        }
        setOrderModal(false)
        setSelectedId(r.id)
        router.refresh()
      } catch {
        setToast('Error de conexión.')
      } finally {
        setBusy(false)
      }
    })()
  }
  function savePayment() {
    if (!payTargetId) return
    const cents = toCents(payAmount)
    if (cents <= 0) {
      setToast('Ingresa un monto válido.')
      return
    }
    run(
      () => recordPayment({ id: payTargetId, kind: payKind, amountCents: cents, note: payNote }),
      () => setPayModal(false),
    )
  }
  function doComplete(o: ServiceOrder) {
    const bal = computeTotals(o).balanceCents
    let finalCents = 0
    if (bal > 0) {
      const input = window.prompt(
        `Saldo pendiente: ${dop(bal)}\n\n¿Cuánto pagó el cliente ahora? (en RD$, Enter = monto completo)`,
        (bal / 100).toFixed(2),
      )
      if (input === null) return
      finalCents = toCents(input)
    }
    run(() => completeOrder(o.id, finalCents))
  }
  function doDelete(id: string) {
    if (!window.confirm('¿Eliminar este pedido permanentemente?')) return
    run(
      () => deleteServiceOrder(id),
      () => {
        setOrderModal(false)
        if (selectedId === id) setSelectedId(null)
      },
    )
  }

  /* ----- derived ----- */
  const filtered = orders.filter((o) => {
    if (filter !== 'all' && o.stage !== filter) return false
    if (query) {
      const h = `${o.client_name} ${o.id} ${o.source_ref || ''} ${o.platform} ${o.client_phone}`.toLowerCase()
      if (!h.includes(query.toLowerCase())) return false
    }
    return true
  })
  const totalCount = orders.length
  const inProgress = orders.filter((o) => o.stage !== 'completed').length
  const respondedCount = orders.filter((o) => o.stage === 'responded').length
  const owedCents = orders
    .filter((o) => o.stage !== 'completed')
    .reduce((s, o) => s + computeTotals(o).balanceCents, 0)

  const itemsSubtotalCents = (() => {
    const hasItems = form.items.some((it) => it.name.trim() || it.price || (it.qty && it.qty !== '1'))
    if (hasItems)
      return form.items.reduce((s, it) => s + (parseFloat(it.qty) || 0) * toCents(it.price), 0)
    return toCents(form.amount)
  })()
  const modalTotalCents =
    itemsSubtotalCents + toCents(form.sourceShipping) + toCents(form.gangalooFee) + toCents(form.financing)

  /* ─────────────── render ─────────────── */
  return (
    <div className="space-y-6">
      {/* header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Service Orders</h1>
          <p className="text-sm text-muted-foreground">
            Pedidos que compras en otras tiendas (Amazon, Temu, Shein…) para tus clientes.
          </p>
        </div>
        <Btn onClick={openNew}>
          <Plus className="h-4 w-4" /> Nuevo encargo
        </Btn>
      </div>

      {/* stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total" value={String(totalCount)} />
        <Stat label="En proceso" value={String(inProgress)} accent="text-emerald-500" />
        <Stat label="Respondieron" value={String(respondedCount)} accent="text-purple-500" />
        <Stat label="Por cobrar" value={dopShort(owedCents)} accent="text-amber-500" />
      </div>

      {/* filters */}
      <div className="flex flex-wrap gap-2">
        <Chip active={filter === 'all'} onClick={() => setFilter('all')}>
          Todos <Cnt n={totalCount} />
        </Chip>
        {STAGES.map((s) => (
          <Chip key={s} active={filter === s} onClick={() => setFilter(s)} alert={s === 'responded'}>
            {STAGE_LABEL[s]} <Cnt n={orders.filter((o) => o.stage === s).length} />
          </Chip>
        ))}
      </div>

      {/* search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          className={`${inputCls} pl-9`}
          placeholder="Buscar cliente, ID, plataforma…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* layout */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_minmax(360px,420px)]">
        {/* list */}
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
              No hay pedidos aquí todavía.
            </div>
          ) : (
            filtered.map((o) => {
              const t = computeTotals(o)
              const pc = productCount(o)
              const desc =
                o.items && o.items.length ? `${pc} producto${pc === 1 ? '' : 's'}` : o.description || ''
              const isSel = selectedId === o.id
              const flag = o.stage === 'responded'
              return (
                <button
                  key={o.id}
                  onClick={() => setSelectedId(o.id)}
                  className={`w-full rounded-lg border bg-card p-4 text-left transition hover:border-primary/60 ${
                    isSel ? 'border-primary' : flag ? 'border-purple-500/60' : 'border-border'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 font-semibold">
                        {o.client_name} {flag ? <Bell className="h-4 w-4 text-purple-500" /> : null}
                      </div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {o.id.slice(0, 8).toUpperCase()}
                      </div>
                    </div>
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${platformBadge(
                        o.platform,
                      )}`}
                    >
                      {PLATFORM_LABEL[o.platform]}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-muted-foreground">
                    <span>📱 {o.client_phone}</span>
                    <span className={t.balanceCents > 0 ? 'text-amber-500' : 'text-emerald-500'}>
                      ⚡ {dop(t.balanceCents)}
                    </span>
                    <span>📅 {fmtDate(o.created_at)}</span>
                  </div>
                  {desc ? (
                    <div className="mt-2 truncate text-sm text-muted-foreground">{desc}</div>
                  ) : null}
                  <div className="mt-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 font-mono text-[11px] font-semibold ${stageBadge(
                        o.stage,
                      )}`}
                    >
                      {STAGE_LABEL[o.stage]}
                    </span>
                  </div>
                </button>
              )
            })
          )}
        </div>

        {/* detail */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          {!selected ? (
            <div className="rounded-lg border border-dashed border-border py-20 text-center text-sm text-muted-foreground">
              Selecciona un pedido para ver su ciclo y el siguiente paso.
            </div>
          ) : (
            <Detail
              o={selected}
              link={formLink(selected.id)}
              busy={busy}
              copied={copied}
              onCopy={() => {
                navigator.clipboard?.writeText(formLink(selected.id))
                setCopied(true)
                setTimeout(() => setCopied(false), 1400)
              }}
              onEdit={() => openEdit(selected)}
              onOpenPay={openPay}
              onRemovePay={(id, pid) => run(() => removePayment(id, pid))}
              onAdvance={(to, label, alsoWa) => {
                if (alsoWa) openWa(selected.client_phone, msgForStage({ ...selected, stage: to }, formLink(selected.id)))
                run(() => advanceStage(selected.id, to, label))
              }}
              onComplete={() => doComplete(selected)}
              onSendWa={(msg) => openWa(selected.client_phone, msg)}
            />
          )}
        </div>
      </div>

      {/* ─────────── order modal ─────────── */}
      {orderModal ? (
        <Overlay onClose={() => setOrderModal(false)}>
          <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-xl border border-border bg-card p-6">
            <h2 className="mb-4 text-lg font-semibold">
              {form.id ? 'Editar encargo' : 'Nuevo encargo'}
            </h2>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Cliente">
                <input
                  className={inputCls}
                  value={form.clientName}
                  onChange={(e) => setForm({ ...form, clientName: e.target.value })}
                />
              </Field>
              <Field label="WhatsApp">
                <input
                  className={inputCls}
                  placeholder="+1 829 000 0000"
                  value={form.clientPhone}
                  onChange={(e) => setForm({ ...form, clientPhone: e.target.value })}
                />
              </Field>
              <Field label="Plataforma">
                <select
                  className={inputCls}
                  value={form.platform}
                  onChange={(e) => setForm({ ...form, platform: e.target.value as ServicePlatform })}
                >
                  {PLATFORMS.map((p) => (
                    <option key={p} value={p}>
                      {PLATFORM_LABEL[p]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Ref. de la tienda">
                <input
                  className={inputCls}
                  placeholder="ej. 2888"
                  value={form.sourceRef}
                  onChange={(e) => setForm({ ...form, sourceRef: e.target.value })}
                />
              </Field>
            </div>

            {/* items */}
            <div className="mt-5">
              <div className="mb-2 grid grid-cols-[1fr_56px_110px_28px] gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <span>Producto</span>
                <span>Cant.</span>
                <span>Precio RD$</span>
                <span />
              </div>
              {form.items.map((it, i) => (
                <div key={i} className="mb-2 grid grid-cols-[1fr_56px_110px_28px] gap-2">
                  <input
                    className={inputCls}
                    placeholder="Nombre del producto"
                    value={it.name}
                    onChange={(e) => {
                      const items = [...form.items]
                      items[i] = { ...items[i], name: e.target.value }
                      setForm({ ...form, items })
                    }}
                  />
                  <input
                    className={inputCls}
                    type="number"
                    min="0"
                    value={it.qty}
                    onChange={(e) => {
                      const items = [...form.items]
                      items[i] = { ...items[i], qty: e.target.value }
                      setForm({ ...form, items })
                    }}
                  />
                  <input
                    className={inputCls}
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={it.price}
                    onChange={(e) => {
                      const items = [...form.items]
                      items[i] = { ...items[i], price: e.target.value }
                      setForm({ ...form, items })
                    }}
                  />
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      const items = form.items.filter((_, j) => j !== i)
                      setForm({ ...form, items: items.length ? items : [{ name: '', qty: '1', price: '' }] })
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <Btn
                variant="ghost"
                onClick={() => setForm({ ...form, items: [...form.items, { name: '', qty: '1', price: '' }] })}
              >
                + Agregar producto
              </Btn>
            </div>

            <div className="mt-4">
              <Field label="O descripción corta (si no detallas productos)">
                <input
                  className={inputCls}
                  placeholder='ej. 1 Peluca Lacio 30"'
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </Field>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Subtotal manual RD$ (si no hay productos)">
                <input
                  className={inputCls}
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
              </Field>
              <Field label="Envío origen RD$">
                <input
                  className={inputCls}
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.sourceShipping}
                  onChange={(e) => setForm({ ...form, sourceShipping: e.target.value })}
                />
              </Field>
              <Field label="Entrega local RD$ (solo si elige domicilio)">
                <input
                  className={inputCls}
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.deliveryFee}
                  onChange={(e) => setForm({ ...form, deliveryFee: e.target.value })}
                />
              </Field>
              <Field label="Gestión GangaLoo RD$">
                <input
                  className={inputCls}
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.gangalooFee}
                  onChange={(e) => setForm({ ...form, gangalooFee: e.target.value })}
                />
              </Field>
              <Field label="Interés financiero RD$">
                <input
                  className={inputCls}
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.financing}
                  onChange={(e) => setForm({ ...form, financing: e.target.value })}
                />
              </Field>
              {!form.id ? (
                <Field label="Depósito inicial ahora RD$ (opcional)">
                  <input
                    className={inputCls}
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={form.deposit}
                    onChange={(e) => setForm({ ...form, deposit: e.target.value })}
                  />
                </Field>
              ) : null}
            </div>

            <div className="mt-4 flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
              <span className="font-medium">Total factura (sin entrega)</span>
              <span className="font-mono">{dop(modalTotalCents)}</span>
            </div>

            <div className="mt-4">
              <Field label="Notas internas (opcional)">
                <input
                  className={inputCls}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </Field>
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              {form.id ? (
                <Btn variant="danger" onClick={() => form.id && doDelete(form.id)}>
                  <Trash2 className="h-4 w-4" /> Eliminar
                </Btn>
              ) : null}
              <Btn variant="ghost" onClick={() => setOrderModal(false)}>
                Cancelar
              </Btn>
              <Btn onClick={saveOrder} disabled={busy}>
                {form.id ? 'Guardar cambios' : 'Crear encargo'}
              </Btn>
            </div>
          </div>
        </Overlay>
      ) : null}

      {/* ─────────── payment modal ─────────── */}
      {payModal ? (
        <Overlay onClose={() => setPayModal(false)}>
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6">
            <h2 className="mb-4 text-lg font-semibold">Registrar pago</h2>
            <div className="space-y-4">
              <Field label="Tipo">
                <select
                  className={inputCls}
                  value={payKind}
                  onChange={(e) => setPayKind(e.target.value as 'deposit' | 'final' | 'other')}
                >
                  <option value="deposit">Depósito inicial</option>
                  <option value="final">Pago final</option>
                  <option value="other">Otro</option>
                </select>
              </Field>
              <Field label="Monto RD$">
                <input
                  className={inputCls}
                  type="number"
                  min="0"
                  step="0.01"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                />
              </Field>
              <Field label="Nota (opcional)">
                <input
                  className={inputCls}
                  placeholder="Efectivo, transferencia, ref…"
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                />
              </Field>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Btn variant="ghost" onClick={() => setPayModal(false)}>
                Cancelar
              </Btn>
              <Btn onClick={savePayment} disabled={busy}>
                Registrar
              </Btn>
            </div>
          </div>
        </Overlay>
      ) : null}

      {/* toast */}
      {toast ? (
        <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-full border border-border bg-card px-5 py-2.5 text-sm shadow-lg">
          {toast}
        </div>
      ) : null}
    </div>
  )
}

/* ─────────────── detail panel ─────────────── */
function Detail({
  o,
  link,
  busy,
  copied,
  onCopy,
  onEdit,
  onOpenPay,
  onRemovePay,
  onAdvance,
  onComplete,
  onSendWa,
}: {
  o: ServiceOrder
  link: string
  busy: boolean
  copied: boolean
  onCopy: () => void
  onEdit: () => void
  onOpenPay: (id: string, kind: 'deposit' | 'final' | 'other', presetCents?: number) => void
  onRemovePay: (id: string, paymentId: string) => void
  onAdvance: (to: ServiceStage, label: string, alsoWa?: boolean) => void
  onComplete: () => void
  onSendWa: (msg: string) => void
}) {
  const t = computeTotals(o)
  const idx = STAGES.indexOf(o.stage)
  const isDel = o.fulfilment === 'delivery'

  return (
    <div className="space-y-5 rounded-lg border border-border bg-card p-5">
      {/* head */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-semibold">{o.client_name}</div>
          <div className="font-mono text-xs text-muted-foreground">
            {o.id.slice(0, 8).toUpperCase()} · {o.client_phone}
          </div>
        </div>
        <Btn variant="ghost" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" /> Editar
        </Btn>
      </div>

      {/* next step */}
      <NextStep
        o={o}
        link={link}
        busy={busy}
        copied={copied}
        onCopy={onCopy}
        onOpenPay={onOpenPay}
        onAdvance={onAdvance}
        onComplete={onComplete}
        onSendWa={onSendWa}
      />

      {/* lifecycle */}
      <Section title="Ciclo del pedido">
        <ol className="space-y-2">
          {STAGES.map((s, i) => {
            const state = i < idx ? 'done' : i === idx ? 'current' : 'future'
            return (
              <li key={s} className="flex items-center gap-3 text-sm">
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${
                    state === 'done'
                      ? 'bg-emerald-600 text-white'
                      : state === 'current'
                        ? 'bg-primary text-primary-foreground'
                        : 'border border-border text-muted-foreground'
                  }`}
                >
                  {state === 'done' ? '✓' : i + 1}
                </span>
                <span
                  className={
                    state === 'future'
                      ? 'text-muted-foreground'
                      : state === 'current'
                        ? 'font-medium'
                        : ''
                  }
                >
                  {STAGE_FULL[s]}
                </span>
              </li>
            )
          })}
        </ol>
      </Section>

      {/* invoice & payments */}
      <Section title="Factura y pagos">
        {o.items && o.items.length ? (
          o.items.map((it, i) => (
            <Row key={i} label={`${it.qty}× ${it.name}`} value={dop(it.qty * it.price_cents)} />
          ))
        ) : o.description ? (
          <Row label={o.description} value={dop(t.subtotalCents)} />
        ) : null}
        <Row label="Subtotal" value={dop(t.subtotalCents)} />
        <Row label="Envío origen" value={dop(t.sourceShippingCents)} />
        <Row
          label="Entrega local"
          value={isDel ? dop(t.deliveryChargeCents) : '— (recojo)'}
          muted={!isDel}
        />
        {t.gangalooFeeCents > 0 ? <Row label="Gestión GangaLoo" value={dop(t.gangalooFeeCents)} /> : null}
        {t.financingCents > 0 ? <Row label="Interés financiero" value={dop(t.financingCents)} /> : null}
        <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-sm">
          <span className="font-medium">Total cargos</span>
          <span className="font-mono">{dop(t.totalCents)}</span>
        </div>

        <div className="mt-3 space-y-2">
          {o.payments && o.payments.length ? (
            o.payments.map((p, i) => (
              <div
                key={p.id || i}
                className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
              >
                <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase">
                  {p.kind}
                </span>
                <span className="text-xs text-muted-foreground">{fmtDate(o.created_at)}</span>
                <span className="ml-auto font-mono">{dop(p.amount_cents)}</span>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    if (p.id) onRemovePay(o.id, p.id)
                  }}
                  title="Quitar"
                >
                  ✕
                </button>
              </div>
            ))
          ) : (
            <div className="text-xs text-muted-foreground">Sin pagos registrados.</div>
          )}
          <Btn
            variant="ghost"
            full
            onClick={() => onOpenPay(o.id, t.balanceCents > 0 ? 'final' : 'other', t.balanceCents > 0 ? t.balanceCents : undefined)}
          >
            + Registrar pago
          </Btn>
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
          <span className="text-sm font-medium">{t.balanceCents > 0 ? 'Saldo pendiente' : 'Pagado'}</span>
          <span
            className={`font-mono text-lg font-bold ${
              t.balanceCents > 0 ? 'text-amber-500' : 'text-emerald-500'
            }`}
          >
            {dop(t.balanceCents)}
          </span>
        </div>
      </Section>

      {/* client response */}
      {['responded', 'ready', 'completed'].includes(o.stage) && o.fulfilment ? (
        <Section title="Respuesta del cliente">
          <Row label="Eligió" value={isDel ? '🚚 Entrega' : '🏪 Recojo'} />
          {isDel ? (
            <>
              <Row label="Fecha" value={o.delivery_date || '—'} />
              <Row label="Dirección" value={o.delivery_address || '—'} />
              {o.delivery_note ? <Row label="Nota" value={o.delivery_note} /> : null}
              {o.delivery_lat && o.delivery_lng ? (
                <a
                  className="mt-2 block text-sm text-primary underline"
                  href={`https://maps.google.com/?q=${o.delivery_lat},${o.delivery_lng}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  🧭 Abrir en Maps
                </a>
              ) : null}
            </>
          ) : null}
        </Section>
      ) : null}

      {/* order info */}
      <Section title="Información">
        <Row label="Plataforma" value={PLATFORM_LABEL[o.platform]} />
        {o.source_ref ? <Row label="Ref. tienda" value={o.source_ref} /> : null}
        <Row label="WhatsApp" value={o.client_phone} />
        <Row label="Creado" value={fmtDate(o.created_at)} />
      </Section>

      {/* WhatsApp preview */}
      <Section title="Mensaje de WhatsApp (esta etapa)">
        <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-emerald-700/40 bg-emerald-950/20 p-3 font-mono text-xs leading-relaxed text-emerald-200">
          {msgForStage(o, link)}
        </pre>
        <Btn variant="wa" full onClick={() => onSendWa(msgForStage(o, link))}>
          Abrir en WhatsApp
        </Btn>
      </Section>

      {/* notes */}
      {o.internal_notes ? (
        <Section title="Notas internas">
          <p className="text-sm">{o.internal_notes}</p>
        </Section>
      ) : null}

      {/* activity */}
      <Section title="Actividad">
        <ul className="space-y-2">
          {(o.timeline || [])
            .slice()
            .reverse()
            .map((tEntry, i) => (
              <li key={i} className="text-xs">
                <div>{tEntry.label}</div>
                <div className="font-mono text-[10px] text-muted-foreground">{fmtWhen(tEntry.ts)}</div>
              </li>
            ))}
          {!(o.timeline && o.timeline.length) ? (
            <li className="text-xs text-muted-foreground">Sin actividad.</li>
          ) : null}
        </ul>
      </Section>
    </div>
  )
}

/* ─────────────── next-step card ─────────────── */
function NextStep({
  o,
  link,
  busy,
  copied,
  onCopy,
  onOpenPay,
  onAdvance,
  onComplete,
  onSendWa,
}: {
  o: ServiceOrder
  link: string
  busy: boolean
  copied: boolean
  onCopy: () => void
  onOpenPay: (id: string, kind: 'deposit' | 'final' | 'other', presetCents?: number) => void
  onAdvance: (to: ServiceStage, label: string, alsoWa?: boolean) => void
  onComplete: () => void
  onSendWa: (msg: string) => void
}) {
  const t = computeTotals(o)
  const CopyBox = (
    <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 font-mono text-xs">
      <span className="truncate text-muted-foreground">{link}</span>
      <button type="button" onClick={onCopy} className="ml-auto shrink-0 text-primary">
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  )

  let inner: ReactNode = null
  if (o.stage === 'invoice') {
    inner = (
      <>
        <Kicker>Siguiente paso</Kicker>
        <Title>Enviar la factura y cobrar el depósito</Title>
        <Sub>Comparte la factura, luego registra el depósito. Eso lo pasa a “Pedido”.</Sub>
        {CopyBox}
        <div className="mt-2 space-y-2">
          <Btn variant="wa" full onClick={() => onSendWa(buildInvoiceMsg(o, link))}>
            Enviar factura por WhatsApp
          </Btn>
          <Btn full onClick={() => onOpenPay(o.id, 'deposit')}>
            Registrar depósito → marcar “Pedido”
          </Btn>
        </div>
      </>
    )
  } else if (o.stage === 'ordered') {
    inner = (
      <>
        <Kicker>Siguiente paso</Kicker>
        <Title>Esperando que llegue</Title>
        <Sub>Ya lo pediste. Márcalo como llegado cuando lo tengas en mano.</Sub>
        <Btn full disabled={busy} onClick={() => onAdvance('arrived', 'Marcado como llegado')}>
          Marcar como llegado
        </Btn>
      </>
    )
  } else if (o.stage === 'arrived') {
    inner = (
      <>
        <Kicker>Siguiente paso</Kicker>
        <Title>Notificar al cliente que llegó</Title>
        <Sub>Envía el WhatsApp + enlace para que elija recojo o entrega.</Sub>
        {CopyBox}
        <div className="mt-2">
          <Btn
            variant="wa"
            full
            disabled={busy}
            onClick={() => onAdvance('notified', 'Cliente notificado — enlace enviado', true)}
          >
            Notificar (WhatsApp + enlace)
          </Btn>
        </div>
      </>
    )
  } else if (o.stage === 'notified') {
    inner = (
      <>
        <Kicker>Esperando</Kicker>
        <Title>Esperando al cliente</Title>
        <Sub>Ya tiene el enlace. Esto se actualiza solo cuando responda.</Sub>
        {CopyBox}
        <div className="mt-2 flex gap-2">
          <Btn variant="ghost" onClick={() => onSendWa(buildNotifyMsg(o, link))}>
            Reenviar
          </Btn>
          <Btn variant="ghost" disabled={busy} onClick={() => onAdvance('responded', 'Marcado respondido manualmente')}>
            Marcar respondido
          </Btn>
        </div>
      </>
    )
  } else if (o.stage === 'responded') {
    const isDel = o.fulfilment === 'delivery'
    inner = (
      <>
        <Kicker>🔔 Cliente respondió</Kicker>
        <Title>{isDel ? '🚚 Quiere entrega' : '🏪 Quiere recojo'}</Title>
        <Sub>
          {isDel
            ? `Para el ${o.delivery_date || 'fecha a confirmar'}. Confírmalo para agendar.`
            : 'Confirma que está listo para recoger.'}
        </Sub>
        <div className="space-y-2">
          <Btn variant="wa" full onClick={() => onSendWa(buildConfirmMsg(o))}>
            Enviar confirmación ({isDel ? 'entrega' : 'recojo'})
          </Btn>
          <Btn
            full
            disabled={busy}
            onClick={() => onAdvance('ready', isDel ? 'Entrega agendada' : 'Confirmado para recojo')}
          >
            {isDel ? 'Agendar entrega' : 'Confirmar recojo'}
          </Btn>
        </div>
      </>
    )
  } else if (o.stage === 'ready') {
    const isDel = o.fulfilment === 'delivery'
    inner = (
      <>
        <Kicker>Paso final</Kicker>
        <Title>{isDel ? 'En entrega' : 'Listo para recoger'}</Title>
        <Sub>
          Al {isDel ? 'entregar' : 'recoger'}, cobra el saldo de{' '}
          <b className="text-amber-500">{dop(t.balanceCents)}</b> y ciérralo.
        </Sub>
        <Btn full disabled={busy} onClick={onComplete}>
          Cobrar saldo y completar
        </Btn>
      </>
    )
  } else {
    inner = (
      <>
        <Kicker accent="text-emerald-500">Completado</Kicker>
        <Title>✅ Pedido cerrado</Title>
        <Sub>
          {o.fulfilment === 'delivery' ? 'Entregado' : 'Recogido'} · pagado {dop(t.paidCents)}.
        </Sub>
      </>
    )
  }

  const flag = o.stage === 'responded'
  return (
    <div
      className={`rounded-lg border p-4 ${
        flag ? 'border-purple-500/60 bg-purple-950/10' : 'border-emerald-700/50 bg-emerald-950/10'
      }`}
    >
      {inner}
    </div>
  )
}

/* ─────────────── small presentational atoms ─────────────── */
function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className={`text-2xl font-semibold tabular-nums ${accent || ''}`}>{value}</div>
      <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
    </div>
  )
}
function Chip({
  children,
  active,
  alert,
  onClick,
}: {
  children: ReactNode
  active?: boolean
  alert?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
        active
          ? 'border-foreground bg-foreground text-background'
          : alert
            ? 'border-purple-500 text-purple-500'
            : 'border-border text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
    </button>
  )
}
function Cnt({ n }: { n: number }) {
  return <span className="rounded-full bg-black/15 px-1.5 font-mono text-[10px]">{n}</span>
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2.5 border-b border-border pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      {children}
    </div>
  )
}
function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border/60 py-1.5 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className={`text-right font-mono ${muted ? 'text-muted-foreground' : ''}`}>{value}</span>
    </div>
  )
}
function Kicker({ children, accent }: { children: ReactNode; accent?: string }) {
  return (
    <div className={`text-[10px] font-semibold uppercase tracking-wider ${accent || 'text-emerald-500'}`}>
      {children}
    </div>
  )
}
function Title({ children }: { children: ReactNode }) {
  return <div className="mt-1 text-base font-semibold">{children}</div>
}
function Sub({ children }: { children: ReactNode }) {
  return <div className="mb-3 mt-1 text-xs leading-relaxed text-muted-foreground">{children}</div>
}
function Overlay({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {children}
    </div>
  )
}
