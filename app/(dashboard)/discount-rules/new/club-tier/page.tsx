// Round 17 — Discount rules > New > Club tier (server)
//
// Renders the club-tier rule form (one level up at
// /discount-rules/new/new-club-tier-form.tsx). No data fetch needed —
// the tier list is a static enum baked into the form.
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { requireRole } from '@/lib/auth/guard'
import { NewClubTierRuleForm } from '../new-club-tier-form'

export const dynamic = 'force-dynamic'

export default async function NewClubTierRulePage() {
  await requireRole(['owner', 'admin'] as const)

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
          New club tier discount
        </h1>
        <p className="text-sm text-muted-foreground">
          A discount that applies to every customer at a chosen loyalty tier.
        </p>
      </div>
      <NewClubTierRuleForm />
    </div>
  )
}
