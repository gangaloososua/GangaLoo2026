'use client'

// Reports - Inventory valuation view.
//
// Point-in-time snapshot of current stock. No business/everything toggle -
// inventory is inherently business. Money in CENTS.

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
import { AlertTriangle } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDOP } from '@/lib/format'
import type { InventoryReport } from '@/lib/inventory-report'

const BLUE = '#3b82f6'
const CAT_PALETTE = [
  '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899',
  '#14b8a6', '#f97316', '#6366f1', '#84cc16', '#94a3b8',
]

type Item = { name: string; value: number }

function compactDOP(cents: number): string {
  const n = (cents / 100).toLocaleString('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  })
  return `RD$${n}`
}

function topNWithOther(items: Item[], n: number): Item[] {
  const sorted = [...items].sort((a, b) => b.value - a.value)
  if (sorted.length <= n) return sorted
  const head = sorted.slice(0, n)
  const other = sorted.slice(n).reduce((s, x) => s + x.value, 0)
  return other > 0 ? [...head, { name: 'Other', value: other }] : head
}

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-semibold tabular-nums" style={accent ? { color: accent } : undefined}>
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

export function InventoryView({ data }: { data: InventoryReport }) {
  const catItems = topNWithOther(
    data.by_category.map((c) => ({ name: c.category, value: c.cost_cents })).filter((x) => x.value > 0),
    8,
  )
  const catTotal = catItems.reduce((s, x) => s + x.value, 0)

  const slowPct =
    data.cost_cents > 0 ? (data.slow_cost_cents / data.cost_cents) * 100 : 0

  return (
    <div className="space-y-6">
      {/* Headline cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          label="Units in stock"
          value={data.units.toLocaleString('en-US')}
          sub={`${data.by_category.length} categories`}
        />
        <StatCard
          label="On the way"
          value={data.incoming_units.toLocaleString('en-US')}
          sub={formatDOP(data.incoming_cost_cents)}
          accent="#f59e0b"
        />
        <StatCard label="Value at cost" value={formatDOP(data.cost_cents)} sub="what it cost you" />
        <StatCard label="Potential retail" value={formatDOP(data.retail_cents)} sub="if sold at list price" />
        <StatCard
          label="Unrealized margin"
          value={formatDOP(data.margin_cents)}
          sub="retail − cost"
          accent="#10b981"
        />
      </div>

      {/* Slow-stock callout */}
      {data.slow_cost_cents > 0 ? (
        <Card className="border-amber-300 bg-amber-50/60">
          <CardContent className="flex items-start gap-3 pt-5">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="text-sm">
              <span className="font-medium">Slow stock: {formatDOP(data.slow_cost_cents)}</span>{' '}
              ({data.slow_units.toLocaleString('en-US')} units, {slowPct.toFixed(0)}% of stock value) has been
              sitting for 120+ days. That's cash tied up on the shelf — worth reviewing for promotions or markdowns.
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Category donut + warehouse bar */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Value by category</CardTitle>
          </CardHeader>
          <CardContent>
            {catTotal === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">No stock.</p>
            ) : (
              <div className="flex flex-col items-center gap-4 sm:flex-row">
                <div className="h-48 w-48 shrink-0">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <PieChart>
                      <Pie data={catItems} dataKey="value" nameKey="name" innerRadius={52} outerRadius={84} paddingAngle={1} stroke="none">
                        {catItems.map((_, i) => (
                          <Cell key={i} fill={CAT_PALETTE[i % CAT_PALETTE.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<CurrencyTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="max-h-48 w-full space-y-1 overflow-y-auto pr-1 text-sm">
                  {catItems.map((it, i) => (
                    <div key={it.name} className="flex items-center gap-2">
                      <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: CAT_PALETTE[i % CAT_PALETTE.length] }} />
                      <span className="truncate">{it.name}</span>
                      <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">{formatDOP(it.value)}</span>
                      <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                        {((it.value / catTotal) * 100).toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Value by warehouse</CardTitle>
          </CardHeader>
          <CardContent>
            {data.by_warehouse.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">No stock.</p>
            ) : (
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <BarChart data={data.by_warehouse} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                    <XAxis dataKey="warehouse" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => compactDOP(v)} width={64} />
                    <Tooltip content={<CurrencyTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                    <Bar dataKey="cost_cents" name="Value" fill={BLUE} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top products */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Top products by value</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <span>Product</span>
            <span className="w-16 text-right">Units</span>
            <span className="w-28 text-right">Value</span>
          </div>
          {data.top_products.length === 0 ? (
            <div className="px-4 py-3 text-sm text-muted-foreground">No stock.</div>
          ) : (
            <div className="divide-y">
              {data.top_products.map((p, i) => (
                <div key={(p.sku ?? '') + i} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate">{p.name ?? '—'}</div>
                    {p.sku ? <div className="truncate text-xs text-muted-foreground">{p.sku}</div> : null}
                  </div>
                  <span className="w-16 text-right tabular-nums text-muted-foreground">
                    {p.units.toLocaleString('en-US')}
                  </span>
                  <span className="w-28 text-right tabular-nums">{formatDOP(p.cost_cents)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
