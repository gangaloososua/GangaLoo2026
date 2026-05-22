'use client'

// Reports - Receivables aging view.
//
// Point-in-time snapshot of open receivables, aged from confirmed_at. Money in
// CENTS. Buckets are colored green -> red as they age; the invoice table lists
// each open sale most-overdue first with a colored bucket badge.

import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDOP, formatDate } from '@/lib/format'
import type { ReceivablesAging } from '@/lib/receivables-aging'

// Green (fresh) -> red (old)
const BUCKET_COLOR: Record<string, string> = {
  Current: '#10b981',
  '1-30': '#84cc16',
  '31-60': '#f59e0b',
  '61-90': '#f97316',
  '90+': '#ef4444',
}

function bucketColor(b: string): string {
  return BUCKET_COLOR[b] ?? '#94a3b8'
}

function compactDOP(cents: number): string {
  const n = (cents / 100).toLocaleString('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  })
  return `RD$${n}`
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

function BucketTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload
  if (!row) return null
  return (
    <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md">
      <div className="font-medium">{row.bucket === 'Current' ? 'Current' : `${row.bucket} days`}</div>
      <div className="tabular-nums text-muted-foreground">
        {formatDOP(row.amount_cents)} · {row.count} {row.count === 1 ? 'invoice' : 'invoices'}
      </div>
    </div>
  )
}

export function ReceivablesView({ data }: { data: ReceivablesAging }) {
  // The 90+ bucket is the worry; surface it.
  const over90 = data.buckets.find((b) => b.bucket === '90+')?.amount_cents ?? 0

  return (
    <div className="space-y-6">
      {/* Headline */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="Total outstanding"
          value={formatDOP(data.total_outstanding_cents)}
          sub="customers owe you"
          accent="#f59e0b"
        />
        <StatCard
          label="Open invoices"
          value={data.open_count.toLocaleString('en-US')}
          sub="confirmed + partially paid"
        />
        <StatCard
          label="Over 90 days"
          value={formatDOP(over90)}
          sub="most at risk"
          accent={over90 > 0 ? '#ef4444' : undefined}
        />
      </div>

      {/* Aging buckets bar */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Outstanding by age</CardTitle>
          <p className="text-xs text-muted-foreground">Days overdue, from each invoice&apos;s confirmed date.</p>
        </CardHeader>
        <CardContent>
          {data.total_outstanding_cents === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">Nothing outstanding — all paid up.</p>
          ) : (
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart data={data.buckets} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                  <XAxis dataKey="bucket" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => compactDOP(v)} width={64} />
                  <Tooltip content={<BucketTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                  <Bar dataKey="amount_cents" name="Outstanding" radius={[3, 3, 0, 0]}>
                    {data.buckets.map((b, i) => (
                      <Cell key={i} fill={bucketColor(b.bucket)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invoice table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Open invoices</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 border-b px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <span>Customer / invoice</span>
            <span className="hidden w-24 text-right sm:block">Confirmed</span>
            <span className="w-20 text-right">Overdue</span>
            <span className="w-28 text-right">Outstanding</span>
          </div>
          {data.invoices.length === 0 ? (
            <div className="px-4 py-3 text-sm text-muted-foreground">Nothing outstanding.</div>
          ) : (
            <div className="divide-y">
              {data.invoices.map((inv, i) => (
                <div
                  key={(inv.invoice ?? '') + i}
                  className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 px-4 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <div className="truncate">{inv.customer}</div>
                    <div className="flex items-center gap-2">
                      <span className="truncate text-xs text-muted-foreground">{inv.invoice ?? '—'}</span>
                      <span
                        className="rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
                        style={{ background: bucketColor(inv.bucket) }}
                      >
                        {inv.bucket === 'Current' ? 'Current' : `${inv.bucket}d`}
                      </span>
                    </div>
                  </div>
                  <span className="hidden w-24 text-right text-xs tabular-nums text-muted-foreground sm:block">
                    {inv.confirmed_at ? formatDate(inv.confirmed_at) : '—'}
                  </span>
                  <span className="w-20 text-right tabular-nums text-muted-foreground">
                    {inv.days_overdue}d
                  </span>
                  <span className="w-28 text-right tabular-nums">{formatDOP(inv.outstanding_cents)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
