'use server'

// Round 26a — seller cash hand-in server action.
//
// Owner/admin only. Marks a held collection as handed in AND records the real
// cash payment on the order, in one call, via the hand_in_seller_cash RPC
// (which routes the payment through receive_payment). Smoke-tested reversibly
// in round-26a before this UI was built.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireOwner } from '@/lib/auth/guard'

export type HandInResult = { ok: true } | { ok: false; error: string }

export async function handInSellerCash(input: {
  collectionId: string
  moneyAccountId: string
  receivedAt: string // ISO date or datetime; Postgres coerces
  reference?: string | null
}): Promise<HandInResult> {
  await requireOwner()

  if (!input.collectionId) return { ok: false, error: 'Collection id is required.' }
  if (!input.moneyAccountId) return { ok: false, error: 'Pick a money account.' }
  if (!input.receivedAt) return { ok: false, error: 'A received date is required.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('hand_in_seller_cash', {
    p_collection_id: input.collectionId,
    p_money_account_id: input.moneyAccountId,
    p_received_at: input.receivedAt,
    p_reference: input.reference?.trim() || null,
  })
  if (error) return { ok: false, error: error.message }

  revalidatePath('/seller-cash')
  revalidatePath('/sales')
  revalidatePath('/money-accounts')
  return { ok: true }
}
