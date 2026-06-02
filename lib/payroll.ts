// lib/payroll.ts
// Pure, client-safe payroll types + helpers. NO server imports, so both the
// server page and the client views can import from here. Money in CENTS.

export type PayFrequency = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly'

export const FREQUENCIES: PayFrequency[] = [
  'weekly',
  'biweekly',
  'semimonthly',
  'monthly',
]

export const FREQUENCY_LABEL: Record<PayFrequency, string> = {
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  semimonthly: 'Twice a month',
  monthly: 'Monthly',
}

export type AttendanceStatus = 'present' | 'late' | 'absent'

export type PayComponent = {
  id: string
  employee_id: string
  label: string
  amount_cents: number
  frequency: PayFrequency
  is_active: boolean
  created_at: string
}

// Employee row joined with the staff profile's name + role for display.
export type PayrollEmployeeRow = {
  id: string
  profile_id: string
  is_active: boolean
  default_late_deduction_cents: number
  default_absent_deduction_cents: number
  extra_day_pay_cents: number
  notes: string | null
  created_at: string
  fullName: string
  role: string
}

export type StaffOption = { id: string; fullName: string; role: string }

// One stored attendance mark. work_date is 'YYYY-MM-DD'.
export type AttendanceRecord = {
  id: string
  employee_id: string
  work_date: string
  status: AttendanceStatus
  deduction_cents: number
  note: string | null
}

// One stored advance ("adelanto"). advance_date is 'YYYY-MM-DD'.
export type AdvanceRecord = {
  id: string
  employee_id: string
  advance_date: string
  amount_cents: number
  note: string | null
}

export function formatDOP(cents: number): string {
  return new Intl.NumberFormat('es-DO', {
    style: 'currency',
    currency: 'DOP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format((cents || 0) / 100)
}

// --- Date helpers (month is 1-12; all date strings are 'YYYY-MM-DD') --------

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

// Parse 'YYYY-MM-DD' to a LOCAL date (no timezone shift).
export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

// Every day of a month as 'YYYY-MM-DD'.
export function monthDayList(year: number, month: number): string[] {
  const daysInMonth = new Date(year, month, 0).getDate()
  const out: string[] = []
  for (let d = 1; d <= daysInMonth; d++) out.push(`${year}-${pad2(month)}-${pad2(d)}`)
  return out
}

// First day of the month and first day of the NEXT month (for >= / < queries).
export function monthBounds(year: number, month: number): { start: string; end: string } {
  const start = `${year}-${pad2(month)}-01`
  const ny = month === 12 ? year + 1 : year
  const nm = month === 12 ? 1 : month + 1
  return { start, end: `${ny}-${pad2(nm)}-01` }
}

// 0 = Sun ... 6 = Sat
export function dayOfWeek(dateStr: string): number {
  return parseDate(dateStr).getDay()
}

// Normal work day = Tue(2) .. Sat(6).
export function isBaselineWorkDay(dateStr: string): boolean {
  const d = dayOfWeek(dateStr)
  return d >= 2 && d <= 6
}

// All 'YYYY-MM-DD' between start and end inclusive.
export function dateRangeList(startStr: string, endStr: string): string[] {
  const out: string[] = []
  const start = parseDate(startStr)
  const end = parseDate(endStr)
  if (end < start) return out
  const cur = new Date(start)
  while (cur <= end) {
    out.push(isoDate(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return out
}

// How many pay periods of a given frequency START within [start,end] inclusive.
// - weekly:    count of weeks; a week "starts" each Monday. We count Mondays in range,
//              but to be predictable for partial ranges we count by 7-day blocks from start.
// - biweekly:  every 14 days from start.
// - semimonthly (twice a month): the 1st and the 16th of each month in range.
// - monthly:   the 1st of each month in range.
export function countPeriods(
  frequency: PayFrequency,
  startStr: string,
  endStr: string,
): number {
  const start = parseDate(startStr)
  const end = parseDate(endStr)
  if (end < start) return 0

  if (frequency === 'semimonthly') {
    let count = 0
    for (const ds of dateRangeList(startStr, endStr)) {
      const day = parseDate(ds).getDate()
      if (day === 1 || day === 16) count++
    }
    return count
  }
  if (frequency === 'monthly') {
    let count = 0
    for (const ds of dateRangeList(startStr, endStr)) {
      if (parseDate(ds).getDate() === 1) count++
    }
    return count
  }
  // weekly / biweekly: count blocks whose START lands in the range, stepping
  // from the range start.
  const step = frequency === 'weekly' ? 7 : 14
  let count = 0
  const cur = new Date(start)
  while (cur <= end) {
    count++
    cur.setDate(cur.getDate() + step)
  }
  return count
}
