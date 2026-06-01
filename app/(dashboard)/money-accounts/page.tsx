import { Suspense } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { requireOwner } from '@/lib/auth/guard'
import {
  listAccounts,
  currenciesFromAccounts,
  groupTagsFromAccounts,
} from '@/lib/money-accounts'
import { fetchEffectiveRatesForCurrencies } from '@/lib/exchange-rates'
import { listAccountTransfers, listAccountsForTransfer } from '@/lib/account-transfers'
import { MoneyAccountsListTable } from './list-table'
import { MoveMoneyDialog } from './move-money-dialog'
import { TransfersList } from './transfers-list'

export const dynamic = 'force-dynamic'

type SearchParams = {
  private?: string
  inactive?: string
  q?: string
  group?: string
}

export default async function MoneyAccountsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  await requireOwner()

  const sp = await searchParams
  // Private + mixed default to SHOWN. Only an explicit ?private=0 hides them,
  // so a fresh page load (no param) shows them; the toggle can still turn off.
  const includePrivateAndMixed = sp.private !== '0'
  const includeInactive = sp.inactive === '1'
  const search = sp.q?.trim() ?? ''
  const group = sp.group ?? ''

  const accounts = await listAccounts({
    includePrivateAndMixed,
    includeInactive,
  })

  const currencies = currenciesFromAccounts(accounts)
  const groupTags = groupTagsFromAccounts(accounts)

  const rates = await fetchEffectiveRatesForCurrencies(currencies)

  const [transfers, transferAccounts] = await Promise.all([
    listAccountTransfers(),
    listAccountsForTransfer(),
  ])

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Money Accounts
          </h1>
          <p className="text-sm text-muted-foreground">
            Where the money sits.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <MoveMoneyDialog accounts={transferAccounts} />
          <Button asChild size="sm">
            <Link href="/money-accounts/new">
              <Plus className="mr-1 size-4" />
              New account
            </Link>
          </Button>
        </div>
      </div>

      <Suspense>
        <MoneyAccountsListTable
          accounts={accounts}
          rates={rates}
          groupTags={groupTags}
          currentFilters={{
            includePrivateAndMixed,
            includeInactive,
            search,
            group,
          }}
        />
      </Suspense>

      <TransfersList transfers={transfers} />
    </div>
  )
}
