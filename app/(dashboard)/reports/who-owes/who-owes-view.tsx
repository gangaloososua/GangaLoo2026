'use client'

// Reports - "Who owes me" view.
//
// Headline: total owed, split into owed-by-customers and owed-by-sellers
// (Walk-in pay-later cash). Table lists every person who owes, largest first,
// with their two columns and a combined total. Names link to the person's
// detail page. Money in CENTS.

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDOP } from '@/lib/format'
import type { WhoOwesMe } from '@/lib/who-owes'

const DASH = '\u2014'

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string
  sub?: string
  accent?: string
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div
          className="mt-1 text-2xl font-semibold tabular-nums"
          style={accent ? { color: accent } : undefined}
        >
          {value}
        </div>
        {sub ? <div className="mt-1 text-xs text-muted-foreground">{sub}</div> : null}
      </CardContent>
    </Card>
  )
}

export function WhoOwesView({ data }: { data: WhoOwesMe }) {
  return (
    <div className="space-y-6">
      {/* Headline */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="Total owed to you"
          value={formatDOP(data.total_owed_cents)}
          sub={`${data.people_count} ${data.people_count === 1 ? 'person' : 'people'}`}
          accent={data.total_owed_cents > 0 ? '#f59e0b' : undefined}
        />
        <StatCard
          label="Owed by customers"
          value={formatDOP(data.customer_owed_cents)}
          sub="open invoices"
        />
        <StatCard
          label="Owed by sellers"
          value={formatDOP(data.seller_owed_cents)}
          sub="Walk-in pay-later cash"
          accent={data.seller_owed_cents > 0 ? '#d97706' : undefined}
        />
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">By person</CardTitle>
          <p className="text-xs text-muted-foreground">
            Largest balance first. A person can owe on both counts.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 border-b px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <span>Person</span>
            <span className="w-28 text-right">As customer</span>
            <span className="w-28 text-right">As seller</span>
            <span className="w-28 text-right">Total</span>
          </div>

          {data.rows.length === 0 ? (
            <div className="px-4 py-3 text-sm text-muted-foreground">
              Nobody owes you anything right now &mdash; all paid up.
            </div>
          ) : (
            <div className="divide-y">
              {data.rows.map((r, i) => (
                <div
                  key={(r.profile_id ?? 'x') + i}
                  className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 px-4 py-2 text-sm"
                >
                  <div className="min-w-0">
                    {r.profile_id ? (
                      <Link
                        href={`/people/${r.profile_id}`}
                        className="truncate font-medium hover:underline"
                      >
                        {r.name}
                      </Link>
                    ) : (
                      <span className="truncate font-medium">{r.name}</span>
                    )}
                  </div>
                  <span className="w-28 text-right tabular-nums text-muted-foreground">
                    {r.owes_as_customer_cents > 0
                      ? formatDOP(r.owes_as_customer_cents)
                      : DASH}
                  </span>
                  <span className="w-28 text-right tabular-nums text-muted-foreground">
                    {r.owes_as_seller_cents > 0 ? (
                      <span className="text-amber-700">
                        {formatDOP(r.owes_as_seller_cents)}
                      </span>
                    ) : (
                      DASH
                    )}
                  </span>
                  <span className="w-28 text-right font-medium tabular-nums">
                    {formatDOP(r.total_cents)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
