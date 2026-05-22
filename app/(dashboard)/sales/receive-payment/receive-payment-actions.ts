'use server'

// Recibir Pago - write action.
//
// Wraps the owner-gated receive_payment RPC, which atomically creates one
// payment_receipts row + one posted sale_payments row per invoice (each posted
// to the ledger via post_sale_payment_to_ledger, account credited once per
// allocation), and recomputes each invoice's status. The RPC enforces that the
// allocations are all positive; we re-validate here for a friendly pre-flight
// error. Money in CENTS. Revalidates /sales and /money-accounts so invoice
// statuses and account balances refresh after the deposit lands.

import { revalidatePath } from 'next/cache'

import { requireOwner } from '@/lib/auth/guard'
import { createClient } from '@/lib/supabase/server'

export type PaymentMethod =
  | 'cash'
  | 'card'
  | 'transfer'
  | 'paypal'
  | 'stripe'
  | 'credit'

export type ReceivePaymentAllocation = {
  sale_id: string
  amount_cents: number
}

export type ReceivePaymentInput = {
  moneyAccountId: string
  method: PaymentMethod
  receivedAt: string // ISO datetime or YYYY-MM-DD
  reference?: string
  allocations: ReceivePaymentAllocation[]
}

export type ReceivePaymentResult =
  | { ok: true; receiptId: string; depositCents: number; invoicesPaid: number }
  | { ok: false; error: string }

export async function receivePayment(
  input: ReceivePaymentInput,
): Promise<ReceivePaymentResult> {
  await requireOwner()

  if (!input.moneyAccountId) {
    return { ok: false, error: 'Escoge una cuenta donde entró el dinero.' }
  }
  if (!input.allocations || input.allocations.length === 0) {
    return { ok: false, error: 'Asigna el pago a por lo menos una factura.' }
  }
  for (const a of input.allocations) {
    if (!a.sale_id) return { ok: false, error: 'Factura inválida en la asignación.' }
    if (!Number.isInteger(a.amount_cents) || a.amount_cents <= 0) {
      return { ok: false, error: 'Cada monto asignado debe ser mayor que cero.' }
    }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('receive_payment', {
    p_money_account_id: input.moneyAccountId,
    p_method: input.method,
    p_received_at: input.receivedAt,
    p_reference: input.reference?.trim() || null,
    p_allocations: input.allocations,
  })
  if (error) return { ok: false, error: error.message }

  revalidatePath('/sales')
  revalidatePath('/money-accounts')

  const d = data as {
    receipt_id: string
    deposit_cents: number
    invoices_paid: number
  }
  return {
    ok: true,
    receiptId: d.receipt_id,
    depositCents: d.deposit_cents,
    invoicesPaid: d.invoices_paid,
  }
}
