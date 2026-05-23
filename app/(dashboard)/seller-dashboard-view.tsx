// Round 26b — seller dashboard view (seller/distributor self-view).
//
// Server component (pure render of the SellerDashboard bundle). No client
// interactivity needed; order rows link to the sale detail page.

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatDOP, formatDate } from '@/lib/format'
import type { SellerDashboard, SellerOrderRow, SellerHeldCashRow } from '@/lib/seller-dashboard'

function StatCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string
  sub?: string
  tone?: 'normal' | 'warn'
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div
          className={
            'mt-1 text-2xl font-semibold tabular-nums ' +
            (tone === 'warn' ? 'text-amber-700' : '')
          }
        >
          {value}
        </div>
        {sub ? <div className="mt-1 text-xs text-muted-foreground">{sub}</div> : null}
      </CardContent>
    </Card>
  )
}

function statusBadge(status: string) {
  switch (status) {
    case 'paid':
      return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Paid</Badge>
    case 'partially_paid':
      return <Badge variant="outline" className="border-amber-500 text-amber-700">Partial</Badge>
    case 'confirmed':
      return <Badge variant="secondary">Confirmed</Badge>
    case 'cancelled':
      return <Badge variant="outline" className="border-rose-400 text-rose-700">Cancelled</Badge>
    case 'refunded':
      return <Badge variant="outline" className="text-muted-foreground">Refunded</Badge>
    default:
      return <Badge variant="secondary">{status}</Badge>
  }
}

function OrderTable({ rows, emptyText }: { rows: SellerOrderRow[]; emptyText: string }) {
  if (rows.length === 0) {
    return <p className="px-6 py-6 text-sm text-muted-foreground">{emptyText}</p>
  }
  return (
    <div className="divide-y">
      {rows.map((o) => (
        <Link
          key={o.id}
          href={`/sales/${o.id}`}
          className="flex items-center justify-between px-6 py-2.5 hover:bg-muted/40"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono font-medium">{o.invoice_number ?? '—'}</span>
              {statusBadge(o.status)}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {o.customer_name ?? 'Walk-in / no customer'} · {formatDate(o.sold_at)}
            </div>
          </div>
          <div className="text-right">
            <div className="tabular-nums">{formatDOP(o.total_cents)}</div>
            {o.outstanding_cents > 0 ? (
              <div className="text-xs text-rose-600 tabular-nums">
                owes {formatDOP(o.outstanding_cents)}
              </div>
            ) : null}
          </div>
        </Link>
      ))}
    </div>
  )
}

export function SellerDashboardView({
  data,
  sellerName,
}: {
  data: SellerDashboard
  sellerName: string | null
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {sellerName ? `Hi, ${sellerName}` : 'My dashboard'}
        </h1>
        <p className="text-sm text-muted-foreground">
          Your commissions, your orders, what you owe the business, and what&apos;s in stock.
        </p>
      </div>

      {/* Money stat cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Commission owed to you"
          value={formatDOP(data.commissions.owed_cents)}
          sub={`${formatDOP(data.commissions.earned_cents)} earned · ${formatDOP(
            data.commissions.paid_cents,
          )} paid`}
        />
        <StatCard
          label="Unpaid on your orders"
          value={formatDOP(data.orders.open_outstanding_cents)}
          sub={`${data.orders.open.length} open ${
            data.orders.open.length === 1 ? 'order' : 'orders'
          } · the business is owed this`}
          tone={data.orders.open_outstanding_cents > 0 ? 'warn' : 'normal'}
        />
        <StatCard
          label="Cash you're holding"
          value={formatDOP(data.held_cash_cents)}
          sub="collected, not yet handed in"
          tone={data.held_cash_cents > 0 ? 'warn' : 'normal'}
        />
      </div>

      {/* Open orders */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Open orders
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              (still owing)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <OrderTable rows={data.orders.open} emptyText="No open orders — nothing owing right now." />
        </CardContent>
      </Card>

      {/* Recent orders */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Recent orders
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({data.orders.lifetime_count} total)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <OrderTable rows={data.orders.recent} emptyText="No orders yet." />
        </CardContent>
      </Card>

      {/* Cash you're holding — per-order breakdown */}
      {data.held_cash.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Cash you&apos;re holding
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({formatDOP(data.held_cash_cents)} not yet handed in)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {data.held_cash.map((c: SellerHeldCashRow) => (
                <Link
                  key={c.id}
                  href={`/sales/${c.sale_id}`}
                  className="flex items-center justify-between px-6 py-2.5 hover:bg-muted/40"
                >
                  <div className="min-w-0">
                    <div className="font-mono font-medium">
                      {c.invoice_number ?? c.sale_id.slice(0, 8)}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {formatDate(c.collected_at)}
                      {c.note ? ` · ${c.note}` : ''}
                    </div>
                  </div>
                  <div className="tabular-nums">{formatDOP(c.amount_cents)}</div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Available stock */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Available stock
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({data.stock.total_units.toLocaleString('en-US')} units)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.stock.by_category.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing in stock.</p>
          ) : (
            <div className="space-y-1">
              {data.stock.by_category.map((c) => (
                <div
                  key={c.category_id ?? '__uncat__'}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="truncate pr-2">{c.category_name}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {c.units.toLocaleString('en-US')} units
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
