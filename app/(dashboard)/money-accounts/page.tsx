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
import { MoneyAccountsListTable } from './list-table'

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
  const includePrivateAndMixed = sp.private === '1'
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
        <Button asChild size="sm">
          <Link href="/money-accounts/new">
            <Plus className="mr-1 size-4" />
            New account
          </Link>
        </Button>
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
    </div>
  )
}
