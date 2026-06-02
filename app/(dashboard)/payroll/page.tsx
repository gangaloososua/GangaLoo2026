// app/(dashboard)/payroll/page.tsx
// Payroll — employees, pay setup, attendance, and the pay-run calculator.
// Owner/admin only.
//
// Payroll_* tables are read through the service-role admin client (RLS-locked,
// no policies). Staff NAMES, money accounts and expense categories live in
// owner-readable tables, so those go through the regular server client.

import { requireOwner } from '@/lib/auth/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { listAccounts } from '@/lib/money-accounts'
import { PayrollView } from './payroll-view'
import type {
  PayComponent,
  PayrollEmployeeRow,
  StaffOption,
  MoneyAccountOption,
  ExpenseCategoryOption,
} from '@/lib/payroll'

export const dynamic = 'force-dynamic'

const STAFF_ROLES = ['owner', 'admin', 'seller', 'distributor']

type EmpRaw = {
  id: string
  profile_id: string
  is_active: boolean
  default_late_deduction_cents: number
  default_absent_deduction_cents: number
  extra_day_pay_cents: number
  notes: string | null
  created_at: string
}

type StaffRaw = { id: string; full_name: string | null; role: string | null }
type CatRaw = { id: string; name: string; scope: string | null }

export default async function PayrollPage() {
  await requireOwner()
  const admin = createAdminClient()
  const server = await createClient()

  const [empRes, compRes, staffRes, catRes, accounts] = await Promise.all([
    admin
      .from('payroll_employees')
      .select('*')
      .order('created_at', { ascending: true }),
    admin
      .from('payroll_pay_components')
      .select('*')
      .order('created_at', { ascending: true }),
    server
      .from('profiles')
      .select('id, full_name, role')
      .in('role', STAFF_ROLES)
      .order('full_name', { ascending: true }),
    server
      .from('account_categories')
      .select('id, name, scope')
      .eq('type', 'expense')
      .eq('is_active', true)
      .order('display_order', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true }),
    listAccounts({ includePrivateAndMixed: true }),
  ])

  if (empRes.error) throw new Error(empRes.error.message)
  if (compRes.error) throw new Error(compRes.error.message)
  if (staffRes.error) throw new Error(staffRes.error.message)
  if (catRes.error) throw new Error(catRes.error.message)

  const staffRows = (staffRes.data ?? []) as unknown as StaffRaw[]
  const profileById = new Map<string, StaffRaw>()
  for (const p of staffRows) profileById.set(p.id, p)

  const empRows = (empRes.data ?? []) as unknown as EmpRaw[]
  const employees: PayrollEmployeeRow[] = empRows.map((e) => {
    const p = profileById.get(e.profile_id)
    return {
      id: e.id,
      profile_id: e.profile_id,
      is_active: e.is_active,
      default_late_deduction_cents: e.default_late_deduction_cents,
      default_absent_deduction_cents: e.default_absent_deduction_cents,
      extra_day_pay_cents: e.extra_day_pay_cents ?? 0,
      notes: e.notes,
      created_at: e.created_at,
      fullName: p?.full_name ?? '(unknown)',
      role: p?.role ?? '',
    }
  })

  const components = (compRes.data ?? []) as unknown as PayComponent[]

  const usedProfileIds = new Set(employees.map((e) => e.profile_id))
  const availableStaff: StaffOption[] = staffRows
    .filter((p) => !usedProfileIds.has(p.id))
    .map((p) => ({ id: p.id, fullName: p.full_name ?? '(no name)', role: p.role ?? '' }))

  const moneyAccounts: MoneyAccountOption[] = (accounts ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    scope: a.scope,
    currency: a.currency,
  }))

  const expenseCategories: ExpenseCategoryOption[] = (
    (catRes.data ?? []) as unknown as CatRaw[]
  ).map((c) => ({ id: c.id, name: c.name, scope: c.scope ?? '' }))

  return (
    <PayrollView
      employees={employees}
      components={components}
      availableStaff={availableStaff}
      moneyAccounts={moneyAccounts}
      expenseCategories={expenseCategories}
    />
  )
}
