'use client'

// Seller self-service "My sales" view (bilingual: en for owner/admin, es for
// seller/distributor — locale passed in from the server page).
//
// Always-visible stat cards, then collapsible Invoices / Payments / Commissions
// sections (closed by default, count + total on the bar). Invoices carry a
// status + period filter. Consumes MySellerFinancials from the self-scoped RPC.
// Money in CENTS.

import { useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatDOP, formatDate } from '@/lib/format'
import type { Locale } from '@/lib/i18n/dictionary'
import type { MySellerFinancials } from '@/lib/my-seller-financials'
import type { PersonSaleRow, PersonPaymentRow } from '@/lib/person-financials'

const DASH = '\u2014'

const SALE_STATUS_STYLES: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700',
  confirmed: 'bg-blue-100 text-blue-800',
  paid: 'bg-emerald-100 text-emerald-800',
  partially_paid: 'bg-amber-100 text-amber-900',
  refunded: 'bg-purple-100 text-purple-800',
  cancelled: 'bg-rose-100 text-rose-800',
}

// ---- inline translations ----------------------------------------------------

type InvoiceStatusFilter = 'all' | 'paid' | 'open' | 'other'
type PeriodFilter = 'all' | 'this_month' | 'last_90' | 'this_year'

type Strings = {
  sellersOnly: string
  loadErr: string
  soldLifetime: string
  outstanding: string
  collected: string
  commEarned: string
  commPaid: string
  commOwed: string
  invoices: string
  paymentsCollected: string
  commissions: string
  noInvoices: string
  noMatch: string
  noPayments: string
  noCommissions: string
  showing: (shown: number, total: number) => string
  nInvoice: (n: number) => string
  nOpen: (n: number) => string
  nPayment: (n: number) => string
  nCommission: (n: number) => string
  f: Record<InvoiceStatusFilter, string>
  period: Record<PeriodFilter, string>
  hInvoice: string
  hDate: string
  hStatus: string
  hTotal: string
  hPaid: string
  hOutstanding: string
  hMethod: string
  hReference: string
  hAmount: string
  hRole: string
  st: Record<string, string>
  cPaid: string
  cPending: string
}

