'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireOwner } from '@/lib/auth/guard'
import {
  MONEY_ACCOUNT_KINDS,
  MONEY_ACCOUNT_SCOPES,
  type MoneyAccountKind,
  type MoneyAccountScope,
} from '@/lib/money-accounts'
import {
  SUPPORTED_CURRENCIES,
  type Currency,
} from '@/lib/exchange-rates-types'

// ---------------------------------------------------------------------------
// Form parsing helpers (mirroring the warehouses module)
// ---------------------------------------------------------------------------

function readForm(formData: FormData) {
  const get = (k: string) => {
    const v = formData.get(k)
    return typeof v === 'string' ? v.trim() : ''
  }
  const optional = (k: string) => {
    const v = get(k)
    return v.length === 0 ? null : v
  }
  const bool = (k: string) =>
    formData.get(k) === 'on' || formData.get(k) === 'true'

  // Major units (whatever the user typed) -> integer cents.
  // parseFloat-style handling so "100.5" works.
  const cents = (k: string): number => {
    const v = formData.get(k)
    const n = typeof v === 'string' && v.trim().length > 0 ? Number(v) : 0
    if (!Number.isFinite(n)) return 0
    return Math.round(n * 100)
  }

  const name = get('name')

  const kindRaw = get('kind')
  const kind = (MONEY_ACCOUNT_KINDS as readonly string[]).includes(kindRaw)
    ? (kindRaw as MoneyAccountKind)
    : null

  const currencyRaw = get('currency')
  const currency = (SUPPORTED_CURRENCIES as readonly string[]).includes(currencyRaw)
    ? (currencyRaw as Currency)
    : null

  const scopeRaw = get('scope')
  const scope = (MONEY_ACCOUNT_SCOPES as readonly string[]).includes(scopeRaw)
    ? (scopeRaw as MoneyAccountScope)
    : null

  return {
    name,
    kind,
    currency,
    scope,
    group_tag: optional('group_tag'),
    initial_balance_cents: cents('initial_balance'),
    allow_negative: bool('allow_negative'),
    is_active: bool('is_active'),
  }
}

// ---------------------------------------------------------------------------
// createAccount
// ---------------------------------------------------------------------------
// Owner-only. Inserts a new money_accounts row. The current balance is
// set equal to the initial balance — every later balance change goes
// through transactions, never this action.
// ---------------------------------------------------------------------------

export async function createAccount(formData: FormData) {
  await requireOwner()
  const v = readForm(formData)

  if (!v.name) return { error: 'Name is required.' }
  if (!v.kind) return { error: 'Pick a kind.' }
  if (!v.currency) return { error: 'Pick a currency.' }
  if (!v.scope) return { error: 'Pick a scope.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('money_accounts')
    .insert({
      name: v.name,
      kind: v.kind,
      currency: v.currency,
      scope: v.scope,
      group_tag: v.group_tag,
      initial_balance_cents: v.initial_balance_cents,
      balance_cents: v.initial_balance_cents,
      allow_negative: v.allow_negative,
      is_active: v.is_active,
    })

  if (error) return { error: error.message }

  revalidatePath('/money-accounts')
  redirect('/money-accounts')
}
