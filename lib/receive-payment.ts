// Recibir Pago - data layer.
//
// Thin wrapper around the read-only open_invoices_for_payment() RPC, which
// lists every open invoice (status confirmed or partially_paid with a positive
// outstanding balance) for the multi-invoice payment-receiver screen. All money
// values are in CENTS. Outstanding = total_cents - paid_cents.
//
// Shown in one flat list (not grouped by customer) on purpose: some invoices
// have no customer, and one deposit can pay invoices across several customers/
// sellers, so the screen lists them all and lets the operator allocate freely.

import { createClient } from '@/lib/supabase/server'

export type OpenInvoice = {
  id: string
  invoice_number: string | null
  sold_at: string
  status: 'confirmed' | 'partially_paid'
  total_cents: number
  paid_cents: number
  outstanding_cents: number
  customer_name: string | null
  seller_name: string | null
}

export async function fetchOpenInvoicesForPayment(): Promise<OpenInvoice[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('open_invoices_for_payment')
  if (error) throw new Error(error.message)
  return (data ?? []) as OpenInvoice[]
}
