'use server'
// Round 14c.3 - courier payments server actions
//
// Thin TypeScript wrapper around the create_courier_payment RPC
// (db/migrations/round-14c-courier-payments-rpc-01-create-courier-payment.sql).
//
// Owner-only per RBAC. Form-side validation is light; the RPC
// re-validates and is the source of truth (sum match, courier kind,
// allocations non-empty, all FK refs exist).
//
// 14c is write-once for courier_payments rows: there is no
// updateCourierPayment / deleteCourierPayment in v1. Mistakes are
// corrected via SQL (delete cascades allocations; PO transport
// shares need a manual re-recompute).
//
// Spec: docs/round-14c-courier-payments.md

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireOwner } from '@/lib/auth/guard'

// Locally-widened result type: this action returns the new id so
// the form can redirect to /courier-payments/[id] on success.
export type CreateCourierPaymentResult =
  | { ok: true; id: string }
  | { ok: false; error: string }

export type CreateCourierPaymentInput = {
  courierId: string
  paidAt: string // ISO timestamp
  amountDopTotal: number
  moneyAccountId: string
  categoryId: string
  description: string | null
  reference: string | null
  allocations: Array<{
    purchaseOrderId: string
    amountDop: number
  }>
}

export async function createCourierPayment(
  input: CreateCourierPaymentInput,
): Promise<CreateCourierPaymentResult> {
  await requireOwner()

  // Light client-side validation. RPC re-validates authoritatively.
  if (!input.courierId) return { ok: false, error: 'Courier is required' }
  if (!input.paidAt) return { ok: false, error: 'Paid-at timestamp is required' }
  if (!Number.isFinite(input.amountDopTotal) || input.amountDopTotal <= 0) {
    return { ok: false, error: 'Amount must be a positive number' }
  }
  if (!input.moneyAccountId) return { ok: false, error: 'Payment account is required' }
  if (!input.categoryId) return { ok: false, error: 'A courier expense category is required' }
  if (!Array.isArray(input.allocations) || input.allocations.length === 0) {
    return { ok: false, error: 'At least one allocation is required' }
  }
  const sum = input.allocations.reduce((acc, a) => acc + (a.amountDop || 0), 0)
  if (Math.abs(sum - input.amountDopTotal) > 0.01) {
    return {
      ok: false,
      error: `Allocations sum (${sum.toFixed(2)}) does not match total (${input.amountDopTotal.toFixed(2)})`,
    }
  }
  for (const a of input.allocations) {
    if (!a.purchaseOrderId) {
      return { ok: false, error: 'Each allocation must select a purchase order' }
    }
    if (!Number.isFinite(a.amountDop) || a.amountDop <= 0) {
      return { ok: false, error: 'Each allocation amount must be a positive number' }
    }
  }

  const supabase = await createClient()

  const { data, error } = await supabase.rpc('create_courier_payment', {
    p_courier_id: input.courierId,
    p_paid_at: input.paidAt,
    p_amount_dop_total: input.amountDopTotal,
    p_money_account_id: input.moneyAccountId,
    p_category_id: input.categoryId,
    p_description: input.description,
    p_reference: input.reference,
    p_allocations: input.allocations.map((a) => ({
      purchase_order_id: a.purchaseOrderId,
      amount_dop: a.amountDop,
    })),
  })

  if (error) {
    return { ok: false, error: error.message }
  }

  const newId = typeof data === 'string' ? data : String(data)

  // Revalidate the list, the new detail page, and every affected PO
  // detail page (their transport shares + landed costs changed).
  revalidatePath('/courier-payments')
  revalidatePath(`/courier-payments/${newId}`)
  for (const a of input.allocations) {
    revalidatePath(`/purchases/${a.purchaseOrderId}`)
  }

  return { ok: true, id: newId }
}
