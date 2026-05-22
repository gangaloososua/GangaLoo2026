'use client'

// Reports - P&L interactive view.
//
// Receives the full report (which carries BOTH the business and the all-scope
// totals) and switches between them client-side - no refetch. Renders:
//   - a Business / Everything toggle (+ an honest note on the business view)
//   - three summary cards (Income, Expenses, Net) with vs-prior deltas
//   - four recharts charts (profit waterfall, income donut, expense donut,
//     this-vs-last bars)
//   - the full P&L statement table (every active line, this vs last, % change)
//
// Money is in CENTS throughout. Per-line current_cents/prior_cents keep their
// natural ledger sign (income +, expense -); we flip expenses to positive
// magnitudes for display.

import { useMemo, useState, type ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
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
import type { PnlReport, PnlLine } from '@/lib/pnl'

const EMERALD = '#10b981'
const ROSE = '#fb7185'
const SLATE = '#cbd5e1'
const INDIGO = '#6366f1'

const INCOME_PALETTE = [
  '#059669', '#10b981', '#34d399', '#14b8a6', '#0d9488',
  '#6ee7b7', '#047857', '#2dd4bf', '#a7f3d0', '#065f46',
]
const EXPENSE_PALETTE = [
  '#e11d48', '#f43f5e', '#fb7185', '#f97316', '#fb923c',
  '#fda4af', '#be123c', '#ea580c', '#9f1239', '#fed7aa',
]

type Scope = 'business' | 'all'
type Item = { name: string; value: number }

// --- helpers ---------------------------------------------------------------

function pct(cur: number, prev: number): number | null {
  if (prev === 0) return null
  return ((cur - prev) / Math.abs(prev)) * 100
}

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
  sub?: ReactNode
  delta?: ReactNode
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

// Tooltip for the donut/bar charts: shows label + DOP value.
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

// Tooltip for the waterfall: only the visible "amount" matters (raw is signed).
function WaterfallTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload
  if (!row) return null
  return (
    <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md">
      <div className="font-medium">{row.name}</div>
      <div className="tabular-nums text-muted-foreground">{formatDOP(row.raw)}</div>
    </div>
  )
}

