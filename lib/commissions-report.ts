// Reports - Commission statements data layer.
//
// Period math mirrors lib/sales-report.ts (This month / Last month / This year
// / Custom). Thin wrapper around the read-only commissions_report(p_start,
// p_end) RPC. All money in CENTS.
//
// Commissions date through sale_item -> sale -> sold_at. VOID commissions are
// excluded. Buckets: earned = paid + pending (non-void), paid = paid,
// owed = pending. Grouped by earner+role and summarized by role (seller vs
// distributor), so the two roles never blend into one figure.

import { createClient } from '@/lib/supabase/server'

export type CommissionsPeriodMode = 'this-month' | 'last-month' | 'this-year'

export type CommissionsPeriods = {
  start: string
  end: string
  label: string
}

// --- period math (same scheme as sales-report.ts) --------------------------

function ymd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

function monthLabel(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export function computeCommissionsPeriods(
  mode: CommissionsPeriodMode,
  now: Date = new Date(),
): CommissionsPeriods {
  const y = now.getFullYear()
  const m = now.getMonth()

  if (mode === 'this-year') {
    return { start: `${y}-01-01`, end: `${y + 1}-01-01`, label: String(y) }
  }
  if (mode === 'last-month') {
    const start = new Date(y, m - 1, 1)
    const end = new Date(y, m, 1)
    return { start: ymd(start), end: ymd(end), label: monthLabel(start) }
  }
  const start = new Date(y, m, 1)
  const end = new Date(y, m + 1, 1)
  return { start: ymd(start), end: ymd(end), label: monthLabel(start) }
}

export function customCommissionsPeriods(startYmd: string, endYmd: string): CommissionsPeriods {
  const parse = (s: string) => {
    const [yy, mm, dd] = s.split('-').map(Number)
    return new Date(yy, (mm ?? 1) - 1, dd ?? 1)
  }
  const endInclusive = parse(endYmd)
  const end = new Date(
    endInclusive.getFullYear(),
    endInclusive.getMonth(),
    endInclusive.getDate() + 1,
  )
  return { start: startYmd, end: ymd(end), label: `${startYmd} \u2192 ${endYmd}` }
}

// --- bundle shape ----------------------------------------------------------

export type CommissionRoleRow = {
  role: string
  earned_cents: number
  paid_cents: number
  owed_cents: number
}

export type CommissionEarnerRow = {
  earner: string
  role: string
  earned_cents: number
  paid_cents: number
  owed_cents: number
  count: number
}

export type CommissionsReport = {
  earned_cents: number
  paid_cents: number
  owed_cents: number
  count: number
  by_role: CommissionRoleRow[]
  by_earner: CommissionEarnerRow[]
}

export async function fetchCommissionsReport(
  periods: CommissionsPeriods,
): Promise<CommissionsReport> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('commissions_report', {
    p_start: periods.start,
    p_end: periods.end,
  })
  if (error) throw new Error(error.message)
  return data as CommissionsReport
}
