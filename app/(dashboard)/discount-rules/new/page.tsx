// Round 16.3 — Discount rules > New (server)
// Round 17    — converted to a rule-kind picker
// Round 20    — promotion entry added
import Link from 'next/link'
import { ChevronLeft, Receipt } from 'lucide-react'
import { requireRole } from '@/lib/auth/guard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
export const dynamic = 'force-dynamic'
// Rule kinds the builder UI supports. Round 21 adds the
// logistics_surcharge entry here.
const RULE_KINDS: Array<{
  href: string
  title: string
  blurb: string
}> = [
  {
    href: '/discount-rules/new/customer-override',
    title: 'Customer-specific override',
    blurb:
      'A discount tied to one named customer (e.g. a wholesale account).',
  },
  {
    href: '/discount-rules/new/club-tier',
    title: 'Club tier discount',
    blurb:
      'A discount that applies to every customer at a chosen loyalty tier.',
  },
  {
    href: '/discount-rules/new/bulk',
    title: 'Bulk / quantity discount',
    blurb:
      'A discount that kicks in when a customer buys at or above a set quantity of a product or category.',
  },
  {
    href: '/discount-rules/new/promotion',
    title: 'Promotion (daily / weekly deal)',
    blurb:
      'A limited-time % off a single product, for everyone including walk-ins, with no minimum quantity.',
  },
]
export default async function NewDiscountRulePage() {
  await requireRole(['owner', 'admin'] as const)
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
          Pick the kind of rule to create. The logistics surcharge kind
          arrives in a later round.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {RULE_KINDS.map((k) => (
          <Link key={k.href} href={k.href} className="block">
            <Card className="h-full transition hover:border-foreground hover:bg-muted/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Receipt className="h-4 w-4" />
                  {k.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{k.blurb}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
