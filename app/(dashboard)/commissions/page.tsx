import { requireRole } from '@/lib/auth/guard'
import {
  fetchCommissionsOwed,
  fetchCommissionDetail,
  fetchPayoutHistory,
  type CommissionDetailRow,
} from '@/lib/commissions'
import { listAccounts } from '@/lib/money-accounts'
import { CommissionsOwedTable } from './commissions-owed-table'
import { PayoutHistoryTable } from './payout-history-table'

export const dynamic = 'force-dynamic'

export default async function CommissionsPage() {
  await requireRole(['owner', 'admin'] as const)

  const [owed, payouts, accounts] = await Promise.all([
    fetchCommissionsOwed(),
    fetchPayoutHistory(),
    listAccounts(),
  ])

  // Pre-load the detail lines for each earner so the expand + pay dialog
  // are instant (no per-row round trip). Built as a plain map keyed by
  // earner id.
  const detailEntries = await Promise.all(
    owed.map(async (o): Promise<[string, CommissionDetailRow[]]> => [
      o.earnerId,
      await fetchCommissionDetail(o.earnerId),
    ]),
  )
  const detailByEarner: Record<string, CommissionDetailRow[]> =
    Object.fromEntries(detailEntries)

  const accountOptions = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    currency: a.currency,
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Commissions</h1>
        <p className="text-sm text-muted-foreground">
          What each seller and distributor is owed, and a record of payments made.
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Owed</h2>
        <CommissionsOwedTable
          rows={owed}
          detailByEarner={detailByEarner}
          accounts={accountOptions}
        />
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Recent payouts</h2>
        <PayoutHistoryTable rows={payouts} />
      </section>
    </div>
  )
}
