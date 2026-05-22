'use client'

// Reports - Sales analysis view.
//
// Period-based. Headline cards (revenue, # sales, avg sale, and a MUTED
// preliminary gross-margin stat), a sales-over-time trend chart, and five
// breakdowns: seller, customer, product, category. Money in CENTS.
//
// Margin is shown muted with a coverage note - cogs_cents is missing/unreliable
// on most legacy sales, so it is not a headline figure.

import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDOP } from '@/lib/format'
import type { SalesReport } from '@/lib/sales-report'

const INDIGO = '#6366f1'
const CAT_PALETTE = [
  '#6366f1', '#10b981', '#f59e0b', '#3b82f6', '#ec4899',
  '#14b8a6', '#f97316', '#8b5cf6', '#84cc16', '#94a3b8',
]
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

type Item = { name: string; value: number }

function compactDOP(cents: number): string {
  const n = (cents / 100).toLocaleString('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  })
  return `RD$${n}`
}

function fmtBucket(b: string): string {
  if (b.length === 7) {
    const mm = Number(b.slice(5, 7))
    return MONTHS[mm - 1] ?? b
  }
  return b.slice(8, 10) // day-of-month
}

function topNWithOther(items: Item[], n: number): Item[] {
  const sorted = [...items].sort((a, b) => b.value - a.value)
  if (sorted.length <= n) return sorted
  const head = sorted.slice(0, n)
  const other = sorted.slice(n).reduce((s, x) => s + x.value, 0)
  return other > 0 ? [...head, { name: 'Other', value: other }] : head
}

function StatCard({
  label,
  value,
  sub,
  muted,
}: {
  label: string
  value: string
  sub?: string
  muted?: boolean
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
        <div
          className={
            'mt-1 text-2xl font-semibold tabular-nums ' + (muted ? 'text-muted-foreground' : '')
          }
        >
          {value}
        </div>
        {sub ? <div className="mt-1 text-xs text-muted-foreground">{sub}</div> : null}
      </CardContent>
    </Card>
  )
}

function CurrencyTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md">
      {label ? <div className="mb-0.5 font-medium">{label}</div> : null}
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: p.color ?? p.payload?.fill }} />
          <span className="text-muted-foreground">{p.name}</span>
          <span className="ml-auto tabular-nums">{formatDOP(Math.abs(p.value))}</span>
        </div>
      ))}
    </div>
  )
}

// Ranked list with inline bars (sellers).
function RankedBars({
  rows,
}: {
  rows: { name: string; revenue_cents: number; count: number }[]
}) {
  const max = Math.max(1, ...rows.map((r) => r.revenue_cents))
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No sales in this period.</p>
  }
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.name} className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="truncate pr-2">{r.name}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {formatDOP(r.revenue_cents)}{' '}
              <span className="text-xs">· {r.count}</span>
            </span>
          </div>
          <div className="h-2 w-full rounded bg-muted">
            <div
              className="h-2 rounded"
              style={{ width: `${(r.revenue_cents / max) * 100}%`, background: INDIGO }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

export function SalesView({
  report,
  periodLabel,
}: {
  report: SalesReport
  periodLabel: string
}) {
  const r = report
  const marginNote =
    r.total_sales === 0
      ? 'no sales'
      : `preliminary · ${r.costed_sales} of ${r.total_sales} sales costed`

  const catItems = topNWithOther(
    r.by_category.map((c) => ({ name: c.name, value: c.revenue_cents })).filter((x) => x.value > 0),
    8,
  )
  const catTotal = catItems.reduce((s, x) => s + x.value, 0)

  return (
    <div className="space-y-6">
      {/* Headline cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Revenue" value={formatDOP(r.revenue_cents)} sub={periodLabel} />
        <StatCard
          label="Sales"
          value={r.sales_count.toLocaleString('en-US')}
          sub={r.sales_count === 1 ? 'sale' : 'sales'}
        />
        <StatCard label="Avg sale" value={formatDOP(r.avg_sale_cents)} sub="per sale" />
        <StatCard label="Gross margin" value={formatDOP(r.margin_cents)} sub={marginNote} muted />
      </div>

      {/* Trend */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Sales over time</CardTitle>
        </CardHeader>
        <CardContent>
          {r.trend.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No sales in this period.</p>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart
                  data={r.trend.map((t) => ({ ...t, label: fmtBucket(t.bucket) }))}
                  margin={{ top: 8, right: 8, left: 8, bottom: 8 }}
                >
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => compactDOP(v)} width={64} />
                  <Tooltip content={<CurrencyTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                  <Bar dataKey="revenue_cents" name="Revenue" fill={INDIGO} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Seller + Category */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">By seller</CardTitle>
          </CardHeader>
          <CardContent>
            <RankedBars rows={r.by_seller} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">By category</CardTitle>
          </CardHeader>
          <CardContent>
            {catTotal === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">No sales in this period.</p>
            ) : (
              <div className="flex flex-col items-center gap-4 sm:flex-row">
                <div className="h-44 w-44 shrink-0">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <PieChart>
                      <Pie data={catItems} dataKey="value" nameKey="name" innerRadius={48} outerRadius={78} paddingAngle={1} stroke="none">
                        {catItems.map((_, i) => (
                          <Cell key={i} fill={CAT_PALETTE[i % CAT_PALETTE.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<CurrencyTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="max-h-44 w-full space-y-1 overflow-y-auto pr-1 text-sm">
                  {catItems.map((it, i) => (
                    <div key={it.name} className="flex items-center gap-2">
                      <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: CAT_PALETTE[i % CAT_PALETTE.length] }} />
                      <span className="truncate">{it.name}</span>
                      <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">{formatDOP(it.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top products + Top customers */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top products</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <span>Product</span>
              <span className="w-14 text-right">Units</span>
              <span className="w-28 text-right">Revenue</span>
            </div>
            {r.by_product.length === 0 ? (
              <div className="px-4 py-3 text-sm text-muted-foreground">No sales in this period.</div>
            ) : (
              <div className="divide-y">
                {r.by_product.map((p, i) => (
                  <div key={(p.sku ?? '') + i} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-2 text-sm">
                    <div className="min-w-0">
                      <div className="truncate">{p.name}</div>
                      {p.sku ? <div className="truncate text-xs text-muted-foreground">{p.sku}</div> : null}
                    </div>
                    <span className="w-14 text-right tabular-nums text-muted-foreground">
                      {Number(p.units).toLocaleString('en-US')}
                    </span>
                    <span className="w-28 text-right tabular-nums">{formatDOP(p.revenue_cents)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top customers</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <span>Customer</span>
              <span className="w-14 text-right">Sales</span>
              <span className="w-28 text-right">Revenue</span>
            </div>
            {r.by_customer.length === 0 ? (
              <div className="px-4 py-3 text-sm text-muted-foreground">No sales in this period.</div>
            ) : (
              <div className="divide-y">
                {r.by_customer.map((c, i) => (
                  <div key={c.name + i} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-2 text-sm">
                    <span className="truncate">{c.name}</span>
                    <span className="w-14 text-right tabular-nums text-muted-foreground">{c.count}</span>
                    <span className="w-28 text-right tabular-nums">{formatDOP(c.revenue_cents)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">
        Product &amp; category totals come from line items (excluding shipping, tax and order-level
        discounts), so they total slightly less than overall revenue.
      </p>
    </div>
  )
}
