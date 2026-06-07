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
// business and do not change with the toggle. Foreign-currency cash accounts
// (EUR/USD) are converted to pesos inside the RPC at the latest monthly rate;
// cash_rates reports the rates that were applied (Round 65a).
//
// Monthly snapshots (Round 64a): we also bank a copy of the live sheet per
// calendar month so the screen can show past months. The snapshot RPCs gate on
// owner/admin in the DB, so they MUST be called via the regular server client
// (auth.uid() must be present), exactly like fetchBalanceSheet below.

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

/** DOP-per-unit rates used to convert foreign cash to pesos (null = none set). */
export type CashRates = {
  eur: number | null
  usd: number | null
}

export type BalanceSheet = {
  /** USD->DOP rate used to value unpaid supplier bills. */
  live_rate: number
  cash: BalanceSheetCash
  inventory_cents: number
  receivables_cents: number
  supplier_owed: SupplierOwed
  commissions_owed_cents: number
  /** Optional: present from Round 65a on; older snapshots may not have it. */
  cash_rates?: CashRates
}

/** One saved monthly snapshot (metadata only, for the picker). */
export type BalanceSheetSnapshotMeta = {
  /** First day of the month, 'YYYY-MM-DD'. */
  period_month: string
  /** When the snapshot was captured (ISO timestamp). */
  captured_at: string
}

export async function fetchBalanceSheet(): Promise<BalanceSheet> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('balance_sheet')
  if (error) throw new Error(error.message)
  return data as BalanceSheet
}

/** All saved months, newest first. */
export async function listBalanceSheetSnapshots(): Promise<BalanceSheetSnapshotMeta[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('list_balance_sheet_snapshots')
  if (error) throw new Error(error.message)
  return (data ?? []) as BalanceSheetSnapshotMeta[]
}

/** One saved month's sheet, or null if none exists for that month. */
export async function getBalanceSheetSnapshot(month: string): Promise<BalanceSheet | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_balance_sheet_snapshot', { p_month: month })
  if (error) throw new Error(error.message)
  return (data ?? null) as BalanceSheet | null
}

/** Capture/refresh the current month's snapshot; returns the sheet just stored. */
export async function saveBalanceSheetSnapshot(): Promise<BalanceSheet> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('save_balance_sheet_snapshot')
  if (error) throw new Error(error.message)
  return data as BalanceSheet
}
