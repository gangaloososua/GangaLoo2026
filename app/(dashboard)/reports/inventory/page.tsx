import { requireOwner } from '@/lib/auth/guard'
import { formatDate } from '@/lib/format'
import { fetchInventoryReport } from '@/lib/inventory-report'
import { InventoryView } from './inventory-view'
import Link from 'next/link'
import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'

export default async function InventoryReportPage() {
  await requireOwner()
  const data = await fetchInventoryReport()
  const today = formatDate(new Date().toISOString())

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inventory Valuation</h1>
          <p className="text-sm text-muted-foreground">
            Stock on hand as of <span className="font-medium text-foreground">{today}</span>
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/reports/inventory/print">
            <Printer className="mr-2 h-4 w-4" />
            Print by category
          </Link>
        </Button>
      </div>

      <InventoryView data={data} />
    </div>
  )
}
