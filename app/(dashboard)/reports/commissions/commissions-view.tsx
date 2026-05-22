'use client'

// Reports - Commission statements view.
//
// Period-based. Headline cards (earned / paid / owed), a by-role split (sellers
// vs distributors), a per-earner paid-vs-owed stacked bar (the two stack to the
// earner's earned total), and the earner table. Money in CENTS. Void
// commissions are already excluded by the RPC.

import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDOP } from '@/lib/format'
import type { CommissionsReport } from '@/lib/commissions-report'

const EMERALD = '#10b981'
const AMBER = '#f59e0b'

function compactDOP(cents: number): string {
  const n = (cents / 100).toLocaleString('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  })
  return `RD$${n}`
}

function titleRole(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1) + 's'
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
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: p.color ?? p.fill }} />
          <span className="text-muted-foreground">{p.name}</span>
          <span className="ml-auto tabular-nums">{formatDOP(Math.abs(p.value))}</span>
        </div>
      ))}
    </div>
  )
}

export function CommissionsView({
  report,
  periodLabel,
}: {
  report: CommissionsReport
  periodLabel: string
}) {
  const r = report

  // Per-earner chart data; disambiguate same name across roles.
  const chartData = r.by_earner.map((e) => ({
    label: e.role === 'seller' ? e.earner : `${e.earner} (${e.role})`,
    paid_cents: e.paid_cents,
    owed_cents: e.owed_cents,
  }))

  return (
    <div className="space-y-6">
      {/* Headline cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Earned" value={formatDOP(r.earned_cents)} sub={periodLabel} />
        <StatCard label="Paid" value={formatDOP(r.paid_cents)} sub="already paid out" accent={EMERALD} />
        <StatCard label="Owed" value={formatDOP(r.owed_cents)} sub="pending payout" accent={r.owed_cents > 0 ? AMBER : undefined} />
      </div>

      {/* By role */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">By role</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 border-b px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <span>Role</span>
            <span className="w-28 text-right">Earned</span>
            <span className="w-28 text-right">Paid</span>
            <span className="w-28 text-right">Owed</span>
          </div>
          {r.by_role.length === 0 ? (
            <div className="px-4 py-3 text-sm text-muted-foreground">No commissions in this period.</div>
          ) : (
            <div className="divide-y">
              {r.by_role.map((role) => (
                <div key={role.role} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 px-4 py-2 text-sm">
                  <span>{titleRole(role.role)}</span>
                  <span className="w-28 text-right tabular-nums">{formatDOP(role.earned_cents)}</span>
                  <span className="w-28 text-right tabular-nums text-muted-foreground">{formatDOP(role.paid_cents)}</span>
                  <span className="w-28 text-right tabular-nums" style={role.owed_cents > 0 ? { color: AMBER } : undefined}>
                    {formatDOP(role.owed_cents)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Per-earner paid vs owed */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Per earner — paid vs owed</CardTitle>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ background: EMERALD }} /> Paid
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ background: AMBER }} /> Owed
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No commissions in this period.</p>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => compactDOP(v)} width={64} />
                  <Tooltip content={<CurrencyTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                  <Bar dataKey="paid_cents" name="Paid" stackId="c" fill={EMERALD} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="owed_cents" name="Owed" stackId="c" fill={AMBER} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Earner table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Statements</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 border-b px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <span>Earner</span>
            <span className="hidden w-16 text-right sm:block">Count</span>
            <span className="w-28 text-right">Earned</span>
            <span className="w-28 text-right">Paid</span>
            <span className="w-28 text-right">Owed</span>
          </div>
          {r.by_earner.length === 0 ? (
            <div className="px-4 py-3 text-sm text-muted-foreground">No commissions in this period.</div>
          ) : (
            <div className="divide-y">
              {r.by_earner.map((e, i) => (
                <div key={e.earner + e.role + i} className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-3 px-4 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate">{e.earner}</div>
                    {e.role !== 'seller' ? (
                      <div className="text-xs text-muted-foreground">{e.role}</div>
                    ) : null}
                  </div>
                  <span className="hidden w-16 text-right tabular-nums text-muted-foreground sm:block">{e.count}</span>
                  <span className="w-28 text-right tabular-nums">{formatDOP(e.earned_cents)}</span>
                  <span className="w-28 text-right tabular-nums text-muted-foreground">{formatDOP(e.paid_cents)}</span>
                  <span className="w-28 text-right tabular-nums" style={e.owed_cents > 0 ? { color: AMBER } : undefined}>
                    {formatDOP(e.owed_cents)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
