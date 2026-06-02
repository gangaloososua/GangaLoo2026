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

export function formatDOP(cents: number): string {
  return new Intl.NumberFormat('es-DO', {
    style: 'currency',
    currency: 'DOP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format((cents || 0) / 100)
}
