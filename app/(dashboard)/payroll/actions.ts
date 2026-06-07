'use server'

// app/(dashboard)/payroll/actions.ts
// Server actions for Payroll (employees, pay components, attendance, advances,
// and pay-run data loading).
//
// CLIENT CHOICE:
// - payroll_* CRUD + reads go through the service-role admin client
//   (createAdminClient), since those tables are RLS-locked with no policies.
// - Advance POST/REMOVE go through the REGULAR server client (createClient),
//   because they call post_payroll_advance / remove_payroll_advance, which
//   (like the supplier-payment RPCs) gate on auth.uid() being owner/admin and
//   reuse post_transaction / reverse_transaction. The admin client has no
//   auth.uid(), so it would fail that gate.
//
// Every action is gated by requireOwner() first. Money is stored in CENTS.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { requireOwner } from '@/lib/auth/guard'
import {
  FREQUENCIES,
  monthBounds,
  type PayFrequency,
  type AttendanceStatus,
  type AttendanceRecord,
  type AdvanceRecord,
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
  extraDayPayCents: number
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
      extra_day_pay_cents: Math.max(0, Math.round(input.extraDayPayCents || 0)),
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

// All statuses that may be saved. 'off' is a rest day (no deduction, ignored by
// the pay calculator); present/late/absent are as before.
const STATUSES: AttendanceStatus[] = ['present', 'late', 'absent', 'off']

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
      // Only late/absent carry a deduction; present and off are always 0.
      deduction_cents:
        d.status === 'late' || d.status === 'absent'
          ? Math.max(0, Math.round(d.deductionCents || 0))
          : 0,
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

// --- Advances (post real money via the ledger RPCs, as the logged-in owner) -

export type SaveAdvanceInput = {
  employeeId: string
  advanceDate: string
  amountCents: number
  note: string
  moneyAccountId: string
  categoryId: string
}

export async function addAdvance(input: SaveAdvanceInput): Promise<ActionResult> {
  await requireOwner()
  if (!input.employeeId) return { ok: false, error: 'No employee selected.' }
  if (!input.advanceDate) return { ok: false, error: 'Pick a date.' }
  const amount = Math.max(0, Math.round(input.amountCents || 0))
  if (amount <= 0) return { ok: false, error: 'Amount must be greater than zero.' }
  if (!input.moneyAccountId) return { ok: false, error: 'Pick the account it was paid from.' }
  if (!input.categoryId) return { ok: false, error: 'Pick an expense category.' }

  // Regular server client -> runs as the logged-in owner so the RPC's
  // auth.uid() owner/admin gate (and post_transaction's) passes.
  const supabase = await createClient()
  const { error } = await supabase.rpc('post_payroll_advance', {
    p_employee_id: input.employeeId,
    p_advance_date: input.advanceDate,
    p_amount_cents: amount,
    p_note: (input.note || '').trim() || null,
    p_money_account_id: input.moneyAccountId,
    p_category_id: input.categoryId,
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/payroll')
  return { ok: true }
}

export async function removeAdvance(id: string): Promise<ActionResult> {
  await requireOwner()
  if (!id) return { ok: false, error: 'Missing advance id.' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('remove_payroll_advance', {
    p_advance_id: id,
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/payroll')
  return { ok: true }
}

// --- Pay-run data (attendance + advances within a date range) --------------

export type PayRunData = {
  attendance: AttendanceRecord[]
  advances: AdvanceRecord[]
}
export type LoadPayRunResult =
  | { ok: true; data: PayRunData }
  | { ok: false; error: string }

export async function loadPayRunData(
  employeeId: string,
  startDate: string,
  endDate: string,
): Promise<LoadPayRunResult> {
  await requireOwner()
  if (!employeeId) return { ok: false, error: 'No employee selected.' }
  if (!startDate || !endDate) return { ok: false, error: 'Pick a date range.' }
  const supabase = createAdminClient()

  const [attRes, advRes] = await Promise.all([
    supabase
      .from('payroll_attendance')
      .select('id, employee_id, work_date, status, deduction_cents, note')
      .eq('employee_id', employeeId)
      .gte('work_date', startDate)
      .lte('work_date', endDate),
    supabase
      .from('payroll_advances')
      .select('id, employee_id, advance_date, amount_cents, note')
      .eq('employee_id', employeeId)
      .gte('advance_date', startDate)
      .lte('advance_date', endDate)
      .order('advance_date', { ascending: true }),
  ])

  if (attRes.error) return { ok: false, error: attRes.error.message }
  if (advRes.error) return { ok: false, error: advRes.error.message }

  return {
    ok: true,
    data: {
      attendance: (attRes.data ?? []) as unknown as AttendanceRecord[],
      advances: (advRes.data ?? []) as unknown as AdvanceRecord[],
    },
  }
}
