// Round 25a - dashboard data layer.
//
// Thin wrapper around the read-only dashboard_overview() RPC, which does all
// the aggregation in SQL and returns one jsonb bundle. All money values are in
// CENTS (integers) unless a field name says otherwise; unit_cost-derived
// inventory value is already converted to cents inside the function.
//
// computePeriods() turns a simple period mode into the four date bounds the
// RPC needs (current window + the comparison window before it). Bounds are
// half-open [start, end). Dates are emitted as YYYY-MM-DD; the database reads
// them at midnight in its session timezone, which is fine for a dashboard.

import { createClient } from '@/lib/supabase/server'

export type DashboardPeriodMode = 'this-month' | 'last-30' | 'this-year'

export type DashboardPeriods = {
  curStart: string
  curEnd: string
  prevStart: string
  prevEnd: string
  /** Human label for the current window, e.g. "May 2026" or "Last 30 days". */
  label: string
  /** Human label for the comparison window, e.g. "Apr 2026". */
  prevLabel: string
}

// --- period math -----------------------------------------------------------

function ymd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

export function computePeriods(
  mode: DashboardPeriodMode,
  now: Date = new Date(),
): DashboardPeriods {
  if (mode === 'this-year') {
    const y = now.getFullYear()
    return {
      curStart: `${y}-01-01`,
      curEnd: `${y + 1}-01-01`,
      prevStart: `${y - 1}-01-01`,
      prevEnd: `${y}-01-01`,
      label: String(y),
      prevLabel: String(y - 1),
    }
  }

  if (mode === 'last-30') {
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 30)
    const prevEnd = start
    const prevStart = new Date(start.getFullYear(), start.getMonth(), start.getDate() - 30)
    return {
      curStart: ymd(start),
      curEnd: ymd(end),
      prevStart: ymd(prevStart),
      prevEnd: ymd(prevEnd),
      label: 'Last 30 days',
      prevLabel: 'Prior 30 days',
    }
  }

  // this-month (default)
  const y = now.getFullYear()
  const m = now.getMonth()
  const curStart = new Date(y, m, 1)
  const curEnd = new Date(y, m + 1, 1)
  const prevStart = new Date(y, m - 1, 1)
  const prevEnd = curStart
  return {
    curStart: ymd(curStart),
    curEnd: ymd(curEnd),
    prevStart: ymd(prevStart),
    prevEnd: ymd(prevEnd),
    label: `${MONTHS[curStart.getMonth()]} ${curStart.getFullYear()}`,
    prevLabel: `${MONTHS[prevStart.getMonth()]} ${prevStart.getFullYear()}`,
  }
}

// --- bundle shape (mirrors the jsonb the RPC returns) ----------------------

export type DashboardCurrent = {
  revenue_cents: number
  expenses_cents: number
  net_cents: number
  sales_count: number
  sales_total_cents: number
  gross_revenue_costed_cents: number
  cogs_cents: number
  gross_margin_cents: number
  gm_costed_sales: number
  gm_total_sales: number
}

export type DashboardPrevious = {
  revenue_cents: number
  expenses_cents: number
  net_cents: number
  sales_count: number
  sales_total_cents: number
}

export type DashboardCash = {
  total_cents: number
  business_cents: number
  private_cents: number
}

export type DashboardInventory = {
  units: number
  value_cents: number
  lots_total: number
  lots_costed: number
}

export type ExpenseCategoryRow = { name: string; amount_cents: number }
export type StockByWarehouseRow = { warehouse: string; units: number; value_cents: number }
export type MonthlyTrendRow = { month: string; revenue_cents: number; expense_cents: number }
export type RecentSaleRow = {
  invoice: string | null
  customer: string | null
  total_cents: number
  paid_cents: number
  status: string
  sold_at: string
}
export type AccountRow = {
  name: string
  balance_cents: number
  currency: string
  scope: string
}

export type DashboardOverview = {
  current: DashboardCurrent
  previous: DashboardPrevious
  cash: DashboardCash
  receivables_cents: number
  open_commissions_cents: number
  inventory: DashboardInventory
  expenses_by_category: ExpenseCategoryRow[]
  stock_by_warehouse: StockByWarehouseRow[]
  monthly_trend: MonthlyTrendRow[]
  recent_sales: RecentSaleRow[]
  accounts: AccountRow[]
}

// --- fetch -----------------------------------------------------------------

export async function fetchDashboardOverview(
  periods: DashboardPeriods,
): Promise<DashboardOverview> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('dashboard_overview', {
    p_cur_start: periods.curStart,
    p_cur_end: periods.curEnd,
    p_prev_start: periods.prevStart,
    p_prev_end: periods.prevEnd,
  })
  if (error) throw new Error(error.message)
  return data as DashboardOverview
}
