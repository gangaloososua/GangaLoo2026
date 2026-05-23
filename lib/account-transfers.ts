// Round 26e — money account transfers data layer (UI side).
//
// Read-only. listAccountTransfers powers the "find past transfers" list;
// listAccountsForTransfer feeds the Move-money picker (the RPC does the work).
// Amounts are in CENTS, each in its own account's currency.

import { createClient } from '@/lib/supabase/server'

export type AccountTransferRow = {
  id: string
  from_account_id: string
  from_account_name: string
  from_currency: string
  to_account_id: string
  to_account_name: string
  to_currency: string
  amount_out_cents: number
  amount_in_cents: number
  is_cross_currency: boolean
  scope: string
  occurred_at: string
  description: string | null
}

export type TransferAccountOption = {
  id: string
  name: string
  currency: string
  scope: string
}

export async function listAccountTransfers(limit = 100): Promise<AccountTransferRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('account_transfers')
    .select(
      `
      id, amount_out_cents, amount_in_cents, scope, occurred_at, description,
      from_account_id, to_account_id,
      from_acct:from_account_id ( id, name, currency ),
      to_acct:to_account_id ( id, name, currency )
    `,
    )
    .order('occurred_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`listAccountTransfers: ${error.message}`)

  return ((data ?? []) as any[]).map((r) => {
    const fromCur = r.from_acct?.currency ?? '—'
    const toCur = r.to_acct?.currency ?? '—'
    return {
      id: r.id,
      from_account_id: r.from_account_id,
      from_account_name: r.from_acct?.name ?? '—',
      from_currency: fromCur,
      to_account_id: r.to_account_id,
      to_account_name: r.to_acct?.name ?? '—',
      to_currency: toCur,
      amount_out_cents: Number(r.amount_out_cents) || 0,
      amount_in_cents: Number(r.amount_in_cents) || 0,
      is_cross_currency: fromCur !== toCur,
      scope: r.scope,
      occurred_at: r.occurred_at,
      description: r.description ?? null,
    }
  })
}

export async function listAccountsForTransfer(): Promise<TransferAccountOption[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('money_accounts')
    .select('id, name, currency, scope')
    .eq('is_active', true)
    .order('currency')
    .order('name')
  if (error) throw new Error(`listAccountsForTransfer: ${error.message}`)
  return ((data ?? []) as any[]).map((a) => ({
    id: a.id,
    name: a.name,
    currency: a.currency,
    scope: a.scope,
  }))
}