const STRINGS: Record<Locale, Strings> = {
  en: {
    sellersOnly: 'This view is for sellers only.',
    loadErr: 'We could not load your account. Please sign out and back in.',
    soldLifetime: 'Sold (lifetime)',
    outstanding: 'Outstanding on my sales',
    collected: 'Collected',
    commEarned: 'Commission earned',
    commPaid: 'Commission paid',
    commOwed: 'Commission owed to me',
    invoices: 'Invoices',
    paymentsCollected: 'Payments collected',
    commissions: 'Commissions',
    noInvoices: 'No invoices yet.',
    noMatch: 'No invoices match this filter.',
    noPayments: 'No payments collected yet.',
    noCommissions: 'No commissions.',
    showing: (s, t) => `Showing ${s} of ${t} invoices`,
    nInvoice: (n) => `${n} ${n === 1 ? 'invoice' : 'invoices'}`,
    nOpen: (n) => `${n} open`,
    nPayment: (n) => `${n} ${n === 1 ? 'payment' : 'payments'}`,
    nCommission: (n) => `${n} ${n === 1 ? 'commission' : 'commissions'}`,
    f: { all: 'All', paid: 'Paid', open: 'Open', other: 'Cancelled / refunded' },
    period: {
      all: 'All time',
      this_month: 'This month',
      last_90: 'Last 90 days',
      this_year: 'This year',
    },
    hInvoice: 'Invoice',
    hDate: 'Date',
    hStatus: 'Status',
    hTotal: 'Total',
    hPaid: 'Paid',
    hOutstanding: 'Outstanding',
    hMethod: 'Method',
    hReference: 'Reference',
    hAmount: 'Amount',
    hRole: 'Role',
    st: {
      draft: 'Draft',
      confirmed: 'Confirmed',
      paid: 'Paid',
      partially_paid: 'Partially paid',
      refunded: 'Refunded',
      cancelled: 'Cancelled',
    },
    cPaid: 'Paid',
    cPending: 'Pending',
  },
  es: {
    sellersOnly: 'Esta vista es solo para vendedores.',
    loadErr: 'No pudimos cargar tu cuenta. Cierra sesión y vuelve a entrar.',
    soldLifetime: 'Vendido (total)',
    outstanding: 'Pendiente de mis ventas',
    collected: 'Cobrado',
    commEarned: 'Comisión ganada',
    commPaid: 'Comisión pagada',
    commOwed: 'Comisión que me deben',
    invoices: 'Facturas',
    paymentsCollected: 'Pagos cobrados',
    commissions: 'Comisiones',
    noInvoices: 'Aún no hay facturas.',
    noMatch: 'Ninguna factura coincide con este filtro.',
    noPayments: 'Aún no se han cobrado pagos.',
    noCommissions: 'Sin comisiones.',
    showing: (s, t) => `Mostrando ${s} de ${t} facturas`,
    nInvoice: (n) => `${n} ${n === 1 ? 'factura' : 'facturas'}`,
    nOpen: (n) => `${n} ${n === 1 ? 'abierta' : 'abiertas'}`,
    nPayment: (n) => `${n} ${n === 1 ? 'pago' : 'pagos'}`,
    nCommission: (n) => `${n} ${n === 1 ? 'comisión' : 'comisiones'}`,
    f: {
      all: 'Todas',
      paid: 'Pagadas',
      open: 'Abiertas',
      other: 'Canceladas / reembolsadas',
    },
    period: {
      all: 'Todo el tiempo',
      this_month: 'Este mes',
      last_90: 'Últimos 90 días',
      this_year: 'Este año',
    },
    hInvoice: 'Factura',
    hDate: 'Fecha',
    hStatus: 'Estado',
    hTotal: 'Total',
    hPaid: 'Pagado',
    hOutstanding: 'Pendiente',
    hMethod: 'Método',
    hReference: 'Referencia',
    hAmount: 'Monto',
    hRole: 'Rol',
    st: {
      draft: 'Borrador',
      confirmed: 'Confirmada',
      paid: 'Pagada',
      partially_paid: 'Parcialmente pagada',
      refunded: 'Reembolsada',
      cancelled: 'Cancelada',
    },
    cPaid: 'Pagada',
    cPending: 'Pendiente',
  },
}

// ---- shared bits -------------------------------------------------------------

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string
  sub?: string
  accent?: string
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div
          className="mt-1 text-2xl font-semibold tabular-nums"
          style={accent ? { color: accent } : undefined}
        >
          {value}
        </div>
        {sub ? <div className="mt-1 text-xs text-muted-foreground">{sub}</div> : null}
      </CardContent>
    </Card>
  )
}

