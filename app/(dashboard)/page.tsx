import { ArrowDownRight, ArrowUpRight } from 'lucide-react'

import { requireOwner } from '@/lib/auth/guard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatDOP, formatDate } from '@/lib/format'
import {
  computePeriods,
  fetchDashboardOverview,
  type DashboardPeriodMode,
} from '@/lib/dashboard'
import { DashboardPeriodSwitcher } from './dashboard-period-switcher'

export const dynamic = 'force-dynamic'

const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

function parseMode(raw: string | undefined): DashboardPeriodMode {
  if (raw === 'last-30' || raw === 'this-year') return raw
  return 'this-month'
}

// Non-DOP accounts can't use formatDOP (it's hard-wired to RD$); small helper.
function formatMoney(cents: number, currency: string): string {
  if (currency === 'DOP') return formatDOP(cents)
  const sym = currency === 'EUR' ? '€' : currency === 'USD' ? '$' : ''
  const n = (cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return sym ? `${sym}${n}` : `${n} ${currency}`
}

function pct(cur: number, prev: number): number | null {
  if (prev === 0) return null
  return ((cur - prev) / Math.abs(prev)) * 100
}

function Delta({
  cur,
  prev,
  goodWhenUp = true,
}: {
  cur: number
  prev: number
  goodWhenUp?: boolean
}) {
  const p = pct(cur, prev)
  if (p === null) {
    return <span className="text-xs text-muted-foreground">no prior data</span>
  }
  const up = p >= 0
  const good = up === goodWhenUp
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span
      className={
        'inline-flex items-center text-xs font-medium ' +
        (good ? 'text-emerald-600' : 'text-rose-600')
      }
    >
      <Icon className="mr-0.5 h-3 w-3" />
      {Math.abs(p).toFixed(1)}%
    </span>
  )
}

function StatCard({
  label,
  value,
  sub,
  delta,
}: {
  label: string
  value: string
  sub?: React.ReactNode
  delta?: React.ReactNode
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
        <div className="mt-1 flex items-center gap-2">
          {delta}
          {sub ? <span className="text-xs text-muted-foreground">{sub}</span> : null}
        </div>
      </CardContent>
    </Card>
  )
}

