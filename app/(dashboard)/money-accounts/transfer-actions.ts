'use server'

// Round 26e — move money between accounts.
//
// Owner/admin only (RPC re-checks). Posts both legs atomically via
// transfer_between_accounts: -amount_out on the source, +amount_in on the
// destination. For same-currency transfers amount_out === amount_in; for
// cross-currency they differ (the user types the real amounts).

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireOwner } from '@/lib/auth/guard'

export type TransferMoneyResult = { ok: true } | { ok: false; error: string }

export type TransferMoneyInput = {
  fromAccountId: string
  toAccountId: string
  amountOutCents: number
  amountInCents: number
  scope: 'business' | 'private' | 'mixed'
  occurredAt: string // ISO date or datetime
  description?: string | null
}

export async function transferMoney(
  input: TransferMoneyInput,
): Promise<TransferMoneyResult> {
  await requireOwner()

  if (!input.fromAccountId || !input.toAccountId) {
    return { ok: false, error: 'Both accounts are required.' }
  }
  if (input.fromAccountId === input.toAccountId) {
    return { ok: false, error: 'Source and destination must be different.' }
  }
  if (!Number.isFinite(input.amountOutCents) || input.amountOutCents <= 0) {
    return { ok: false, error: 'Amount out must be greater than zero.' }
  }
  if (!Number.isFinite(input.amountInCents) || input.amountInCents <= 0) {
    return { ok: false, error: 'Amount in must be greater than zero.' }
  }
  if (!input.occurredAt) {
    return { ok: false, error: 'A date is required.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('transfer_between_accounts', {
    p_from_account_id: input.fromAccountId,
    p_to_account_id: input.toAccountId,
    p_amount_out_cents: Math.round(input.amountOutCents),
    p_amount_in_cents: Math.round(input.amountInCents),
    p_scope: input.scope,
    p_occurred_at: input.occurredAt,
    p_description: input.description?.trim() || null,
  })
  if (error) return { ok: false, error: error.message }

  revalidatePath('/money-accounts')
  return { ok: true }
}
