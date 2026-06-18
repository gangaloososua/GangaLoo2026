// SERVER-ONLY data layer for the Accounting / Transactions module.
//
// All read-only. The ledger itself is written exclusively through the
// post_transaction / reverse_transaction RPCs (see actions.ts), never
// directly from here.
//
//   - fetchTransactions(filters): the ledger list, joined to account name
//     and category name+type, with account / category / type / date-range /
//     free-text filters. Newest first, capped at 500.
//   - listAccountCategories(): the income/expense/... categories for the
//     add/edit form dropdown, each carrying its parentId so the form can
//     group subcategories under their parent.
//   - listAccountsForFilter(): id+name+currency for the account dropdown.
import { createClient } from '@/lib/supabase/server'

export type AccountType = 'income' | 'expense' | 'asset' | 'liability' | 'equity'
export type AccountScope = 'business' | 'private' | 'mixed'

export type TransactionRow = {
  id: string
  occurredAt: string
  moneyAccountId: string
  accountName: string
  categoryId: string
  categoryName: string
  categoryType: AccountType
  amountCents: number
  scope: AccountScope
  description: string | null
  isManual: boolean
  currency: string
}

export type AccountCategoryOption = {
  id: string
  name: string
  type: AccountType
  scope: AccountScope
  parentId: string | null
}

export type AccountOption = {
  id: string
  name: string
  currency: string
}

export type TransactionFilters = {
  accountId?: string
  categoryId?: string
  type?: AccountType
  fromDate?: string
  toDate?: string
  search?: string
}

const TXN_CAP = 500

type TxnJoin = {
  id: string
  occurred_at: string
  money_account_id: string
  category_id: string
  amount_cents: number
  scope: AccountScope
  description: string | null
  is_manual: boolean
  money_accounts: { name: string; currency: string } | null
  account_categories: { name: string; type: AccountType } | null
}

// The ledger list. Filters are all optional and combine with AND. The
// type filter (income/expense/...) is applied after fetch because it lives
// on the joined category, not the transaction row.
export async function fetchTransactions(
  filters: TransactionFilters = {},
): Promise<TransactionRow[]> {
  const supabase = await createClient()
  let q = supabase
    .from('transactions')
    .select(
      'id, occurred_at, money_account_id, category_id, amount_cents, scope, ' +
      'description, is_manual, money_accounts(name, currency), account_categories(name, type)',
    )
    .order('occurred_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(TXN_CAP)

  if (filters.accountId) q = q.eq('money_account_id', filters.accountId)
  if (filters.categoryId) q = q.eq('category_id', filters.categoryId)
  if (filters.fromDate) q = q.gte('occurred_at', filters.fromDate)
  if (filters.toDate) {
    q = q.lte('occurred_at', filters.toDate + 'T23:59:59.999Z')
  }
  if (filters.search && filters.search.trim()) {
    q = q.ilike('description', '%' + filters.search.trim() + '%')
  }

  const { data, error } = await q
  if (error) throw error

  let rows = ((data ?? []) as unknown as TxnJoin[]).map((t): TransactionRow => ({
    id: t.id,
    occurredAt: t.occurred_at,
    moneyAccountId: t.money_account_id,
    accountName: t.money_accounts?.name ?? '(unknown account)',
    categoryId: t.category_id,
    categoryName: t.account_categories?.name ?? '(unknown category)',
    categoryType: t.account_categories?.type ?? 'expense',
    amountCents: Number(t.amount_cents) || 0,
    scope: t.scope,
    description: t.description,
    isManual: t.is_manual,
    currency: t.money_accounts?.currency ?? 'DOP',
  }))

  if (filters.type) {
    rows = rows.filter((r) => r.categoryType === filters.type)
  }

  return rows
}

// Categories for the add/edit form. Active only, ordered by type then
// display order then name. parentId lets the form build the parent->sub tree.
export async function listAccountCategories(): Promise<AccountCategoryOption[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('account_categories')
    .select('id, name, type, scope, parent_id, is_active, display_order')
    .eq('is_active', true)
    .order('type', { ascending: true })
    .order('display_order', { ascending: true })
    .order('name', { ascending: true })
  if (error) throw error
  return ((data ?? []) as Array<{
    id: string
    name: string
    type: AccountType
    scope: AccountScope
    parent_id: string | null
  }>).map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    scope: c.scope,
    parentId: c.parent_id,
  }))
}

// Accounts for the filter + form dropdowns. Active only.
export async function listAccountsForFilter(): Promise<AccountOption[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('money_accounts')
    .select('id, name, currency, is_active')
    .eq('is_active', true)
    .order('name', { ascending: true })
  if (error) throw error
  return ((data ?? []) as Array<{ id: string; name: string; currency: string }>).map(
    (a) => ({ id: a.id, name: a.name, currency: a.currency }),
  )
}
