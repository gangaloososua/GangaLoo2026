// lib/payroll.ts
// Pure, client-safe payroll types + helpers. NO server imports, so both the
// server page and the client view can import from here. Money in CENTS.

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

export function formatDOP(cents: number): string {
  return new Intl.NumberFormat('es-DO', {
    style: 'currency',
    currency: 'DOP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format((cents || 0) / 100)
}

// --- Date helpers (month is 1-12) -----------------------------------------

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

// Every day of a month as 'YYYY-MM-DD'.
export function monthDayList(year: number, month: number): string[] {
  const daysInMonth = new Date(year, month, 0).getDate()
  const out: string[] = []
  for (let d = 1; d <= daysInMonth; d++) out.push(`${year}-${pad2(month)}-${pad2(d)}`)
  return out
}

// First day of the month and first day of the NEXT month (for >= / < range queries).
export function monthBounds(year: number, month: number): { start: string; end: string } {
  const start = `${year}-${pad2(month)}-01`
  const ny = month === 12 ? year + 1 : year
  const nm = month === 12 ? 1 : month + 1
  return { start, end: `${ny}-${pad2(nm)}-01` }
}
