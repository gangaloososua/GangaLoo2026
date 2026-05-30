// Seller self-service - "My sales" data layer.
//
// Wraps the SECURITY DEFINER my_seller_financials() RPC, which self-scopes to
// the signed-in seller via auth.uid() (no arguments). Returns their invoices
// sold, payments collected, and commission totals. All money in CENTS.

import { createClient } from '@/lib/supabase/server'
import type {
  PersonSaleRow,
  PersonPaymentRow,
  PersonCommissionRow,
} from '@/lib/person-financials'

export type MySellerFinancials =
  | { ok: false; reason: string }
  | {
      ok: true
      profile_id: string
      name: string | null
      sold_count: number
      open_count: number
      lifetime_sold_cents: number
      sold_outstanding_cents: number
      collected_cents: number
      payments_count: number
      earned_cents: number
      commission_paid_cents: number
      commission_owed_cents: number
      commission_count: number
      sales: PersonSaleRow[]
      payments: PersonPaymentRow[]
      commissions: PersonCommissionRow[]
    }

export async function fetchMySellerFinancials(): Promise<MySellerFinancials> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('my_seller_financials')
  if (error) throw new Error(`fetchMySellerFinancials: ${error.message}`)
  return data as MySellerFinancials
}
