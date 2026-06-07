'use client'

// Reports - Balance Sheet interactive view.
//
// Point-in-time snapshot. The Business/Everything toggle adjusts CASH only
// (money accounts carry scope); inventory, receivables and supplier bills are
// inherently business and don't change. Equity = Assets - Liabilities.
//
// Foreign-currency cash (EUR/USD) is converted to pesos inside the RPC; the
// rates applied arrive in data.cash_rates and are shown as a note (Round 65a).
//
// Money is in CENTS throughout.

import { useState } from 'react'
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
import { Button } from '@/components/ui/button'
import { formatDOP } from '@/lib/format'
import type { BalanceSheet } from '@/lib/balance-sheet'

const EMERALD = '#10b981'
const ROSE = '#fb7185'
const INDIGO = '#6366f1'
const BLUE = '#3b82f6'
const AMBER = '#f59e0b'

type Scope = 'business' | 'all'

function compactDOP(cents: number): string {
  const n = (cents / 100).toLocaleString('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  })
  return `RD$${n}`
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

function CurrencyTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md">
      {label ? <div className="mb-0.5 font-medium">{label}</div> : null}
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-sm"
            style={{ background: p.color ?? p.payload?.fill }}
          />
          <span className="text-muted-foreground">{p.name}</span>
          <span className="ml-auto tabular-nums">{formatDOP(Math.abs(p.value))}</span>
        </div>
      ))}
    </div>
  )
}

function Row({
  name,
  amount,
  indent,
  muted,
  bold,
  accent,
}: {
  name: string
  amount: number
  indent?: boolean
  muted?: boolean
  bold?: boolean
  accent?: string
}) {
  return (
    <div
      className={
        'flex items-center justify-between px-4 py-2 text-sm ' +
        (bold ? 'font-semibold ' : '') +
        (indent ? 'pl-8 ' : '')
      }
    >
      <span className={'truncate ' + (muted ? 'text-muted-foreground' : '')}>{name}</span>
      <span
        className={'tabular-nums ' + (muted ? 'text-muted-foreground' : '')}
        style={accent ? { color: accent } : undefined}
      >
        {formatDOP(amount)}
      </span>
    </div>
  )
}

export function BalanceSheetView({ data }: { data: BalanceSheet }) {
  const [scope, setScope] = useState<Scope>('business')

  const cash = scope === 'business' ? data.cash.business_cents : data.cash.all_cents
  const inventory = data.inventory_cents
  const receivables = data.receivables_cents
  const assets = cash + inventory + receivables

  const supplier = data.supplier_owed.total_cents
  const commissions = data.commissions_owed_cents
  const liabilities = supplier + commissions

  const equity = assets - liabilities

  // Foreign-cash conversion note (Round 65a). Only show rates that are set.
  const fxParts: string[] = []
  if (data.cash_rates?.eur) fxParts.push(`EUR ${data.cash_rates.eur.toFixed(2)}`)
  if (data.cash_rates?.usd) fxParts.push(`US$ ${data.cash_rates.usd.toFixed(2)}`)

  const assetMix = [
    { name: 'Cash', value: cash, fill: EMERALD },
    { name: 'Inventory', value: inventory, fill: BLUE },
    { name: 'Receivables', value: receivables, fill: AMBER },
  ].filter((x) => x.value > 0)
  const assetTotal = assetMix.reduce((s, x) => s + x.value, 0)

  const ale = [
    { name: 'Assets', value: assets, fill: EMERALD },
    { name: 'Liabilities', value: liabilities, fill: ROSE },
    { name: 'Equity', value: equity, fill: INDIGO },
  ]

  return (
    <div className="space-y-6">
      {/* Toggle + note */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-md border bg-card p-0.5">
          <Button
            type="button"
            size="sm"
            variant={scope === 'business' ? 'default' : 'ghost'}
            className="h-8"
            onClick={() => setScope('business')}
          >
            Business
          </Button>
          <Button
            type="button"
            size="sm"
            variant={scope === 'all' ? 'default' : 'ghost'}
            className="h-8"
            onClick={() => setScope('all')}
          >
            Everything
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Toggle adjusts cash only - inventory, receivables and supplier bills are business.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="Total assets"
          value={formatDOP(assets)}
          sub="what you own"
          accent={EMERALD}
        />
        <StatCard
          label="Total liabilities"
          value={formatDOP(liabilities)}
          sub="what you owe"
          accent={ROSE}
        />
        <StatCard
          label="Equity (net worth)"
          value={formatDOP(equity)}
          sub="assets - liabilities"
          accent={INDIGO}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Asset mix donut */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Asset mix</CardTitle>
          </CardHeader>
          <CardContent>
            {assetTotal === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">No assets.</p>
            ) : (
              <div className="flex flex-col items-center gap-4 sm:flex-row">
                <div className="h-48 w-48 shrink-0">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <PieChart>
                      <Pie
                        data={assetMix}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={52}
                        outerRadius={84}
                        paddingAngle={1}
                        stroke="none"
                      >
                        {assetMix.map((a, i) => (
                          <Cell key={i} fill={a.fill} />
                        ))}
                      </Pie>
                      <Tooltip content={<CurrencyTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="w-full space-y-1 text-sm">
                  {assetMix.map((a) => (
                    <div key={a.name} className="flex items-center gap-2">
                      <span
                        className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                        style={{ background: a.fill }}
                      />
                      <span className="truncate">{a.name}</span>
                      <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">
                        {formatDOP(a.value)}
                      </span>
                      <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                        {((a.value / assetTotal) * 100).toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Assets vs Liabilities vs Equity */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Assets - Liabilities - Equity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart data={ale} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: number) => compactDOP(v)}
                    domain={[(min: number) => Math.min(0, min), 'auto']}
                    width={64}
                  />
                  <Tooltip content={<CurrencyTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                  <Bar dataKey="value" name="Amount" radius={[3, 3, 0, 0]}>
                    {ale.map((d, i) => (
                      <Cell key={i} fill={d.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Breakdown table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {/* Assets */}
          <div className="bg-muted/40 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Assets
          </div>
          <div className="divide-y">
            <Row name={scope === 'business' ? 'Cash (business accounts)' : 'Cash (all accounts)'} amount={cash} />
            <Row name="Inventory (at cost)" amount={inventory} />
            <Row name="Receivables (customers owe you)" amount={receivables} />
          </div>
          <div className="border-t bg-muted/20">
            <Row name="Total assets" amount={assets} bold accent={EMERALD} />
          </div>

          {/* Liabilities */}
          <div className="bg-muted/40 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Liabilities
          </div>
          <div className="divide-y">
            <Row name="Supplier bills owed" amount={supplier} />
            <Row name="received, unpaid" amount={data.supplier_owed.received_cents} indent muted />
            <Row name="pending orders" amount={data.supplier_owed.pending_cents} indent muted />
            <Row name="Commissions owed (sellers)" amount={commissions} />
          </div>
          <div className="border-t bg-muted/20">
            <Row name="Total liabilities" amount={liabilities} bold accent={ROSE} />
          </div>

          {/* Equity */}
          <div className="border-t-2">
            <Row name="Equity (net worth)" amount={equity} bold accent={INDIGO} />
          </div>

          {fxParts.length > 0 && (
            <p className="px-4 py-2 text-xs text-muted-foreground">
              Foreign-currency cash converted to pesos at {fxParts.join(' / ')} per unit.
            </p>
          )}
          <p className="px-4 py-2 text-xs text-muted-foreground">
            Unpaid supplier bills are billed in USD and converted at the live rate of
            RD${data.live_rate.toFixed(2)} / US$1.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
