// Reports - Balance Sheet data layer.
//
// Thin wrapper around the read-only balance_sheet() RPC. The balance sheet is a
// point-in-time snapshot ("as of now"), so there are no period arguments. All
// money values are in CENTS.
//
// Assets    = cash (money accounts) + inventory (at cost) + receivables
// Liabilities = supplier bills owed (unpaid complete + pending POs, USD->DOP at
//               the live rate) + commissions owed (pending payouts)
// Equity    = assets - liabilities  (derived in the UI; the "net worth" that
//             makes the sheet balance)
//
// Cash is split business/private so the screen's Business/Everything toggle can
// adjust the cash line; inventory, receivables and supplier bills are inherently
// business and do not change with the toggle.

import { createClient } from '@/lib/supabase/server'

export type BalanceSheetCash = {
  all_cents: number
  business_cents: number
  private_cents: number
}

export type SupplierOwed = {
  /** Received but unpaid (complete POs). */
  received_cents: number
  /** Ordered, unpaid, not yet received (pending POs). */
  pending_cents: number
  total_cents: number
}

export type BalanceSheet = {
  /** USD->DOP rate used to value unpaid supplier bills. */
  live_rate: number
  cash: BalanceSheetCash
  inventory_cents: number
  receivables_cents: number
  supplier_owed: SupplierOwed
  commissions_owed_cents: number
}

export async function fetchBalanceSheet(): Promise<BalanceSheet> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('balance_sheet')
  if (error) throw new Error(error.message)
  return data as BalanceSheet
}
