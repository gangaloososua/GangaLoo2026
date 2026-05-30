'use client'

// Dashboard "Revenue vs expenses" chart.
//
// Recharts grouped bars (matches the reports' charts). Replaces the old
// hand-rolled CSS bars, whose percentage heights resolved against an auto-height
// flex parent and collapsed to zero. Recharts sizes via ResponsiveContainer and
// auto-scales the axis, so the bars always render. Consumes the same
// monthly_trend rows the RPC already returns ({ month, revenue_cents,
// expense_cents }); no data-layer change. Money in CENTS.

import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { formatDOP } from '@/lib/format'
import type { MonthlyTrendRow } from '@/lib/dashboard'

const REVENUE_COLOR = '#10b981' // emerald-500
const EXPENSE_COLOR = '#fb7185' // rose-400

const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

function monthLabel(month: string): string {
  const [, mm] = month.split('-')
  const idx = Number(mm) - 1
  return MONTH_SHORT[idx] ?? month
}

function compactDOP(cents: number): string {
  const n = (cents / 100).toLocaleString('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  })
  return `RD$${n}`
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const rev = payload.find((p: any) => p.dataKey === 'revenue')?.value ?? 0
  const exp = payload.find((p: any) => p.dataKey === 'expense')?.value ?? 0
  return (
    <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md">
      <div className="font-medium">{label}</div>
      <div className="mt-0.5 flex items-center gap-1 tabular-nums">
        <span
          className="inline-block h-2 w-2 rounded-sm"
          style={{ background: REVENUE_COLOR }}
        />
        Revenue {formatDOP(rev)}
      </div>
      <div className="flex items-center gap-1 tabular-nums">
        <span
          className="inline-block h-2 w-2 rounded-sm"
          style={{ background: EXPENSE_COLOR }}
        />
        Expenses {formatDOP(exp)}
      </div>
    </div>
  )
}

export function RevenueExpenseChart({ data }: { data: MonthlyTrendRow[] }) {
  if (!data || data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">No data yet.</p>
    )
  }

  const rows = data.map((m) => ({
    label: monthLabel(m.month),
    revenue: m.revenue_cents,
    expense: m.expense_cents,
  }))

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <BarChart data={rows} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
          <XAxis dataKey="label" tick={{ fontSize: 12 }} />
          <YAxis
            tick={{ fontSize: 11 }}
            tickFormatter={(v: number) => compactDOP(v)}
            width={64}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
          <Bar dataKey="revenue" name="Revenue" fill={REVENUE_COLOR} radius={[3, 3, 0, 0]} />
          <Bar dataKey="expense" name="Expenses" fill={EXPENSE_COLOR} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
