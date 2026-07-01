import { requireOwner } from '@/lib/auth/guard'
import { formatDate } from '@/lib/format'
import {
  fetchInventoryReport,
  getInventoryReportSnapshot,
  listInventoryReportSnapshots,
} from '@/lib/inventory-report'
import { InventoryView } from './inventory-view'
import { SnapshotControls } from './snapshot-controls'
import Link from 'next/link'
import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'

// First day of the current month, in Dominican Republic local time, as
// 'YYYY-MM-DD' (matches how the DB keys snapshots).
function currentMonthIsoDR(): string {
  const ym = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santo_Domingo',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date()) // 'YYYY-MM'
  return `${ym}-01`
}

export default async function InventoryReportPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  await requireOwner()

  const { month } = await searchParams
  const selectedMonth =
    month && /^\d{4}-\d{2}-\d{2}$/.test(month) ? month : null

  const months = await listInventoryReportSnapshots()

  const data = selectedMonth
    ? await getInventoryReportSnapshot(selectedMonth)
    : await fetchInventoryReport()

  const currentMonthIso = currentMonthIsoDR()

  // Date shown under the title.
  let asOf: string
  if (selectedMonth) {
    const meta = months.find((m) => m.period_month === selectedMonth)
    asOf = meta ? formatDate(meta.captured_at) : formatDate(selectedMonth)
  } else {
    asOf = formatDate(new Date().toISOString())
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inventory Valuation</h1>
          <p className="text-sm text-muted-foreground">
            {selectedMonth ? 'Saved snapshot from ' : 'Stock on hand as of '}
            <span className="font-medium text-foreground">{asOf}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SnapshotControls
            months={months}
            selectedMonth={selectedMonth}
            currentMonthIso={currentMonthIso}
          />
          <Button asChild variant="outline" size="sm">
            <Link href="/reports/inventory/print">
              <Printer className="mr-2 h-4 w-4" />
              Print by category
            </Link>
          </Button>
        </div>
      </div>

      {data ? (
        <InventoryView data={data} />
      ) : (
        <div className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">
          No saved snapshot for that month yet.
        </div>
      )}
    </div>
  )
}
