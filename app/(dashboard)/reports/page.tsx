import Link from 'next/link'
import { LineChart, Scale, Boxes, Receipt, Users, HandCoins } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { requireOwner } from '@/lib/auth/guard'
import { Card, CardContent } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

type ReportCard = {
  label: string
  description: string
  href: string
  icon: LucideIcon
  ready: boolean
}

const REPORTS: ReportCard[] = [
  {
    label: 'Profit & Loss',
    description: 'Income vs expenses for any period, with charts and prior-period comparison.',
    href: '/reports/pnl',
    icon: LineChart,
    ready: true,
  },
  {
    label: 'Balance Sheet',
    description: 'What you own vs what you owe right now — assets, liabilities and net worth.',
    href: '/reports/balance-sheet',
    icon: Scale,
    ready: true,
  },
  {
    label: 'Inventory valuation',
    description: 'Stock value by warehouse, product and category, with low- and dead-stock flags.',
    href: '/reports/inventory',
    icon: Boxes,
    ready: true,
  },
  {
    label: 'Sales analysis',
    description: 'Sales by seller, product, category and customer.',
    href: '/reports/sales',
    icon: Users,
    ready: true,
  },
  {
    label: 'Receivables aging',
    description: 'Who owes you and how overdue each balance is.',
    href: '/reports/receivables',
    icon: Receipt,
    ready: true,
  },
  {
    label: 'Commission statements',
    description: 'Per-seller commissions earned vs paid.',
    href: '/reports/commissions',
    icon: HandCoins,
    ready: true,
  },
]

export default async function ReportsHubPage() {
  await requireOwner()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">
          Financial statements and operational reports.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map((r) => {
          const Icon = r.icon
          const inner = (
            <Card
              className={
                'h-full transition-colors ' +
                (r.ready ? 'hover:border-foreground/30 hover:bg-accent/40' : 'opacity-60')
              }
            >
              <CardContent className="flex h-full flex-col gap-2 pt-5">
                <div className="flex items-center gap-2">
                  <Icon className="h-5 w-5 text-muted-foreground" />
                  <span className="font-medium">{r.label}</span>
                  {!r.ready ? (
                    <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Soon
                    </span>
                  ) : null}
                </div>
                <p className="text-sm text-muted-foreground">{r.description}</p>
              </CardContent>
            </Card>
          )

          return r.ready ? (
            <Link key={r.label} href={r.href} className="block">
              {inner}
            </Link>
          ) : (
            <div key={r.label}>{inner}</div>
          )
        })}
      </div>
    </div>
  )
}
