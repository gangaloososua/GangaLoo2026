// People detail view - per-person financials data layer.
//
// Thin wrapper around the read-only person_financials(uuid) RPC. Returns both
// the customer side (their sales, their payments, what they owe) and the
// seller side (commissions earned / paid / owed, PLUS the invoices they sold
// and the payments collected on those invoices). All money in CENTS.

import { createClient } from '@/lib/supabase/server'

export type PersonSaleRow = {
  id: string
  invoice_number: string | null
  sold_at: string
  status: string
  source: string
  total_cents: number
  paid_cents: number
  outstanding_cents: number
}

export type PersonPaymentRow = {
  id: string
  sale_id: string
  invoice_number: string | null
  method: string
  amount_cents: number
  paid_at: string
  reference: string | null
}

export type PersonCommissionRow = {
  id: string
  sale_id: string
  invoice_number: string | null
  sold_at: string
  earner_role: string
  percent: number
  amount_cents: number
  status: string
}

export type PersonFinancials = {
  customer: {
    owed_cents: number
    open_count: number
    paid_cents: number
    lifetime_sales_cents: number
    sales_count: number
    sales: PersonSaleRow[]
    payments: PersonPaymentRow[]
  }
  seller: {
    // commissions (existing)
    earned_cents: number
    paid_cents: number
    owed_cents: number
    count: number
    commissions: PersonCommissionRow[]
    // invoices sold + payments collected (keyed on sales.seller_id)
    sold_count: number
    open_count: number
    lifetime_sold_cents: number
    sold_outstanding_cents: number
    collected_cents: number
    payments_count: number
    sales: PersonSaleRow[]
    payments: PersonPaymentRow[]
  }
}

export async function fetchPersonFinancials(
  profileId: string,
): Promise<PersonFinancials> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('person_financials', {
    p_profile_id: profileId,
  })
  if (error) throw new Error(`fetchPersonFinancials: ${error.message}`)
  return data as PersonFinancials
}
