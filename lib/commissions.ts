// SERVER-ONLY data layer for the Commissions module.
//
// All read-only. Three concerns, deliberately separated:
//   - fetchCommissionsOwed(): per-earner summary of PENDING commissions,
//     split into "ready to pay" (the customer has fully paid the sale)
//     and "awaiting collection" (sale confirmed or only partly paid, so
//     the money is not all in yet). Owner/admin "who do I owe" view.
//   - fetchCommissionDetail(earnerId): the individual pending commission
//     lines behind one earner's total (drill-down + payout preview).
//   - fetchPayoutHistory(): past commission_payouts rows, with the
//     earner name and money-account name resolved.
//
// "Owed" deliberately EXCLUDES refunded sales and any sale whose status
// is not one of the live states below, so a later refund can never count
// as money owed.
import { createClient } from '@/lib/supabase/server'

// Sale statuses that represent a real, owable sale. Anything else
// (cancelled, refunded, draft, ...) is dropped from "owed".
const READY_STATUSES = ['paid'] as const
const AWAITING_STATUSES = ['confirmed', 'partially_paid'] as const
const OWABLE_STATUSES = [...READY_STATUSES, ...AWAITING_STATUSES] as const

export type EarnerRole = 'seller' | 'distributor'
export type PaidState = 'ready' | 'awaiting'

export type CommissionOwedRow = {
  earnerId: string
  earnerName: string
  earnerRole: EarnerRole
  readyToPayCents: number
  readyCount: number
  awaitingCents: number
  awaitingCount: number
  totalPendingCents: number
}

export type CommissionDetailRow = {
  commissionId: string
  saleId: string
  invoiceNumber: string | null
  soldAt: string
  productName: string
  qty: number
  amountCents: number
  saleStatus: string
  paidState: PaidState
}

export type PayoutHistoryRow = {
  payoutId: string
  earnerId: string
  earnerName: string
  totalCents: number
  moneyAccountName: string
  paidAt: string
  periodStart: string | null
  periodEnd: string | null
  notes: string | null
}

// Shape of a pending sale_commissions row joined down to its sale.
// product_id lives on sale_items; products(name) embedded for the label.
type PendingJoin = {
  id: string
  earner_id: string
  earner_role: EarnerRole
  amount_cents: number
  sale_items: {
    qty: number
    products: { name: string } | null
    sales: {
      id: string
      status: string
      refunded_at: string | null
      invoice_number: string | null
      sold_at: string
    } | null
  } | null
}

// Pull every PENDING commission joined down to its sale, then drop any
// whose sale is refunded or not in an owable status. Shared by the
// summary and the (single-earner) detail fetch.
async function fetchPendingJoined(): Promise<PendingJoin[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sale_commissions')
    .select(
      'id, earner_id, earner_role, amount_cents, ' +
      'sale_items(qty, products(name), ' +
      'sales(id, status, refunded_at, invoice_number, sold_at))',
    )
    .eq('status', 'pending')
  if (error) throw error
  const rows = (data ?? []) as unknown as PendingJoin[]
  return rows.filter((r) => {
    const s = r.sale_items?.sales
    if (!s) return false
    if (s.refunded_at) return false
    return (OWABLE_STATUSES as readonly string[]).includes(s.status)
  })
}

function paidStateForStatus(status: string): PaidState {
  return (READY_STATUSES as readonly string[]).includes(status)
    ? 'ready'
    : 'awaiting'
}

// Resolve a set of profile ids to their full_name in one round trip.
async function fetchEarnerNames(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const unique = Array.from(new Set(ids))
  if (unique.length === 0) return out
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', unique)
  if (error) throw error
  for (const p of (data ?? []) as Array<{ id: string; full_name: string | null }>) {
    out.set(p.id, p.full_name ?? '(unnamed)')
  }
  return out
}

