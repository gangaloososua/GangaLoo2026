import { requireOwner } from '@/lib/auth/guard'
import { formatDate } from '@/lib/format'
import { fetchReceivablesAging } from '@/lib/receivables-aging'
import { ReceivablesView } from './receivables-view'

export const dynamic = 'force-dynamic'

export default async function ReceivablesAgingPage() {
  await requireOwner()
  const data = await fetchReceivablesAging()
  const today = formatDate(new Date().toISOString())

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Receivables Aging</h1>
          <p className="text-sm text-muted-foreground">
            Open invoices as of <span className="font-medium text-foreground">{today}</span>
            {' '}· aged from confirmed date
          </p>
        </div>
      </div>

      <ReceivablesView data={data} />
    </div>
  )
}