function CollapsibleSection({
  title,
  count,
  totalLabel,
  children,
}: {
  title: string
  count: number
  totalLabel: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
      >
        <div className="flex items-center gap-2">
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
              open ? 'rotate-180' : ''
            }`}
          />
          <span className="text-base font-semibold">{title}</span>
          <span className="text-xs text-muted-foreground">({count})</span>
        </div>
        <span className="shrink-0 text-sm font-medium tabular-nums text-muted-foreground">
          {totalLabel}
        </span>
      </button>
      {open ? <div className="border-t">{children}</div> : null}
    </Card>
  )
}

function sumCents<T>(rows: T[], pick: (row: T) => number): number {
  return rows.reduce((acc, r) => acc + (pick(r) || 0), 0)
}

function periodStartDate(period: PeriodFilter): Date | null {
  if (period === 'all') return null
  const now = new Date()
  if (period === 'this_month') return new Date(now.getFullYear(), now.getMonth(), 1)
  if (period === 'this_year') return new Date(now.getFullYear(), 0, 1)
  const d = new Date(now)
  d.setDate(d.getDate() - 90)
  return d
}

const STATUS_FILTER_ORDER: InvoiceStatusFilter[] = ['all', 'paid', 'open', 'other']
const PERIOD_ORDER: PeriodFilter[] = ['all', 'this_month', 'last_90', 'this_year']

// ---- panels ------------------------------------------------------------------

function InvoicesPanel({ sales, L }: { sales: PersonSaleRow[]; L: Strings }) {
  const [statusFilter, setStatusFilter] = useState<InvoiceStatusFilter>('all')
  const [period, setPeriod] = useState<PeriodFilter>('all')

  const filtered = useMemo(() => {
    const start = periodStartDate(period)
    return sales.filter((sale) => {
      if (statusFilter === 'paid' && sale.status !== 'paid') return false
      if (
        statusFilter === 'open' &&
        sale.status !== 'confirmed' &&
        sale.status !== 'partially_paid'
      )
        return false
      if (
        statusFilter === 'other' &&
        sale.status !== 'cancelled' &&
        sale.status !== 'refunded' &&
        sale.status !== 'draft'
      )
        return false
      if (start) {
        const d = new Date(sale.sold_at)
        if (!Number.isNaN(d.getTime()) && d < start) return false
      }
      return true
    })
  }, [sales, statusFilter, period])

  const total = useMemo(() => sumCents(sales, (x) => x.total_cents), [sales])
  const filterActive = statusFilter !== 'all' || period !== 'all'

  return (
    <CollapsibleSection title={L.invoices} count={sales.length} totalLabel={formatDOP(total)}>
      {sales.length === 0 ? (
        <div className="px-4 py-3 text-sm text-muted-foreground">{L.noInvoices}</div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 border-b bg-muted/30 px-4 py-3">
            <div className="flex flex-wrap gap-1">
              {STATUS_FILTER_ORDER.map((value) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={statusFilter === value ? 'default' : 'outline'}
                  onClick={() => setStatusFilter(value)}
                >
                  {L.f[value]}
                </Button>
              ))}
            </div>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as PeriodFilter)}
              className="ml-auto flex h-8 rounded-md border border-input bg-background px-2 text-sm shadow-sm"
            >
              {PERIOD_ORDER.map((p) => (
                <option key={p} value={p}>
                  {L.period[p]}
                </option>
              ))}
            </select>
          </div>

          {filterActive ? (
            <div className="px-4 py-2 text-xs text-muted-foreground">
              {L.showing(filtered.length, sales.length)}
            </div>
          ) : null}

          {filtered.length === 0 ? (
            <div className="px-4 py-3 text-sm text-muted-foreground">{L.noMatch}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{L.hInvoice}</TableHead>
                  <TableHead>{L.hDate}</TableHead>
                  <TableHead>{L.hStatus}</TableHead>
                  <TableHead className="text-right">{L.hTotal}</TableHead>
                  <TableHead className="text-right">{L.hPaid}</TableHead>
                  <TableHead className="text-right">{L.hOutstanding}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((sale) => (
                  <TableRow key={sale.id}>
                    <TableCell className="font-mono text-xs">
                      {sale.invoice_number ?? DASH}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(sale.sold_at)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={SALE_STATUS_STYLES[sale.status] ?? ''}
                      >
                        {L.st[sale.status] ?? sale.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatDOP(sale.total_cents)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatDOP(sale.paid_cents)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {sale.outstanding_cents > 0 ? (
                        <span className="text-rose-700">
                          {formatDOP(sale.outstanding_cents)}
                        </span>
                      ) : (
                        DASH
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </>
      )}
    </CollapsibleSection>
  )
}

function PaymentsPanel({ payments, L }: { payments: PersonPaymentRow[]; L: Strings }) {
  const total = useMemo(() => sumCents(payments, (x) => x.amount_cents), [payments])
  return (
    <CollapsibleSection
      title={L.paymentsCollected}
      count={payments.length}
      totalLabel={formatDOP(total)}
    >
      {payments.length === 0 ? (
        <div className="px-4 py-3 text-sm text-muted-foreground">{L.noPayments}</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{L.hDate}</TableHead>
              <TableHead>{L.hInvoice}</TableHead>
              <TableHead>{L.hMethod}</TableHead>
              <TableHead>{L.hReference}</TableHead>
              <TableHead className="text-right">{L.hAmount}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="text-muted-foreground">
                  {formatDate(p.paid_at)}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {p.invoice_number ?? DASH}
                </TableCell>
                <TableCell className="capitalize">{p.method}</TableCell>
                <TableCell className="text-muted-foreground">
                  {p.reference ?? DASH}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatDOP(p.amount_cents)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </CollapsibleSection>
  )
}

// ---- main --------------------------------------------------------------------

export function MySalesView({
  data,
  locale,
}: {
  data: MySellerFinancials
  locale: Locale
}) {
  const L = STRINGS[locale] ?? STRINGS.en

  if (!data.ok) {
    return (
      <Card>
        <CardContent className="pt-5 text-sm text-muted-foreground">
          {data.reason === 'not_seller' ? L.sellersOnly : L.loadErr}
        </CardContent>
      </Card>
    )
  }

  const commissionsTotal = useMemo(
    () => sumCents(data.commissions, (x) => x.amount_cents),
    [data.commissions],
  )

  return (
    <div className="space-y-4">
      {/* Sold + collected */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label={L.soldLifetime}
          value={formatDOP(data.lifetime_sold_cents)}
          sub={L.nInvoice(data.sold_count)}
        />
        <StatCard
          label={L.outstanding}
          value={formatDOP(data.sold_outstanding_cents)}
          sub={L.nOpen(data.open_count)}
          accent={data.sold_outstanding_cents > 0 ? '#e11d48' : undefined}
        />
        <StatCard
          label={L.collected}
          value={formatDOP(data.collected_cents)}
          sub={L.nPayment(data.payments_count)}
        />
      </div>

      {/* Commissions */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label={L.commEarned}
          value={formatDOP(data.earned_cents)}
          sub={L.nCommission(data.commission_count)}
        />
        <StatCard label={L.commPaid} value={formatDOP(data.commission_paid_cents)} />
        <StatCard
          label={L.commOwed}
          value={formatDOP(data.commission_owed_cents)}
          accent={data.commission_owed_cents > 0 ? '#d97706' : undefined}
        />
      </div>

      <InvoicesPanel sales={data.sales} L={L} />
      <PaymentsPanel payments={data.payments} L={L} />

      <CollapsibleSection
        title={L.commissions}
        count={data.commissions.length}
        totalLabel={formatDOP(commissionsTotal)}
      >
        {data.commissions.length === 0 ? (
          <div className="px-4 py-3 text-sm text-muted-foreground">{L.noCommissions}</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{L.hInvoice}</TableHead>
                <TableHead>{L.hDate}</TableHead>
                <TableHead>{L.hRole}</TableHead>
                <TableHead className="text-right">%</TableHead>
                <TableHead className="text-right">{L.hAmount}</TableHead>
                <TableHead>{L.hStatus}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.commissions.map((cm) => (
                <TableRow key={cm.id}>
                  <TableCell className="font-mono text-xs">
                    {cm.invoice_number ?? DASH}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(cm.sold_at)}
                  </TableCell>
                  <TableCell className="capitalize">{cm.earner_role}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {cm.percent}%
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatDOP(cm.amount_cents)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={
                        cm.status === 'paid'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-900'
                      }
                    >
                      {cm.status === 'paid' ? L.cPaid : L.cPending}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CollapsibleSection>
    </div>
  )
}
