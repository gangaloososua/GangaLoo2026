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
//
// 2026-09-30: fixed a timezone bug (same one found + fixed in lib/dashboard.ts,
// lib/pnl.ts and lib/sales-report.ts -- this file had its own independent copy
// of the same broken logic). "Today" was read via new Date().getFullYear()/
// getMonth()/getDate(), which on the server (Netlify, UTC) is NOT the
// Dominican Republic's calendar date -- a sale made roughly 8pm-midnight DR
// time (UTC-4) was already "tomorrow" by the server's clock, so its
// commission could land in the wrong month's statement. Separately, bounds
// were sent as bare "YYYY-MM-DD" strings, which Postgres casts to timestamptz
// using its OWN session timezone (UTC), a second independent source of drift.
// Fix: compute "today" from the actual DR calendar date (via Intl, not the
// server's local getters), and send full ISO timestamps with an explicit
// "-04:00" offset (DR has no DST, so this is constant year-round) so the cast
// is unambiguous regardless of session tz.

import { createClient } from '@/lib/supabase/server'

export type CommissionsPeriodMode = 'this-month' | 'last-month' | 'this-year'

export type CommissionsPeriods = {
  start: string
  end: string
  label: string
}

// --- period math (same scheme as sales-report.ts / pnl.ts) -----------------

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

export function computeCommissionsPeriods(
  mode: CommissionsPeriodMode,
  now: Date = new Date(),
): CommissionsPeriods {
  const { y, m } = drToday(now)

  if (mode === 'this-year') {
    return {
      start: drMidnightISO(y, 1, 1),
      end: drMidnightISO(y + 1, 1, 1),
      label: String(y),
    }
  }
  if (mode === 'last-month') {
    const curM = m === 1 ? 12 : m - 1
    const curY = m === 1 ? y - 1 : y
    return {
      start: drMidnightISO(curY, curM, 1),
      end: drMidnightISO(y, m, 1),
      label: `${MONTHS[curM - 1]} ${curY}`,
    }
  }
  const nextM = m === 12 ? 1 : m + 1
  const nextY = m === 12 ? y + 1 : y
  return {
    start: drMidnightISO(y, m, 1),
    end: drMidnightISO(nextY, nextM, 1),
    label: `${MONTHS[m - 1]} ${y}`,
  }
}

/** Custom range: inclusive [startYmd, endYmd] -> half-open [start, end+1day),
 *  anchored at Dominican-Republic midnight rather than UTC midnight. */
export function customCommissionsPeriods(startYmd: string, endYmd: string): CommissionsPeriods {
  const parse = (s: string): { y: number; m: number; d: number } => {
    const [yy, mm, dd] = s.split('-').map(Number)
    return { y: yy, m: mm ?? 1, d: dd ?? 1 }
  }
  const start = parse(startYmd)
  const endInclusive = parse(endYmd)
  const end = addDays(endInclusive.y, endInclusive.m, endInclusive.d, 1)
  return {
    start: drMidnightISO(start.y, start.m, start.d),
    end: drMidnightISO(end.y, end.m, end.d),
    label: `${startYmd} \u2192 ${endYmd}`,
  }
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
