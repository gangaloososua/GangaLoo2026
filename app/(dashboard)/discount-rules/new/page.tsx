// Round 16.3 — Discount rules > New (server)

import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { requireRole } from '@/lib/auth/guard'
import { listCustomersForPicker } from '@/lib/sales'
import { NewCustomerOverrideRuleForm } from './new-customer-override-form'

export const dynamic = 'force-dynamic'

export default async function NewDiscountRulePage() {
  await requireRole(['owner', 'admin'] as const)
  const customers = await listCustomersForPicker()

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/discount-rules"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to discount rules
        </Link>
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          New discount rule
        </h1>
        <p className="text-sm text-muted-foreground">
          v1 supports customer-specific overrides only. Other rule kinds
          (club tier, bulk, promotion, logistics surcharge) come in
          Rounds 17–20.
        </p>
      </div>
      <NewCustomerOverrideRuleForm customers={customers} />
    </div>
  )
}
