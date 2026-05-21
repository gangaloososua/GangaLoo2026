'use server'
import { requireRole } from '@/lib/auth/guard'
import { createClient } from '@/lib/supabase/server'
import type { AccountType, AccountScope } from '@/lib/transactions'

// The user always types a POSITIVE amount; the category's type decides the
// sign stored in the ledger (and therefore which way the balance moves):
//   income / asset      -> inflow  -> positive
//   expense / liability -> outflow -> negative
//   equity              -> treated as inflow (positive) by default
// This keeps minus signs out of the user's hands entirely.
function signedAmount(absCents: number, type: AccountType): number {
  const outflow = type === 'expense' || type === 'liability'
  return outflow ? -Math.abs(absCents) : Math.abs(absCents)
}

export type ManualTxnInput = {
  moneyAccountId: string
  categoryId: string
  categoryType: AccountType
  amountCents: number // positive; sign derived from categoryType
  scope: AccountScope
  occurredAt: string | null // ISO date (yyyy-mm-dd) or null = now
  description: string | null
}

function validate(input: ManualTxnInput): string | null {
  if (!input.moneyAccountId) return 'Pick an account.'
  if (!input.categoryId) return 'Pick a category.'
  if (!Number.isFinite(input.amountCents) || input.amountCents <= 0)
    return 'Enter an amount greater than zero.'
  if (!input.scope) return 'Pick a scope.'
  return null
}

export async function addTransaction(
  input: ManualTxnInput,
): Promise<{ success: true } | { error: string }> {
  await requireRole(['owner', 'admin'] as const)
  const bad = validate(input)
  if (bad) return { error: bad }

  const supabase = await createClient()
  const { error } = await supabase.rpc('post_transaction', {
    p_payload: {
      money_account_id: input.moneyAccountId,
      category_id: input.categoryId,
      amount_cents: signedAmount(input.amountCents, input.categoryType),
      scope: input.scope,
      occurred_at: input.occurredAt && input.occurredAt.trim() ? input.occurredAt.trim() : null,
      description: input.description && input.description.trim() ? input.description.trim() : null,
    },
  })
  if (error) return { error: error.message }
  return { success: true }
}

export async function deleteTransaction(
  transactionId: string,
): Promise<{ success: true } | { error: string }> {
  await requireRole(['owner', 'admin'] as const)
  if (!transactionId) return { error: 'Missing transaction.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('reverse_transaction', {
    p_transaction_id: transactionId,
  })
  if (error) return { error: error.message }
  return { success: true }
}

// Edit = reverse the old row (restores the balance), then post the new one.
// Done as two RPC calls; if the second fails we surface the error. The
// reverse having already run means a failed re-post leaves the balance
// correctly reduced and the old row gone - the user simply re-adds. We
// guard the common failure (validation) BEFORE reversing to avoid that.
export async function editTransaction(
  transactionId: string,
  input: ManualTxnInput,
): Promise<{ success: true } | { error: string }> {
  await requireRole(['owner', 'admin'] as const)
  if (!transactionId) return { error: 'Missing transaction.' }
  const bad = validate(input)
  if (bad) return { error: bad }

  const supabase = await createClient()

  const { error: revErr } = await supabase.rpc('reverse_transaction', {
    p_transaction_id: transactionId,
  })
  if (revErr) return { error: revErr.message }

  const { error: postErr } = await supabase.rpc('post_transaction', {
    p_payload: {
      money_account_id: input.moneyAccountId,
      category_id: input.categoryId,
      amount_cents: signedAmount(input.amountCents, input.categoryType),
      scope: input.scope,
      occurred_at: input.occurredAt && input.occurredAt.trim() ? input.occurredAt.trim() : null,
      description: input.description && input.description.trim() ? input.description.trim() : null,
    },
  })
  if (postErr) {
    return { error: 'The old entry was removed but the update failed: ' + postErr.message + ' Please re-add it.' }
  }
  return { success: true }
}
