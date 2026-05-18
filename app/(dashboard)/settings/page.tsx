import Link from 'next/link'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowRight, Calendar, Receipt, SlidersHorizontal } from 'lucide-react'
import { requireOwner } from '@/lib/auth/guard'
export default async function SettingsHubPage() {
  await requireOwner()
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Configure store-wide values and reference data.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/settings/exchange-rates" className="block">
          <Card className="transition-colors hover:bg-accent/50">
            <CardHeader>
              <div className="flex items-start justify-between">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
              <CardTitle className="mt-2">Exchange Rates</CardTitle>
              <CardDescription>
                Monthly USD→DOP rates used by the Calculator and reports.
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/settings/receipt" className="block">
          <Card className="transition-colors hover:bg-accent/50">
            <CardHeader>
              <div className="flex items-start justify-between">
                <Receipt className="h-5 w-5 text-muted-foreground" />
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
              <CardTitle className="mt-2">Receipt</CardTitle>
              <CardDescription>
                Store name, address, phone, and RNC printed on every POS receipt.
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/settings/store-config" className="block">
          <Card className="transition-colors hover:bg-accent/50">
            <CardHeader>
              <div className="flex items-start justify-between">
                <SlidersHorizontal className="h-5 w-5 text-muted-foreground" />
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
              <CardTitle className="mt-2">Store Config</CardTitle>
              <CardDescription>
                Discounts, fees, shipping, loyalty tiers, and other tunables.
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </div>
    </div>
  )
}
