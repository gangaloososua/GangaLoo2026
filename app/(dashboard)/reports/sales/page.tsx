import { requireOwner } from '@/lib/auth/guard'
import {
  computeSalesPeriods,
  customSalesPeriods,
  fetchSalesReport,
  type SalesPeriods,
  type SalesPeriodMode,
} from '@/lib/sales-report'
import { SalesPeriodSwitcher } from './sales-period-switcher'
import { SalesView } from './sales-view'

export const dynamic = 'force-dynamic'

type RawMode = SalesPeriodMode | 'custom'

function parseMode(raw: string | undefined): RawMode {
  if (raw === 'last-month' || raw === 'this-year' || raw === 'custom') return raw
  return 'this-month'
}

const YMD = /^\d{4}-\d{2}-\d{2}$/

export default async function SalesReportPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; start?: string; end?: string }>
}) {
  await requireOwner()
  const sp = await searchParams
  const mode = parseMode(sp.period)

  let periods: SalesPeriods
  if (mode === 'custom' && sp.start && sp.end && YMD.test(sp.start) && YMD.test(sp.end)) {
    periods = customSalesPeriods(sp.start, sp.end)
  } else {
    periods = computeSalesPeriods(mode === 'custom' ? 'this-month' : mode)
  }

  const report = await fetchSalesReport(periods)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sales Analysis</h1>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{periods.label}</span>
          </p>
        </div>
        <SalesPeriodSwitcher current={mode} start={sp.start ?? ''} end={sp.end ?? ''} />
      </div>

      <SalesView report={report} periodLabel={periods.label} />
    </div>
  )
}
