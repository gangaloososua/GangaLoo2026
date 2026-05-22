import { requireOwner } from '@/lib/auth/guard'
import {
  computeCommissionsPeriods,
  customCommissionsPeriods,
  fetchCommissionsReport,
  type CommissionsPeriods,
  type CommissionsPeriodMode,
} from '@/lib/commissions-report'
import { CommissionsPeriodSwitcher } from './commissions-period-switcher'
import { CommissionsView } from './commissions-view'

export const dynamic = 'force-dynamic'

type RawMode = CommissionsPeriodMode | 'custom'

function parseMode(raw: string | undefined): RawMode {
  if (raw === 'last-month' || raw === 'this-year' || raw === 'custom') return raw
  return 'this-month'
}

const YMD = /^\d{4}-\d{2}-\d{2}$/

export default async function CommissionsReportPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; start?: string; end?: string }>
}) {
  await requireOwner()
  const sp = await searchParams
  const mode = parseMode(sp.period)

  let periods: CommissionsPeriods
  if (mode === 'custom' && sp.start && sp.end && YMD.test(sp.start) && YMD.test(sp.end)) {
    periods = customCommissionsPeriods(sp.start, sp.end)
  } else {
    periods = computeCommissionsPeriods(mode === 'custom' ? 'this-month' : mode)
  }

  const report = await fetchCommissionsReport(periods)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Commission Statements</h1>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{periods.label}</span>
          </p>
        </div>
        <CommissionsPeriodSwitcher current={mode} start={sp.start ?? ''} end={sp.end ?? ''} />
      </div>

      <CommissionsView report={report} periodLabel={periods.label} />
    </div>
  )
}
