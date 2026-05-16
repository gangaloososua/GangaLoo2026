import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { fetchAllExchangeRates } from '@/lib/exchange-rates'
import { RatesTable } from './rates-table'

export const dynamic = 'force-dynamic'

export default async function ExchangeRatesPage() {
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
          Monthly USD → DOP rates. Used by the Calculator and any reports that convert costs.
        </p>
      </div>

      <RatesTable rows={rows} />
    </div>
  )
}
