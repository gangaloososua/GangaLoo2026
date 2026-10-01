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
// immediately before it.
//
// 2026-09-30: fixed a timezone bug (same one found + fixed in lib/dashboard.ts
// -- this file had an independent copy of the same broken logic). "Today" was
// read via new Date().getFullYear()/getMonth()/getDate(), which on the server
// (Netlify, UTC) is NOT the Dominican Republic's calendar date -- a sale made
// roughly 8pm-midnight DR time (UTC-4) was already "tomorrow" by the server's
// clock. Separately, bounds were sent as bare "YYYY-MM-DD" strings, which
// Postgres casts to timestamptz using its OWN session timezone (UTC), a
// second independent source of drift. Fix: compute "today" from the actual DR
// calendar date (via Intl, not the server's local getters), and send full ISO
// timestamps with an explicit "-04:00" offset (DR has no DST, so this is
// constant year-round) so the cast is unambiguous regardless of session tz.

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
 *  -04:00-offset ISO timestamp. Unambiguous regardless of session/server tz. */
function drMidnightISO(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}T00:00:00${DR_OFFSET}`
}

/** Add days to a plain (y, m, d) calendar date. Done via a UTC-anchored Date
 *  purely as a calendar calculator -- no timezone reading happens here, so
 *  this is safe regardless of server TZ. */
function addDays(y: number, m: number, d: number, delta: number): { y: number; m: number; d: number } {
  const dt = new Date(Date.UTC(y, m - 1, d + delta))
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() }
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

export function computePnlPeriods(
  mode: PnlPeriodMode,
  now: Date = new Date(),
): PnlPeriods {
  const { y, m } = drToday(now)

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

  if (mode === 'last-month') {
    const curM = m === 1 ? 12 : m - 1
    const curY = m === 1 ? y - 1 : y
    const prevM = curM === 1 ? 12 : curM - 1
    const prevY = curM === 1 ? curY - 1 : curY
    return {
      curStart: drMidnightISO(curY, curM, 1),
      curEnd: drMidnightISO(y, m, 1),
      prevStart: drMidnightISO(prevY, prevM, 1),
      prevEnd: drMidnightISO(curY, curM, 1),
      label: `${MONTHS[curM - 1]} ${curY}`,
      prevLabel: `${MONTHS[prevM - 1]} ${prevY}`,
    }
  }

  // this-month (default)
  const nextM = m === 12 ? 1 : m + 1
  const nextY = m === 12 ? y + 1 : y
  const prevM = m === 1 ? 12 : m - 1
  const prevY = m === 1 ? y - 1 : y
  return {
    curStart: drMidnightISO(y, m, 1),
    curEnd: drMidnightISO(nextY, nextM, 1),
    prevStart: drMidnightISO(prevY, prevM, 1),
    prevEnd: drMidnightISO(y, m, 1),
    label: `${MONTHS[m - 1]} ${y}`,
    prevLabel: `${MONTHS[prevM - 1]} ${prevY}`,
  }
}

/**
 * Custom range. startYmd / endYmd are INCLUSIVE calendar dates (YYYY-MM-DD)
 * from a date picker -- these are Dominican calendar dates as the owner
 * typed them, so no timezone conversion is needed on the input itself, only
 * on how the boundary is anchored (DR midnight, not UTC midnight).
 * Converted to a half-open window [start, end + 1 day) with a prior window
 * of identical length immediately before it, so the vs-prior comparison is
 * fair.
 */
export function customPnlPeriods(startYmd: string, endYmd: string): PnlPeriods {
  const parse = (s: string): { y: number; m: number; d: number } => {
    const [yy, mm, dd] = s.split('-').map(Number)
    return { y: yy, m: mm ?? 1, d: dd ?? 1 }
  }
  const start = parse(startYmd)
  const endInclusive = parse(endYmd)
  const end = addDays(endInclusive.y, endInclusive.m, endInclusive.d, 1)

  const startUTC = Date.UTC(start.y, start.m - 1, start.d)
  const endUTC = Date.UTC(end.y, end.m - 1, end.d)
  const lengthDays = Math.max(1, Math.round((endUTC - startUTC) / 86_400_000))

  const prevEnd = start
  const prevStart = addDays(start.y, start.m, start.d, -lengthDays)

  return {
    curStart: drMidnightISO(start.y, start.m, start.d),
    curEnd: drMidnightISO(end.y, end.m, end.d),
    prevStart: drMidnightISO(prevStart.y, prevStart.m, prevStart.d),
    prevEnd: drMidnightISO(prevEnd.y, prevEnd.m, prevEnd.d),
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
