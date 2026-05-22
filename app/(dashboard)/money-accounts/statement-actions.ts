'use server'

// Server actions backing the account-statement modal.
//
// getAccountStatement: read-only fetch of one account's statement (stage 1).
//
// setAccountOpening: the stage-2 WRITE action ("Ajustar saldo / Recalcular").
// It sets the account's starting saldo (initial_balance_cents) and re-syncs
// the stored balance_cents to opening + sum(movements) via the owner-gated
// set_account_opening RPC. This is the one deliberate exception to the rule
// in actions.ts that nothing edits initial_balance_cents / balance_cents -
// it's the reconcile feature the owner explicitly asked for. Owner-gated both
// here and inside the RPC; revalidates the page so the account card and the
// DOP-equivalent total reflect the new (honest) balance.

import { revalidatePath } from 'next/cache'

import { requireOwner } from '@/lib/auth/guard'
import { createClient } from '@/lib/supabase/server'
import {
  fetchAccountStatement,
  type AccountStatement,
} from '@/lib/account-statement'

export async function getAccountStatement(
  accountId: string,
): Promise<AccountStatement> {
  await requireOwner()
  return fetchAccountStatement(accountId)
}

export type SetOpeningResult =
  | {
      success: true
      opening_cents: number
      movements_sum_cents: number
      balance_cents: number
    }
  | { error: string }

export async function setAccountOpening(
  accountId: string,
  openingCents: number,
): Promise<SetOpeningResult> {
  await requireOwner()

  // Guard against a non-integer slipping through to a bigint column.
  const opening = Math.round(openingCents)
  if (!Number.isFinite(opening)) return { error: 'Importe inválido.' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('set_account_opening', {
    p_account_id: accountId,
    p_opening_cents: opening,
  })
  if (error) return { error: error.message }

  revalidatePath('/money-accounts')

  const d = data as {
    opening_cents: number
    movements_sum_cents: number
    balance_cents: number
  }
  return {
    success: true,
    opening_cents: d.opening_cents,
    movements_sum_cents: d.movements_sum_cents,
    balance_cents: d.balance_cents,
  }
}
