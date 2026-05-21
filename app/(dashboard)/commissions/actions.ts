'use server'
import { requireRole } from '@/lib/auth/guard'
import { createClient } from '@/lib/supabase/server'

export type PayoutInput = {
  earnerId: string
  moneyAccountId: string
  commissionIds: string[]
  periodStart: string | null
  periodEnd: string | null
  notes: string | null
}

// Owner/admin only. Calls the record_commission_payout RPC, which
// atomically creates the commission_payouts row and flips the named
// commissions to paid (linking them to the payout). Account balances
// are intentionally NOT touched - see the migration's design note
// (Path A: balances move via the future accounting ledger, #24).
// Returns success or a friendly error.
export async function recordCommissionPayout(
  input: PayoutInput,
): Promise<{ success: true } | { error: string }> {
  await requireRole(['owner', 'admin'] as const)
  if (!input.earnerId) return { error: 'Missing the person being paid.' }
  if (!input.moneyAccountId) return { error: 'Pick the account the money came from.' }
  if (!Array.isArray(input.commissionIds) || input.commissionIds.length === 0)
    return { error: 'Tick at least one commission to pay.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('record_commission_payout', {
    p_payload: {
      earner_id: input.earnerId,
      money_account_id: input.moneyAccountId,
      commission_ids: input.commissionIds,
      period_start: input.periodStart && input.periodStart.trim() ? input.periodStart.trim() : null,
      period_end: input.periodEnd && input.periodEnd.trim() ? input.periodEnd.trim() : null,
      notes: input.notes && input.notes.trim() ? input.notes.trim() : null,
    },
  })
  if (error) {
    // Surface the RPC's own message (e.g. "commission set invalid") cleanly.
    return { error: error.message }
  }
  return { success: true }
}