// Per-earner pending totals, split ready vs awaiting. Earners with no
// pending owable commission do not appear. Sorted by total owed desc.
export async function fetchCommissionsOwed(): Promise<CommissionOwedRow[]> {
  const pending = await fetchPendingJoined()
  const names = await fetchEarnerNames(pending.map((r) => r.earner_id))

  const byEarner = new Map<string, CommissionOwedRow>()
  for (const r of pending) {
    const status = r.sale_items?.sales?.status ?? ''
    const amount = Number(r.amount_cents) || 0
    const ready = paidStateForStatus(status) === 'ready'
    let row = byEarner.get(r.earner_id)
    if (!row) {
      row = {
        earnerId: r.earner_id,
        earnerName: names.get(r.earner_id) ?? '(unnamed)',
        earnerRole: r.earner_role,
        readyToPayCents: 0,
        readyCount: 0,
        awaitingCents: 0,
        awaitingCount: 0,
        totalPendingCents: 0,
      }
      byEarner.set(r.earner_id, row)
    }
    if (ready) {
      row.readyToPayCents += amount
      row.readyCount += 1
    } else {
      row.awaitingCents += amount
      row.awaitingCount += 1
    }
    row.totalPendingCents += amount
  }

  return Array.from(byEarner.values()).sort(
    (a, b) => b.totalPendingCents - a.totalPendingCents || a.earnerName.localeCompare(b.earnerName),
  )
}

// The individual pending commission lines behind one earner's total.
// Used for the drill-down AND as the preview of what a payout will pay.
// Sorted newest sale first.
export async function fetchCommissionDetail(
  earnerId: string,
): Promise<CommissionDetailRow[]> {
  const pending = await fetchPendingJoined()
  const mine = pending.filter((r) => r.earner_id === earnerId)

  const rows: CommissionDetailRow[] = mine.map((r) => {
    const sale = r.sale_items?.sales
    const status = sale?.status ?? ''
    return {
      commissionId: r.id,
      saleId: sale?.id ?? '',
      invoiceNumber: sale?.invoice_number ?? null,
      soldAt: sale?.sold_at ?? '',
      productName: r.sale_items?.products?.name ?? '(unknown product)',
      qty: Number(r.sale_items?.qty) || 0,
      amountCents: Number(r.amount_cents) || 0,
      saleStatus: status,
      paidState: paidStateForStatus(status),
    }
  })

  return rows.sort((a, b) => (a.soldAt < b.soldAt ? 1 : a.soldAt > b.soldAt ? -1 : 0))
}

type PayoutJoin = {
  id: string
  earner_id: string
  total_cents: number
  money_account_id: string
  paid_at: string
  period_start: string | null
  period_end: string | null
  notes: string | null
}

// Past payouts, newest first, with earner name and account name resolved.
export async function fetchPayoutHistory(): Promise<PayoutHistoryRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('commission_payouts')
    .select('id, earner_id, total_cents, money_account_id, paid_at, period_start, period_end, notes')
    .order('paid_at', { ascending: false })
  if (error) throw error
  const payouts = (data ?? []) as unknown as PayoutJoin[]

  const names = await fetchEarnerNames(payouts.map((p) => p.earner_id))

  // Resolve account names in one round trip.
  const acctNames = new Map<string, string>()
  const acctIds = Array.from(new Set(payouts.map((p) => p.money_account_id)))
  if (acctIds.length > 0) {
    const { data: accts, error: aErr } = await supabase
      .from('money_accounts')
      .select('id, name')
      .in('id', acctIds)
    if (aErr) throw aErr
    for (const a of (accts ?? []) as Array<{ id: string; name: string }>) {
      acctNames.set(a.id, a.name)
    }
  }

  return payouts.map((p) => ({
    payoutId: p.id,
    earnerId: p.earner_id,
    earnerName: names.get(p.earner_id) ?? '(unnamed)',
    totalCents: Number(p.total_cents) || 0,
    moneyAccountName: acctNames.get(p.money_account_id) ?? '(unknown account)',
    paidAt: p.paid_at,
    periodStart: p.period_start,
    periodEnd: p.period_end,
    notes: p.notes,
  }))
}
