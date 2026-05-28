'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth/guard'
import { createClient } from '@/lib/supabase/server'

export type Allocation = {
  poId: string
  dopAmountCents: number
  categoryId: string
}

export type SubmitInput = {
  accountId: string
  paidAt: string // ISO timestamp
  reference: string | null
  officialRate: number
  allocations: Allocation[]
  notes: string | null
}

export type ActionResult =
  | { ok: true; receiptId: string }
  | { ok: false; error: string }

export async function paySuppliersBatch(input: SubmitInput): Promise<ActionResult> {
  await requireRole(['owner', 'admin'] as const)

  if (!input.accountId) return { ok: false, error: 'Account is required.' }
  if (!input.paidAt) return { ok: false, error: 'Paid date is required.' }
  if (!input.officialRate || input.officialRate <= 0) {
    return { ok: false, error: 'Official rate must be greater than 0.' }
  }
  if (!input.allocations || input.allocations.length === 0) {
    return { ok: false, error: 'At least one allocation is required.' }
  }
  for (const a of input.allocations) {
    if (!a.poId) return { ok: false, error: 'Allocation is missing a purchase order.' }
    if (!a.categoryId) {
      return { ok: false, error: 'Every allocation needs an expense category.' }
    }
    if (!a.dopAmountCents || a.dopAmountCents <= 0) {
      return { ok: false, error: 'Each allocation must be greater than 0.' }
    }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('pay_suppliers_batch', {
    p_account_id: input.accountId,
    p_paid_at: input.paidAt,
    p_reference: input.reference,
    p_official_rate: input.officialRate,
    p_allocations: input.allocations.map((a) => ({
      po_id: a.poId,
      dop_amount_cents: a.dopAmountCents,
      category_id: a.categoryId,
    })),
    p_notes: input.notes,
  })

  if (error) return { ok: false, error: error.message }

  revalidatePath('/purchases')
  revalidatePath('/money-accounts')
  revalidatePath('/accounting')
  return { ok: true, receiptId: data as string }
}
