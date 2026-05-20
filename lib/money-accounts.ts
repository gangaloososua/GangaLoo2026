import { createClient } from '@/lib/supabase/server'
import type { Currency } from './exchange-rates-types'

export type MoneyAccountKind = 'bank' | 'card' | 'cash' | 'credit_line' | 'digital'
export type MoneyAccountScope = 'business' | 'mixed' | 'private'

export const MONEY_ACCOUNT_KINDS: readonly MoneyAccountKind[] = [
  'bank', 'card', 'cash', 'credit_line', 'digital',
] as const

export const MONEY_ACCOUNT_SCOPES: readonly MoneyAccountScope[] = [
  'business', 'mixed', 'private',
] as const

/**
 * Scopes visible by default on the list page.
 * 'private' and 'mixed' are hidden behind the "Show private + mixed"
 * toggle — pure business is the default view.
 */
export const DEFAULT_VISIBLE_SCOPES: readonly MoneyAccountScope[] = ['business'] as const

export type MoneyAccount = {
  id: string
  name: string
  kind: MoneyAccountKind
  scope: MoneyAccountScope
  currency: Currency
  warehouse_id: string | null
  balance_cents: number
  initial_balance_cents: number
  is_active: boolean
  allow_negative: boolean
  group_tag: string | null
  legacy_id: string | null
  created_at: string
}

type ListOptions = {
  includePrivateAndMixed?: boolean
  includeInactive?: boolean
}

/**
 * List money accounts.
 *
 * Default behaviour matches the Round 12 spec: business-scope only,
 * active-only. Callers can opt into private/mixed and inactive rows.
 *
 * Rows come back sorted by (currency, kind, name) so the list page
 * can group by currency without sorting on its own.
 */
export async function listAccounts(
  opts: ListOptions = {},
): Promise<MoneyAccount[]> {
  const supabase = await createClient()

  let q = supabase
    .from('money_accounts')
    .select(
      'id, name, kind, scope, currency, warehouse_id, balance_cents, ' +
      'initial_balance_cents, is_active, allow_negative, group_tag, ' +
      'legacy_id, created_at',
    )
    .order('currency', { ascending: true })
    .order('kind', { ascending: true })
    .order('name', { ascending: true })

  if (!opts.includePrivateAndMixed) {
    q = q.in('scope', DEFAULT_VISIBLE_SCOPES as readonly MoneyAccountScope[])
  }
  if (!opts.includeInactive) {
    q = q.eq('is_active', true)
  }

  const { data, error } = await q
  if (error) throw error

  return ((data ?? []) as unknown as MoneyAccount[]).map((r) => ({
    ...r,
    balance_cents: Number(r.balance_cents),
    initial_balance_cents: Number(r.initial_balance_cents),
  })) as MoneyAccount[]
}

/**
 * Fetch one money account by id. Returns null if not found.
 * RLS handles authorisation; the route guard handles whether the
 * caller has any business calling this in the first place.
 */
export async function getAccount(id: string): Promise<MoneyAccount | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('money_accounts')
    .select(
      'id, name, kind, scope, currency, warehouse_id, balance_cents, ' +
      'initial_balance_cents, is_active, allow_negative, group_tag, ' +
      'legacy_id, created_at',
    )
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const row = data as unknown as MoneyAccount
  return {
    ...row,
    balance_cents: Number(row.balance_cents),
    initial_balance_cents: Number(row.initial_balance_cents),
  } as MoneyAccount
}

/**
 * Convenience: return the set of distinct currencies present across
 * accounts visible under the current filters. The list page uses
 * this to know which exchange rates to fetch for the DOP-equivalent
 * total.
 */
export function currenciesFromAccounts(
  accounts: readonly MoneyAccount[],
): Currency[] {
  const seen = new Set<Currency>()
  for (const a of accounts) seen.add(a.currency)
  return Array.from(seen)
}

/**
 * Convenience: return the set of distinct group_tag values present
 * (non-null). The list page uses this to populate the Group filter
 * dropdown.
 */
export function groupTagsFromAccounts(
  accounts: readonly MoneyAccount[],
): string[] {
  const seen = new Set<string>()
  for (const a of accounts) {
    if (a.group_tag) seen.add(a.group_tag)
  }
  return Array.from(seen).sort()
}