function DonutPanel({
  title,
  items,
  palette,
  empty,
}: {
  title: string
  items: Item[]
  palette: string[]
  empty: string
}) {
  const total = items.reduce((s, x) => s + x.value, 0)
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 || total === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">{empty}</p>
        ) : (
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <div className="h-48 w-48 shrink-0">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <PieChart>
                  <Pie
                    data={items}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={52}
                    outerRadius={84}
                    paddingAngle={1}
                    stroke="none"
                  >
                    {items.map((_, i) => (
                      <Cell key={i} fill={palette[i % palette.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CurrencyTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="max-h-48 w-full space-y-1 overflow-y-auto pr-1 text-sm">
              {items.map((it, i) => (
                <div key={it.name} className="flex items-center gap-2">
                  <span
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{ background: palette[i % palette.length] }}
                  />
                  <span className="truncate">{it.name}</span>
                  <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">
                    {formatDOP(it.value)}
                  </span>
                  <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {((it.value / total) * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// --- statement table -------------------------------------------------------

function StatementRow({
  name,
  cur,
  prev,
  goodWhenUp,
  bold,
  emphasizeColor,
}: {
  name: string
  cur: number
  prev: number
  goodWhenUp: boolean
  bold?: boolean
  emphasizeColor?: 'pos' | 'neg' | null
}) {
  const p = pct(cur, prev)
  const valueClass =
    emphasizeColor === 'pos'
      ? 'text-emerald-600'
      : emphasizeColor === 'neg'
        ? 'text-rose-600'
        : ''
  return (
    <div
      className={
        'grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 px-4 py-2 text-sm ' +
        (bold ? 'font-semibold' : '')
      }
    >
      <span className="truncate">{name}</span>
      <span className={'w-28 text-right tabular-nums ' + valueClass}>{formatDOP(cur)}</span>
      <span className="hidden w-28 text-right tabular-nums text-muted-foreground sm:block">
        {formatDOP(prev)}
      </span>
      <span className="w-16 text-right">
        {p === null ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <Delta cur={cur} prev={prev} goodWhenUp={goodWhenUp} />
        )}
      </span>
    </div>
  )
}

// --- main ------------------------------------------------------------------

export function PnlView({
  report,
  periodLabel,
  prevLabel,
}: {
  report: PnlReport
  periodLabel: string
  prevLabel: string
}) {
  const [scope, setScope] = useState<Scope>('business')
  const totals = report.totals[scope]

  const { incomeLines, expenseLines } = useMemo(() => {
    const lines = report.lines.filter((l) =>
      scope === 'business' ? l.scope === 'business' : true,
    )
    const inc = lines
      .filter((l) => l.type === 'income')
      .sort((a, b) => Math.abs(b.current_cents) - Math.abs(a.current_cents))
    const exp = lines
      .filter((l) => l.type === 'expense')
      .sort((a, b) => Math.abs(b.current_cents) - Math.abs(a.current_cents))
    return { incomeLines: inc, expenseLines: exp }
  }, [report.lines, scope])

  // Donut data (positive magnitudes, top 8 + Other)
  const incomeDonut = useMemo(
    () =>
      topNWithOther(
        incomeLines.map((l) => ({ name: l.name, value: l.current_cents })).filter((x) => x.value > 0),
        8,
      ),
    [incomeLines],
  )
  const expenseDonut = useMemo(
    () =>
      topNWithOther(
        expenseLines.map((l) => ({ name: l.name, value: -l.current_cents })).filter((x) => x.value > 0),
        8,
      ),
    [expenseLines],
  )

  // Waterfall: income, then top expense groups stepping down, landing on net.
  const waterfall = useMemo(() => {
    const income = totals.income_cents
    const net = totals.net_cents
    const expItems = expenseLines
      .map((l) => ({ name: l.name, value: -l.current_cents }))
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value)
    const top = expItems.slice(0, 6)
    const shown = top.reduce((s, x) => s + x.value, 0)
    const otherVal = totals.expense_cents - shown
    const groups = otherVal > 0 ? [...top, { name: 'Other', value: otherVal }] : top

    const rows: { name: string; spacer: number; amount: number; fill: string; raw: number }[] = [
      { name: 'Income', spacer: 0, amount: income, fill: EMERALD, raw: income },
    ]
    let run = income
    for (const g of groups) {
      const base = Math.max(0, run - g.value)
      rows.push({ name: g.name, spacer: base, amount: g.value, fill: ROSE, raw: g.value })
      run -= g.value
    }
    rows.push({
      name: 'Net',
      spacer: 0,
      amount: net,
      fill: net >= 0 ? EMERALD : ROSE,
      raw: net,
    })
    return rows
  }, [totals, expenseLines])

  // This-vs-last comparison
  const compare = useMemo(
    () => [
      { name: 'Income', current: totals.income_cents, prior: totals.prior_income_cents },
      { name: 'Expenses', current: totals.expense_cents, prior: totals.prior_expense_cents },
      { name: 'Net', current: totals.net_cents, prior: totals.prior_net_cents },
    ],
    [totals],
  )

  const netPositive = totals.net_cents >= 0

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
        {scope === 'business' ? (
          <p className="text-xs text-muted-foreground">
            Note: some personal income is still tagged business (e.g. Salary), so business
            income may read high until those categories are re-tagged.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Showing business + personal combined.
          </p>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="Income"
          value={formatDOP(totals.income_cents)}
          sub={`vs ${prevLabel}`}
          delta={<Delta cur={totals.income_cents} prev={totals.prior_income_cents} />}
        />
        <StatCard
          label="Expenses"
          value={formatDOP(totals.expense_cents)}
          sub={`vs ${prevLabel}`}
          delta={
            <Delta cur={totals.expense_cents} prev={totals.prior_expense_cents} goodWhenUp={false} />
          }
        />
        <StatCard
          label="Net profit"
          value={formatDOP(totals.net_cents)}
          sub={netPositive ? 'profit' : 'loss'}
          delta={<Delta cur={totals.net_cents} prev={totals.prior_net_cents} />}
        />
      </div>

      {/* Waterfall (hero) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Where the money went ({periodLabel})</CardTitle>
          <p className="text-xs text-muted-foreground">
            Income, less each major expense, landing on net profit.
          </p>
        </CardHeader>
        <CardContent>
          {totals.income_cents === 0 && totals.expense_cents === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No activity in this period.</p>
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart data={waterfall} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11 }}
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                    height={50}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: number) => compactDOP(v)}
                    domain={[(min: number) => Math.min(0, min), 'auto']}
                    width={64}
                  />
                  <Tooltip content={<WaterfallTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                  <Bar dataKey="spacer" stackId="wf" fill="transparent" />
                  <Bar dataKey="amount" stackId="wf" radius={[3, 3, 0, 0]}>
                    {waterfall.map((r, i) => (
                      <Cell key={i} fill={r.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Donuts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DonutPanel
          title="Income by source"
          items={incomeDonut}
          palette={INCOME_PALETTE}
          empty="No income in this period."
        />
        <DonutPanel
          title="Expenses by category"
          items={expenseDonut}
          palette={EXPENSE_PALETTE}
          empty="No expenses in this period."
        />
      </div>

      {/* This vs last */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {periodLabel} vs {prevLabel}
          </CardTitle>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ background: SLATE }} /> {prevLabel}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ background: INDIGO }} /> {periodLabel}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <BarChart data={compare} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) => compactDOP(v)}
                  domain={[(min: number) => Math.min(0, min), 'auto']}
                  width={64}
                />
                <Tooltip content={<CurrencyTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                <Bar dataKey="prior" name={prevLabel} fill={SLATE} radius={[3, 3, 0, 0]} />
                <Bar dataKey="current" name={periodLabel} fill={INDIGO} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Statement table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Statement</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {/* column header */}
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 border-b px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <span>Category</span>
            <span className="w-28 text-right">{periodLabel}</span>
            <span className="hidden w-28 text-right sm:block">{prevLabel}</span>
            <span className="w-16 text-right">Δ</span>
          </div>

          {/* Income */}
          <div className="bg-muted/40 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Income
          </div>
          {incomeLines.length === 0 ? (
            <div className="px-4 py-2 text-sm text-muted-foreground">No income.</div>
          ) : (
            <div className="divide-y">
              {incomeLines.map((l: PnlLine) => (
                <StatementRow
                  key={l.id}
                  name={l.name}
                  cur={l.current_cents}
                  prev={l.prior_cents}
                  goodWhenUp
                />
              ))}
            </div>
          )}
          <div className="border-t bg-muted/20">
            <StatementRow
              name="Total income"
              cur={totals.income_cents}
              prev={totals.prior_income_cents}
              goodWhenUp
              bold
            />
          </div>

          {/* Expenses */}
          <div className="bg-muted/40 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Expenses
          </div>
          {expenseLines.length === 0 ? (
            <div className="px-4 py-2 text-sm text-muted-foreground">No expenses.</div>
          ) : (
            <div className="divide-y">
              {expenseLines.map((l: PnlLine) => (
                <StatementRow
                  key={l.id}
                  name={l.name}
                  cur={-l.current_cents}
                  prev={-l.prior_cents}
                  goodWhenUp={false}
                />
              ))}
            </div>
          )}
          <div className="border-t bg-muted/20">
            <StatementRow
              name="Total expenses"
              cur={totals.expense_cents}
              prev={totals.prior_expense_cents}
              goodWhenUp={false}
              bold
            />
          </div>

          {/* Net */}
          <div className="border-t-2">
            <StatementRow
              name="Net profit"
              cur={totals.net_cents}
              prev={totals.prior_net_cents}
              goodWhenUp
              bold
              emphasizeColor={netPositive ? 'pos' : 'neg'}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
