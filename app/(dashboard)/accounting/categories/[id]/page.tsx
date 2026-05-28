import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Pencil } from 'lucide-react'
import { requireRole } from '@/lib/auth/guard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatDOP, formatDateTime } from '@/lib/format'
import { getAccountCategory, type AccountScope } from '@/lib/account-categories'
import { fetchTransactions } from '@/lib/transactions'

export const dynamic = 'force-dynamic'

type Range = 'month' | '90d' | 'year' | 'all'
const ALL_RANGES: Range[] = ['month', '90d', 'year', 'all']
const RANGE_LABELS: Record<Range, string> = {
  month: 'This month',
  '90d': 'Last 90 days',
  year: 'This year',
  all: 'All time',
}

function parseRange(v: string | undefined): Range {
  if (v === 'month' || v === '90d' || v === 'year' || v === 'all') return v
  return 'month'
}

function rangeStart(range: Range): string | undefined {
  if (range === 'all') return undefined
  const now = new Date()
  if (range === 'month') {
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  }
  if (range === 'year') {
    return new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10)
  }
  const d = new Date(now)
  d.setDate(d.getDate() - 90)
  return d.toISOString().slice(0, 10)
}

function scopeBadge(scope: AccountScope) {
  switch (scope) {
    case 'business':
      return <Badge className="bg-blue-100 text-blue-900 hover:bg-blue-100">Business</Badge>
    case 'private':
      return (
        <Badge className="bg-purple-100 text-purple-900 hover:bg-purple-100">Private</Badge>
      )
    case 'mixed':
      return (
        <Badge variant="outline" className="text-muted-foreground">
          Mixed
        </Badge>
      )
  }
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  )
}

export default async function CategoryStatementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ range?: string }>
}) {
  await requireRole(['owner', 'admin'] as const)
  const { id } = await params
  const sp = await searchParams
  const range = parseRange(sp.range)

  const category = await getAccountCategory(id)
  if (!category) notFound()

  const fromDate = rangeStart(range)
  const txns = await fetchTransactions({ categoryId: id, fromDate })

  const totalCents = txns.reduce((s, t) => s + t.amountCents, 0)
  const isCapped = txns.length === 500

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/accounting/categories">
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to categories
        </Link>
      </Button>

      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{category.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="capitalize">{category.type}</span>
            <span>·</span>
            {scopeBadge(category.scope)}
            {category.parent_name && (
              <>
                <span>·</span>
                <span>under {category.parent_name}</span>
              </>
            )}
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={`/accounting/categories?edit=${category.id}`}>
            <Pencil className="mr-1 h-4 w-4" />
            Edit
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {ALL_RANGES.map((r) => (
          <Button
            key={r}
            asChild
            variant={r === range ? 'default' : 'outline'}
            size="sm"
          >
            <Link href={`/accounting/categories/${id}?range=${r}`}>
              {RANGE_LABELS[r]}
            </Link>
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="flex flex-wrap gap-x-10 gap-y-4 px-6 py-4">
          <Stat label="Transactions" value={txns.length.toLocaleString()} />
          <Stat label="Net movement" value={formatDOP(totalCents)} />
          <Stat label="Period" value={RANGE_LABELS[range]} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Transactions
            {isCapped && (
              <span className="ml-2 text-xs font-normal text-amber-600">
                latest 500 only — net above is partial; narrow the period for accuracy
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {txns.length === 0 ? (
            <p className="px-6 py-6 text-sm text-muted-foreground">
              No transactions in this period.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr className="border-b">
                    <th className="px-6 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Account</th>
                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                    <th className="px-6 py-2 font-medium">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {txns.map((t) => (
                    <tr key={t.id}>
                      <td className="whitespace-nowrap px-6 py-2 text-muted-foreground">
                        {formatDateTime(t.occurredAt)}
                      </td>
                      <td className="px-3 py-2">{t.accountName}</td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums ${
                          t.amountCents < 0 ? 'text-rose-600' : ''
                        }`}
                      >
                        {formatDOP(t.amountCents)}
                      </td>
                      <td className="px-6 py-2">
                        <div className="flex items-center gap-2">
                          <span className={t.description ? '' : 'text-muted-foreground'}>
                            {t.description ?? '—'}
                          </span>
                          {t.isManual && (
                            <Badge variant="outline" className="text-xs">
                              manual
                            </Badge>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t font-medium">
                  <tr>
                    <td className="px-6 py-2" colSpan={2}>
                      Total
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatDOP(totalCents)}
                    </td>
                    <td className="px-6 py-2" />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
