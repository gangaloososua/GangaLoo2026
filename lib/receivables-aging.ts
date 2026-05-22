// Reports - Receivables aging data layer.
//
// Thin wrapper around the read-only receivables_aging() RPC. A point-in-time
// snapshot ("as of now") of open receivables (sales with status confirmed or
// partially_paid and a positive outstanding balance). All money in CENTS.
//
// Outstanding = total_cents - paid_cents. Age is measured from confirmed_at
// (days overdue), bucketed Current / 1-30 / 31-60 / 61-90 / 90+. The buckets
// always include all five labels (zero-filled) in order, so the UI can render a
// stable axis. `invoices` lists each open sale, most overdue first.

import { createClient } from '@/lib/supabase/server'

export type AgingBucket = { bucket: string; amount_cents: number; count: number }

export type AgingInvoice = {
  invoice: string | null
  customer: string
  confirmed_at: string | null
  days_overdue: number
  bucket: string
  outstanding_cents: number
}

export type ReceivablesAging = {
  total_outstanding_cents: number
  open_count: number
  buckets: AgingBucket[]
  invoices: AgingInvoice[]
}

export async function fetchReceivablesAging(): Promise<ReceivablesAging> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('receivables_aging')
  if (error) throw new Error(error.message)
  return data as ReceivablesAging
}
