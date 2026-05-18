import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { fetchAllExchangeRates } from '@/lib/exchange-rates'
import { RatesTable } from './rates-table'
import { requireOwner } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'

export default async function ExchangeRatesPage() {
  await requireOwner()
  const rows = await fetchAllExchangeRates()
  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/settings"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          Settings
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Exchange Rates</h1>
        <p className="text-sm text-muted-foreground">
          Monthly rates to DOP, one per currency per month. Used by the Calculator,
          the Money Accounts grand total, and any report that converts costs.
        </p>
      </div>
      <RatesTable rows={rows} />
    </div>
  )
}
