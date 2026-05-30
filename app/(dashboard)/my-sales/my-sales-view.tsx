'use client'

// Seller self-service "My sales" view.
//
// Mirrors the owner's "As seller" panel: always-visible stat cards, then
// collapsible Invoices / Payments / Commissions sections (closed by default,
// count + total on the bar). Invoices carry a status + period filter. Consumes
// MySellerFinancials from the self-scoped RPC. Money in CENTS.

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
const SALE_STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  confirmed: 'Confirmed',
  paid: 'Paid',
  partially_paid: 'Partially paid',
  refunded: 'Refunded',
  cancelled: 'Cancelled',
}

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

type InvoiceStatusFilter = 'all' | 'paid' | 'open' | 'other'
type PeriodFilter = 'all' | 'this_month' | 'last_90' | 'this_year'

const PERIOD_LABEL: Record<PeriodFilter, string> = {
  all: 'All time',
  this_month: 'This month',
  last_90: 'Last 90 days',
  this_year: 'This year',
}

const STATUS_FILTERS: Array<{ value: InvoiceStatusFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'paid', label: 'Paid' },
  { value: 'open', label: 'Open' },
  { value: 'other', label: 'Cancelled / refunded' },
]

function periodStartDate(period: PeriodFilter): Date | null {
  if (period === 'all') return null
  const now = new Date()
  if (period === 'this_month') return new Date(now.getFullYear(), now.getMonth(), 1)
  if (period === 'this_year') return new Date(now.getFullYear(), 0, 1)
  const d = new Date(now)
  d.setDate(d.getDate() - 90)
  return d
}

function InvoicesPanel({ sales }: { sales: PersonSaleRow[] }) {
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
    <CollapsibleSection title="Invoices" count={sales.length} totalLabel={formatDOP(total)}>
      {sales.length === 0 ? (
        <div className="px-4 py-3 text-sm text-muted-foreground">No invoices yet.</div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 border-b bg-muted/30 px-4 py-3">
            <div className="flex flex-wrap gap-1">
              {STATUS_FILTERS.map((f) => (
                <Button
                  key={f.value}
                  type="button"
                  size="sm"
                  variant={statusFilter === f.value ? 'default' : 'outline'}
                  onClick={() => setStatusFilter(f.value)}
                >
                  {f.label}
                </Button>
              ))}
            </div>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as PeriodFilter)}
              className="ml-auto flex h-8 rounded-md border border-input bg-background px-2 text-sm shadow-sm"
            >
              {(Object.keys(PERIOD_LABEL) as PeriodFilter[]).map((p) => (
                <option key={p} value={p}>
                  {PERIOD_LABEL[p]}
                </option>
              ))}
            </select>
          </div>

          {filterActive ? (
            <div className="px-4 py-2 text-xs text-muted-foreground">
              Showing {filtered.length} of {sales.length} invoices
            </div>
          ) : null}

          {filtered.length === 0 ? (
            <div className="px-4 py-3 text-sm text-muted-foreground">
              No invoices match this filter.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
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
                        {SALE_STATUS_LABEL[sale.status] ?? sale.status}
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

function PaymentsPanel({ payments }: { payments: PersonPaymentRow[] }) {
  const total = useMemo(() => sumCents(payments, (x) => x.amount_cents), [payments])
  return (
    <CollapsibleSection
      title="Payments collected"
      count={payments.length}
      totalLabel={formatDOP(total)}
    >
      {payments.length === 0 ? (
        <div className="px-4 py-3 text-sm text-muted-foreground">
          No payments collected yet.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Invoice</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead className="text-right">Amount</TableHead>
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

export function MySalesView({ data }: { data: MySellerFinancials }) {
  if (!data.ok) {
    return (
      <Card>
        <CardContent className="pt-5 text-sm text-muted-foreground">
          {data.reason === 'not_seller'
            ? 'This view is for sellers only.'
            : 'We could not load your account. Please sign out and back in.'}
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
          label="Sold (lifetime)"
          value={formatDOP(data.lifetime_sold_cents)}
          sub={`${data.sold_count} ${data.sold_count === 1 ? 'invoice' : 'invoices'}`}
        />
        <StatCard
          label="Outstanding on my sales"
          value={formatDOP(data.sold_outstanding_cents)}
          sub={`${data.open_count} open`}
          accent={data.sold_outstanding_cents > 0 ? '#e11d48' : undefined}
        />
        <StatCard
          label="Collected"
          value={formatDOP(data.collected_cents)}
          sub={`${data.payments_count} ${data.payments_count === 1 ? 'payment' : 'payments'}`}
        />
      </div>

      {/* Commissions */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="Commission earned"
          value={formatDOP(data.earned_cents)}
          sub={`${data.commission_count} ${data.commission_count === 1 ? 'commission' : 'commissions'}`}
        />
        <StatCard label="Commission paid" value={formatDOP(data.commission_paid_cents)} />
        <StatCard
          label="Commission owed to me"
          value={formatDOP(data.commission_owed_cents)}
          accent={data.commission_owed_cents > 0 ? '#d97706' : undefined}
        />
      </div>

      <InvoicesPanel sales={data.sales} />
      <PaymentsPanel payments={data.payments} />

      <CollapsibleSection
        title="Commissions"
        count={data.commissions.length}
        totalLabel={formatDOP(commissionsTotal)}
      >
        {data.commissions.length === 0 ? (
          <div className="px-4 py-3 text-sm text-muted-foreground">No commissions.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">%</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
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
                      {cm.status === 'paid' ? 'Paid' : 'Pending'}
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
