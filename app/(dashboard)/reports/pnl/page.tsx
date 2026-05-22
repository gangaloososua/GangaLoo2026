import { requireOwner } from '@/lib/auth/guard'
import {
  computePnlPeriods,
  customPnlPeriods,
  fetchPnlReport,
  type PnlPeriods,
  type PnlPeriodMode,
} from '@/lib/pnl'
import { PnlPeriodSwitcher } from './pnl-period-switcher'
import { PnlView } from './pnl-view'

export const dynamic = 'force-dynamic'

type RawMode = PnlPeriodMode | 'custom'

function parseMode(raw: string | undefined): RawMode {
  if (raw === 'last-month' || raw === 'this-year' || raw === 'custom') return raw
  return 'this-month'
}

const YMD = /^\d{4}-\d{2}-\d{2}$/

export default async function PnlReportPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; start?: string; end?: string }>
}) {
  await requireOwner()
  const sp = await searchParams
  const mode = parseMode(sp.period)

  let periods: PnlPeriods
  if (mode === 'custom' && sp.start && sp.end && YMD.test(sp.start) && YMD.test(sp.end)) {
    periods = customPnlPeriods(sp.start, sp.end)
  } else {
    periods = computePnlPeriods(mode === 'custom' ? 'this-month' : mode)
  }

  const report = await fetchPnlReport(periods)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Profit &amp; Loss</h1>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{periods.label}</span>{' '}
            (vs {periods.prevLabel})
          </p>
        </div>
        <PnlPeriodSwitcher current={mode} start={sp.start ?? ''} end={sp.end ?? ''} />
      </div>

      <PnlView
        report={report}
        periodLabel={periods.label}
        prevLabel={periods.prevLabel}
      />
    </div>
  )
}
