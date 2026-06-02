'use server'

// app/(dashboard)/mi-pago/actions.ts
// Seller self-view data. Calls the self-scoped get_my_pay_summary RPC through
// the regular server client, so auth.uid() is the signed-in person and the DB
// guarantees they only ever see their OWN pay. Read-only.

import { createClient } from '@/lib/supabase/server'
import { requireAdminCaller } from '@/lib/auth/guard'

export type MyPayComponent = {
  label: string
  amount_cents: number
  frequency: string
  periods: number
  subtotal_cents: number
}
export type MyPayAdvance = {
  advance_date: string
  amount_cents: number
  note: string | null
}
export type MyPaySummary = {
  on_payroll: boolean
  start?: string
  end?: string
  components?: MyPayComponent[]
  pay_total_cents?: number
  baseline_days?: number
  worked_days?: number
  extra_days?: number
  extra_day_pay_cents?: number
  extra_pay_cents?: number
  late_days?: number
  absent_days?: number
  late_deduction_cents?: number
  absent_deduction_cents?: number
  deductions_cents?: number
  advances?: MyPayAdvance[]
  advances_cents?: number
  net_cents?: number
}

export type LoadMyPayResult =
  | { ok: true; data: MyPaySummary }
  | { ok: false; error: string }

export async function loadMyPay(
  start: string,
  end: string,
): Promise<LoadMyPayResult> {
  await requireAdminCaller()
  if (!start || !end) return { ok: false, error: 'Invalid range.' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_my_pay_summary', {
    p_start: start,
    p_end: end,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: data as MyPaySummary }
}
