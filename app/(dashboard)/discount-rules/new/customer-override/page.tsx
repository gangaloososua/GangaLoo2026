// Round 17 — Discount rules > New > Customer override (server)
//
// Moved here from /discount-rules/new when that page became a kind
// picker. Fetches the customer list and renders the (unchanged)
// customer-override form, which lives one level up at
// /discount-rules/new/new-customer-override-form.tsx.
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { requireRole } from '@/lib/auth/guard'
import { listCustomersForPicker } from '@/lib/sales'
import { NewCustomerOverrideRuleForm } from '../new-customer-override-form'

export const dynamic = 'force-dynamic'

export default async function NewCustomerOverrideRulePage() {
  await requireRole(['owner', 'admin'] as const)
  const customers = await listCustomersForPicker()

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/discount-rules/new"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to rule kinds
        </Link>
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          New customer override
        </h1>
        <p className="text-sm text-muted-foreground">
          A discount tied to one named customer.
        </p>
      </div>
      <NewCustomerOverrideRuleForm customers={customers} />
    </div>
  )
}
