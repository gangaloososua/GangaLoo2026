'use server'

// app/(dashboard)/payroll/actions.ts
// Server actions for Payroll (employees, pay components, attendance). The
// payroll_* tables have RLS on with no policies, so we reach them through the
// service-role client (createAdminClient). Every action is gated by
// requireOwner() first. Money is stored in CENTS.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOwner } from '@/lib/auth/guard'
import {
  FREQUENCIES,
  monthBounds,
  type PayFrequency,
  type AttendanceStatus,
  type AttendanceRecord,
} from '@/lib/payroll'

export type ActionResult = { ok: true } | { ok: false; error: string }

// --- Employees -------------------------------------------------------------

export async function addEmployee(profileId: string): Promise<ActionResult> {
  await requireOwner()
  if (!profileId) return { ok: false, error: 'Pick a staff member first.' }
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('payroll_employees')
    .insert({ profile_id: profileId })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/payroll')
  return { ok: true }
}

export type UpdateEmployeeInput = {
  id: string
  isActive: boolean
  defaultLateDeductionCents: number
  defaultAbsentDeductionCents: number
  notes: string
}

export async function updateEmployee(
  input: UpdateEmployeeInput,
): Promise<ActionResult> {
  await requireOwner()
  if (!input.id) return { ok: false, error: 'Missing employee id.' }
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('payroll_employees')
    .update({
      is_active: !!input.isActive,
      default_late_deduction_cents: Math.max(
        0,
        Math.round(input.defaultLateDeductionCents || 0),
      ),
      default_absent_deduction_cents: Math.max(
        0,
        Math.round(input.defaultAbsentDeductionCents || 0),
      ),
      notes: (input.notes || '').trim() || null,
    })
    .eq('id', input.id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/payroll')
  return { ok: true }
}

export async function removeEmployee(id: string): Promise<ActionResult> {
  await requireOwner()
  if (!id) return { ok: false, error: 'Missing employee id.' }
  const supabase = createAdminClient()
  // Cascade deletes their pay components, attendance and advances.
  const { error } = await supabase
    .from('payroll_employees')
    .delete()
    .eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/payroll')
  return { ok: true }
}

// --- Pay components --------------------------------------------------------

export type SaveComponentInput = {
  id?: string
  employeeId: string
  label: string
  amountCents: number
  frequency: string
}

export async function saveComponent(
  input: SaveComponentInput,
): Promise<ActionResult> {
  await requireOwner()
  if (!input.employeeId) return { ok: false, error: 'Missing employee.' }
  const label = (input.label || '').trim()
  if (!label) return { ok: false, error: 'A label is required.' }
  const amount = Math.max(0, Math.round(input.amountCents || 0))
  if (amount <= 0) return { ok: false, error: 'Amount must be greater than zero.' }
  const frequency: PayFrequency = (FREQUENCIES as string[]).includes(
    input.frequency,
  )
    ? (input.frequency as PayFrequency)
    : 'weekly'

  const supabase = createAdminClient()
  if (input.id) {
    const { error } = await supabase
      .from('payroll_pay_components')
      .update({ label, amount_cents: amount, frequency })
      .eq('id', input.id)
    if (error) return { ok: false, error: error.message }
  } else {
    const { error } = await supabase
      .from('payroll_pay_components')
      .insert({ employee_id: input.employeeId, label, amount_cents: amount, frequency })
    if (error) return { ok: false, error: error.message }
  }
  revalidatePath('/payroll')
  return { ok: true }
}

export async function removeComponent(id: string): Promise<ActionResult> {
  await requireOwner()
  if (!id) return { ok: false, error: 'Missing component id.' }
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('payroll_pay_components')
    .delete()
    .eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/payroll')
  return { ok: true }
}

// --- Attendance ------------------------------------------------------------

export type LoadAttendanceResult =
  | { ok: true; rows: AttendanceRecord[] }
  | { ok: false; error: string }

export async function loadAttendance(
  employeeId: string,
  year: number,
  month: number,
): Promise<LoadAttendanceResult> {
  await requireOwner()
  if (!employeeId) return { ok: false, error: 'No employee selected.' }
  const { start, end } = monthBounds(year, month)
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('payroll_attendance')
    .select('id, employee_id, work_date, status, deduction_cents, note')
    .eq('employee_id', employeeId)
    .gte('work_date', start)
    .lt('work_date', end)
  if (error) return { ok: false, error: error.message }
  return { ok: true, rows: (data ?? []) as unknown as AttendanceRecord[] }
}

export type AttendanceDayInput = {
  workDate: string
  status: AttendanceStatus
  deductionCents: number
  note: string
}

const STATUSES: AttendanceStatus[] = ['present', 'late', 'absent']

export async function saveAttendanceMonth(
  employeeId: string,
  days: AttendanceDayInput[],
): Promise<ActionResult> {
  await requireOwner()
  if (!employeeId) return { ok: false, error: 'No employee selected.' }
  const rows = (days || [])
    .filter((d) => d && d.workDate && STATUSES.includes(d.status))
    .map((d) => ({
      employee_id: employeeId,
      work_date: d.workDate,
      status: d.status,
      deduction_cents:
        d.status === 'present' ? 0 : Math.max(0, Math.round(d.deductionCents || 0)),
      note: (d.note || '').trim() || null,
    }))
  if (rows.length === 0) return { ok: true }
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('payroll_attendance')
    .upsert(rows, { onConflict: 'employee_id,work_date' })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/payroll')
  return { ok: true }
}
