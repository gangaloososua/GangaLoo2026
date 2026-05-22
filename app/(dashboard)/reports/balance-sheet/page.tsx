import { requireOwner } from '@/lib/auth/guard'
import { formatDate } from '@/lib/format'
import { fetchBalanceSheet } from '@/lib/balance-sheet'
import { BalanceSheetView } from './balance-sheet-view'

export const dynamic = 'force-dynamic'

export default async function BalanceSheetPage() {
  await requireOwner()
  const data = await fetchBalanceSheet()
  const today = formatDate(new Date().toISOString())

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Balance Sheet</h1>
          <p className="text-sm text-muted-foreground">
            Snapshot as of <span className="font-medium text-foreground">{today}</span>
          </p>
        </div>
      </div>

      <BalanceSheetView data={data} />
    </div>
  )
}
