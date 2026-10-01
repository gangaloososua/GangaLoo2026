// Round 25a - dashboard data layer.
//
// Thin wrapper around the read-only dashboard_overview() RPC, which does all
// the aggregation in SQL and returns one jsonb bundle. All money values are in
// CENTS (integers) unless a field name says otherwise; unit_cost-derived
// inventory value is already converted to cents inside the function.
//
// computePeriods() turns a simple period mode into the four date bounds the
// RPC needs (current window + the comparison window before it). Bounds are
// half-open [start, end).
//
// 2026-09-30: fixed a timezone bug. "Today"/"this month" were computed from
// new Date() read with the SERVER's local getters (getFullYear/getMonth/
// getDate), which on Netlify run in UTC -- so any sale made roughly 8pm-
// midnight Dominican time (UTC-4) was already "tomorrow" by the server's
// clock and fell into the wrong month. Separately, the boundaries were sent
// as bare "YYYY-MM-DD" strings, which Postgres casts to timestamptz using
// its OWN session timezone (UTC on Supabase) -- a second, independent source
// of the same kind of drift. Fix: compute "today" from the Dominican
// Republic's actual calendar date (via Intl, not the server's getters), and
// send full ISO timestamps with an explicit "-04:00" offset (DR has no DST,
// so this offset is constant year-round) so the cast is unambiguous
// regardless of any session timezone setting.

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

const DR_TIME_ZONE = 'America/Santo_Domingo'
// DR is UTC-4 year-round (no DST). Fixed offset, safe to hard-code.
const DR_OFFSET = '-04:00'

const pad = (n: number) => String(n).padStart(2, '0')

/** The Dominican Republic's current calendar date, regardless of the
 *  server's own local timezone. Using Intl here (rather than reading a
 *  Date's local getters) is robust no matter what TZ the host runs in. */
function drToday(now: Date): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: DR_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  return { y: get('year'), m: get('month'), d: get('day') }
}

/** Midnight on the given Dominican-Republic calendar date, as an explicit
 *  -04:00-offset ISO timestamp. Postgres (or any tz-aware consumer) reads
 *  this unambiguously -- no dependence on session/server timezone. */
function drMidnightISO(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}T00:00:00${DR_OFFSET}`
}

/** Add days to a plain (y, m, d) calendar date, returning a new (y, m, d).
 *  Done via a UTC-anchored Date purely as a calendar calculator -- no
 *  timezone reading happens here, so this is safe regardless of server TZ. */
function addDays(y: number, m: number, d: number, delta: number): { y: number; m: number; d: number } {
  const dt = new Date(Date.UTC(y, m - 1, d + delta))
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() }
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

export function computePeriods(
  mode: DashboardPeriodMode,
  now: Date = new Date(),
): DashboardPeriods {
  const { y, m, d } = drToday(now)

  if (mode === 'this-year') {
    return {
      curStart: drMidnightISO(y, 1, 1),
      curEnd: drMidnightISO(y + 1, 1, 1),
      prevStart: drMidnightISO(y - 1, 1, 1),
      prevEnd: drMidnightISO(y, 1, 1),
      label: String(y),
      prevLabel: String(y - 1),
    }
  }

  if (mode === 'last-30') {
    // End is the start of "tomorrow" (DR), so today is fully included.
    const end = addDays(y, m, d, 1)
    const start = addDays(end.y, end.m, end.d, -30)
    const prevEnd = start
    const prevStart = addDays(start.y, start.m, start.d, -30)
    return {
      curStart: drMidnightISO(start.y, start.m, start.d),
      curEnd: drMidnightISO(end.y, end.m, end.d),
      prevStart: drMidnightISO(prevStart.y, prevStart.m, prevStart.d),
      prevEnd: drMidnightISO(prevEnd.y, prevEnd.m, prevEnd.d),
      label: 'Last 30 days',
      prevLabel: 'Prior 30 days',
    }
  }

  // this-month (default)
  const curStartY = y, curStartM = m
  const nextM = m === 12 ? 1 : m + 1
  const nextY = m === 12 ? y + 1 : y
  const prevM = m === 1 ? 12 : m - 1
  const prevY = m === 1 ? y - 1 : y
  return {
    curStart: drMidnightISO(curStartY, curStartM, 1),
    curEnd: drMidnightISO(nextY, nextM, 1),
    prevStart: drMidnightISO(prevY, prevM, 1),
    prevEnd: drMidnightISO(curStartY, curStartM, 1),
    label: `${MONTHS[curStartM - 1]} ${curStartY}`,
    prevLabel: `${MONTHS[prevM - 1]} ${prevY}`,
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
