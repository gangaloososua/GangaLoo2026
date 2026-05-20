// Round 16.3 — Discount rules list page (server)

import { requireRole } from '@/lib/auth/guard'
import { listDiscountRules } from '@/lib/discount-rules'
import { DiscountRulesListTable } from './list-table'

export const dynamic = 'force-dynamic'

export default async function DiscountRulesPage() {
  await requireRole(['owner', 'admin'] as const)
  const rules = await listDiscountRules({})

  const activeCount = rules.filter((r) => r.isActive).length

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Discount rules
        </h1>
        <p className="text-sm text-muted-foreground">
          Auto-applied discounts and surcharges.{' '}
          <span className="tabular-nums">
            {activeCount} active / {rules.length} total
          </span>
          . v1 supports customer-specific overrides; other rule kinds
          come in Rounds 17–20.
        </p>
      </div>
      <DiscountRulesListTable rules={rules} />
    </div>
  )
}