function statusBadge(status: string) {
  switch (status) {
    case 'paid':
      return <Badge variant="default" className="bg-green-600 text-white hover:bg-green-600">Paid</Badge>
    case 'partially_paid':
      return <Badge variant="outline" className="border-amber-500 text-amber-700">Partial</Badge>
    case 'confirmed':
      return <Badge variant="secondary">Confirmed</Badge>
    case 'cancelled':
      return <Badge variant="outline" className="border-red-400 text-red-700">Cancelled</Badge>
    case 'refunded':
      return <Badge variant="outline" className="text-muted-foreground">Refunded</Badge>
    default:
      return <Badge variant="secondary">{status}</Badge>
  }
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  await requireOwner()
  const sp = await searchParams
  const mode = parseMode(sp.period)
  const periods = computePeriods(mode)
  const d = await fetchDashboardOverview(periods)

  const cur = d.current
  const prev = d.previous

  // Gross margin coverage note
  const gmCovered = cur.gm_costed_sales
  const gmTotal = cur.gm_total_sales
  const gmNote =
    gmTotal === 0
      ? 'no sales in period'
      : `based on ${gmCovered} of ${gmTotal} sales with cost`

  // Inventory coverage note
  const invCovered = d.inventory.lots_costed
  const invTotal = d.inventory.lots_total
  const invNote =
    invTotal === 0
      ? 'no stock'
      : `${invCovered} of ${invTotal} lots costed`

  // Chart scaling
  const trend = d.monthly_trend
  const trendMax = Math.max(
    1,
    ...trend.map((m) => Math.max(m.revenue_cents, m.expense_cents)),
  )

  const topCats = d.expenses_by_category.slice(0, 8)
  const catMax = Math.max(1, ...topCats.map((c) => c.amount_cents))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Overview for{' '}
            <span className="font-medium text-foreground">{periods.label}</span>{' '}
            (vs {periods.prevLabel}).
          </p>
        </div>
        <DashboardPeriodSwitcher current={mode} />
      </div>

      {/* Primary stat cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Sales"
          value={formatDOP(cur.sales_total_cents)}
          sub={`${cur.sales_count} ${cur.sales_count === 1 ? 'sale' : 'sales'}`}
          delta={<Delta cur={cur.sales_total_cents} prev={prev.sales_total_cents} />}
        />
        <StatCard
          label="Revenue"
          value={formatDOP(cur.revenue_cents)}
          sub="money in (ledger)"
          delta={<Delta cur={cur.revenue_cents} prev={prev.revenue_cents} />}
        />
        <StatCard
          label="Expenses"
          value={formatDOP(cur.expenses_cents)}
          sub="money out (ledger)"
          delta={<Delta cur={cur.expenses_cents} prev={prev.expenses_cents} goodWhenUp={false} />}
        />
        <StatCard
          label="Net (cash view)"
          value={formatDOP(cur.net_cents)}
          sub="revenue − expenses"
          delta={<Delta cur={cur.net_cents} prev={prev.net_cents} />}
        />
      </div>

      {/* Secondary stat cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Cash on hand"
          value={formatDOP(d.cash.total_cents)}
          sub={`biz ${formatDOP(d.cash.business_cents)} · priv ${formatDOP(d.cash.private_cents)}`}
        />
        <StatCard
          label="Receivables"
          value={formatDOP(d.receivables_cents)}
          sub="confirmed + partial, unpaid"
        />
        <StatCard
          label="Commissions owed"
          value={formatDOP(d.open_commissions_cents)}
          sub="pending payouts"
        />
        <StatCard
          label="Gross margin (sales)"
          value={formatDOP(cur.gross_margin_cents)}
          sub={gmNote}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Revenue vs expenses trend */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Revenue vs expenses</CardTitle>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-sm bg-emerald-500" /> Revenue
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-sm bg-rose-400" /> Expenses
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {trend.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No data yet.</p>
            ) : (
              <div className="flex h-44 items-end gap-3">
                {trend.map((m) => {
                  const [, mm] = m.month.split('-')
                  const lbl = MONTH_SHORT[Number(mm) - 1] ?? m.month
                  return (
                    <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                      <div className="flex h-full w-full items-end justify-center gap-1">
                        <div
                          className="w-3 rounded-t bg-emerald-500"
                          style={{ height: `${(m.revenue_cents / trendMax) * 100}%` }}
                          title={`Revenue ${formatDOP(m.revenue_cents)}`}
                        />
                        <div
                          className="w-3 rounded-t bg-rose-400"
                          style={{ height: `${(m.expense_cents / trendMax) * 100}%` }}
                          title={`Expenses ${formatDOP(m.expense_cents)}`}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">{lbl}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Expenses by category */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top expenses ({periods.label})</CardTitle>
          </CardHeader>
          <CardContent>
            {topCats.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No expenses in this period.
              </p>
            ) : (
              <div className="space-y-2.5">
                {topCats.map((c) => (
                  <div key={c.name} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="truncate pr-2">{c.name}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {formatDOP(c.amount_cents)}
                      </span>
                    </div>
                    <div className="h-2 w-full rounded bg-muted">
                      <div
                        className="h-2 rounded bg-rose-400"
                        style={{ width: `${(c.amount_cents / catMax) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Inventory */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Inventory</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Units in stock</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">
                {d.inventory.units.toLocaleString('en-US')}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Stock value</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">
                {formatDOP(d.inventory.value_cents)}
              </div>
              <div className="text-xs text-muted-foreground">{invNote}</div>
            </div>
            <div>
              <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">By warehouse</div>
              <div className="space-y-1">
                {d.stock_by_warehouse.length === 0 ? (
                  <span className="text-sm text-muted-foreground">No stock.</span>
                ) : (
                  d.stock_by_warehouse.map((w) => (
                    <div key={w.warehouse} className="flex items-center justify-between text-sm">
                      <span className="truncate pr-2">{w.warehouse}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {w.units.toLocaleString('en-US')} u · {formatDOP(w.value_cents)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent sales + accounts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Recent sales</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {d.recent_sales.length === 0 ? (
              <p className="px-6 py-6 text-sm text-muted-foreground">No sales yet.</p>
            ) : (
              <div className="divide-y">
                {d.recent_sales.map((s, i) => {
                  const owed = Math.max(s.total_cents - s.paid_cents, 0)
                  return (
                    <div key={(s.invoice ?? '') + i} className="flex items-center justify-between px-6 py-2.5">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{s.invoice ?? '—'}</span>
                          {statusBadge(s.status)}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {s.customer ?? 'Walk-in / no customer'} · {formatDate(s.sold_at)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="tabular-nums">{formatDOP(s.total_cents)}</div>
                        {owed > 0 ? (
                          <div className="text-xs text-rose-600 tabular-nums">
                            owes {formatDOP(owed)}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Account balances</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {d.accounts.map((a) => (
                <div key={a.name} className="flex items-center justify-between px-6 py-2">
                  <div className="min-w-0">
                    <span className="truncate">{a.name}</span>
                    {a.scope === 'private' ? (
                      <span className="ml-2 text-xs text-muted-foreground">(private)</span>
                    ) : null}
                  </div>
                  <span className="tabular-nums">{formatMoney(a.balance_cents, a.currency)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
