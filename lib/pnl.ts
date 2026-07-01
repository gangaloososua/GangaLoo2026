// Reports - Profit & Loss data layer.
//
// Thin wrapper around the read-only pnl_report() RPC, which does all the
// aggregation in SQL and returns one jsonb bundle. All money values are in
// CENTS (integers). Expense TOTALS are returned as POSITIVE magnitudes (the
// RPC negates the stored-negative expense sums); per-line current_cents /
// prior_cents keep their natural ledger sign (income +, expense -).
//
// The report carries TWO total blocks - `business` (scope = 'business' only)
// and `all` (every scope) - so the screen's Business/Everything toggle is a
// pure client switch with no refetch. Each line also carries its own `scope`
// so the line table can filter to match the toggle.
//
// Each line ALSO carries its MAIN category (main_id / main_name) and an
// is_main flag, so the screen can group subs under their main category and
// show a proper hierarchical statement. A line where is_main is true is a
// category that had money posted directly to a main category (parent_id null);
// it is its own main.
//
// computePnlPeriods() turns a period mode into the four date bounds the RPC
// needs (current window + the comparison window before it). customPnlPeriods()
// does the same for an explicit start/end, with a prior window of equal length
// immediately before it. Bounds are half-open [start, end), emitted as
// YYYY-MM-DD; the database reads them at midnight in its session timezone.

import { createClient } from '@/lib/supabase/server'

export type PnlPeriodMode = 'this-month' | 'last-month' | 'this-year'

export type PnlPeriods = {
  curStart: string
  curEnd: string
  prevStart: string
  prevEnd: string
  /** Human label for the current window, e.g. "May 2026" or "2026". */
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

function monthLabel(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export function computePnlPeriods(
  mode: PnlPeriodMode,
  now: Date = new Date(),
): PnlPeriods {
  const y = now.getFullYear()
  const m = now.getMonth()

  if (mode === 'this-year') {
    return {
      curStart: `${y}-01-01`,
      curEnd: `${y + 1}-01-01`,
      prevStart: `${y - 1}-01-01`,
      prevEnd: `${y}-01-01`,
      label: String(y),
      prevLabel: String(y - 1),
    }
  }

  if (mode === 'last-month') {
    const curStart = new Date(y, m - 1, 1)
    const curEnd = new Date(y, m, 1)
    const prevStart = new Date(y, m - 2, 1)
    const prevEnd = curStart
    return {
      curStart: ymd(curStart),
      curEnd: ymd(curEnd),
      prevStart: ymd(prevStart),
      prevEnd: ymd(prevEnd),
      label: monthLabel(curStart),
      prevLabel: monthLabel(prevStart),
    }
  }

  // this-month (default)
  const curStart = new Date(y, m, 1)
  const curEnd = new Date(y, m + 1, 1)
  const prevStart = new Date(y, m - 1, 1)
  const prevEnd = curStart
  return {
    curStart: ymd(curStart),
    curEnd: ymd(curEnd),
    prevStart: ymd(prevStart),
    prevEnd: ymd(prevEnd),
    label: monthLabel(curStart),
    prevLabel: monthLabel(prevStart),
  }
}

/**
 * Custom range. startYmd / endYmd are INCLUSIVE calendar dates (YYYY-MM-DD)
 * from a date picker. We convert to a half-open window [start, end + 1 day)
 * and build a prior window of identical length immediately before it, so the
 * vs-prior comparison is fair.
 */
export function customPnlPeriods(startYmd: string, endYmd: string): PnlPeriods {
  const parse = (s: string) => {
    const [yy, mm, dd] = s.split('-').map(Number)
    return new Date(yy, (mm ?? 1) - 1, dd ?? 1)
  }
  const start = parse(startYmd)
  const endInclusive = parse(endYmd)
  const end = new Date(
    endInclusive.getFullYear(),
    endInclusive.getMonth(),
    endInclusive.getDate() + 1,
  )

  const lengthDays = Math.max(
    1,
    Math.round((end.getTime() - start.getTime()) / 86_400_000),
  )
  const prevEnd = start
  const prevStart = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate() - lengthDays,
  )

  return {
    curStart: ymd(start),
    curEnd: ymd(end),
    prevStart: ymd(prevStart),
    prevEnd: ymd(prevEnd),
    label: `${startYmd} \u2192 ${endYmd}`,
    prevLabel: 'Prior period',
  }
}

// --- bundle shape (mirrors the jsonb the RPC returns) ----------------------

export type PnlLineType = 'income' | 'expense'
export type PnlScope = 'business' | 'private'

export type PnlLine = {
  id: string
  name: string
  type: PnlLineType
  scope: PnlScope
  /** The main (top-level) category this line rolls up into. */
  main_id: string
  /** The main category's name (equals `name` when this line IS a main). */
  main_name: string
  /** True when this line is itself a main category (money posted directly to it). */
  is_main: boolean
  /** Natural ledger sign: income positive, expense negative. */
  current_cents: number
  prior_cents: number
}

export type PnlTotals = {
  /** Positive. */
  income_cents: number
  /** Positive magnitude (expenses). */
  expense_cents: number
  /** income - expenses (net profit; can be negative). */
  net_cents: number
  prior_income_cents: number
  prior_expense_cents: number
  prior_net_cents: number
}

export type PnlReport = {
  lines: PnlLine[]
  totals: {
    business: PnlTotals
    all: PnlTotals
  }
}

// --- fetch -----------------------------------------------------------------

export async function fetchPnlReport(periods: PnlPeriods): Promise<PnlReport> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('pnl_report', {
    p_cur_start: periods.curStart,
    p_cur_end: periods.curEnd,
    p_prev_start: periods.prevStart,
    p_prev_end: periods.prevEnd,
  })
  if (error) throw new Error(error.message)
  return data as PnlReport
}
