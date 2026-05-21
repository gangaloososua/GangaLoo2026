import { requireRole } from '@/lib/auth/guard'
import {
  fetchTransactions,
  listAccountCategories,
  listAccountsForFilter,
  type TransactionFilters,
  type AccountType,
} from '@/lib/transactions'
import { TransactionsTable } from './transactions-table'

export const dynamic = 'force-dynamic'

type SearchParams = {
  account?: string
  category?: string
  type?: string
  from?: string
  to?: string
  q?: string
}

export default async function AccountingPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  await requireRole(['owner', 'admin'] as const)
  const sp = await searchParams

  const filters: TransactionFilters = {
    accountId: sp.account || undefined,
    categoryId: sp.category || undefined,
    type: (sp.type as AccountType) || undefined,
    fromDate: sp.from || undefined,
    toDate: sp.to || undefined,
    search: sp.q || undefined,
  }

  const [transactions, accounts, categories] = await Promise.all([
    fetchTransactions(filters),
    listAccountsForFilter(),
    listAccountCategories(),
  ])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Accounting</h1>
        <p className="text-sm text-muted-foreground">
          Every money movement in one ledger. Adding, editing, or deleting an
          entry updates the account balance automatically.
        </p>
      </div>

      <TransactionsTable
        rows={transactions}
        accounts={accounts}
        categories={categories}
        current={{
          account: sp.account ?? '',
          category: sp.category ?? '',
          type: sp.type ?? '',
          from: sp.from ?? '',
          to: sp.to ?? '',
          search: sp.q ?? '',
        }}
      />
    </div>
  )
}
