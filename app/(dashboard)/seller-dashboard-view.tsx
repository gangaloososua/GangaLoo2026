// Round 26b — seller dashboard view (seller/distributor self-view).
//
// Server component (pure render of the SellerDashboard bundle). No client
// interactivity needed; order rows link to the sale detail page.
//
// i18n: receives a `locale` (always Spanish in practice, since only
// sellers/distributors reach this view) and routes all visible text
// through t()/plural() from the shared dictionary.

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatDOP, formatDate } from '@/lib/format'
import { ArrowRight } from 'lucide-react'
import type { SellerDashboard, SellerOrderRow, SellerHeldCashRow } from '@/lib/seller-dashboard'
import { formatDateTime } from '@/lib/format'
import { ReceiveTransferButton } from './transfers/receive-transfer-button'
import { type Locale, t, plural } from '@/lib/i18n/dictionary'

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

function statusBadge(status: string, locale: Locale) {
  switch (status) {
    case 'paid':
      return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">{t(locale, 'status.paid')}</Badge>
    case 'partially_paid':
      return <Badge variant="outline" className="border-amber-500 text-amber-700">{t(locale, 'status.partial')}</Badge>
    case 'confirmed':
      return <Badge variant="secondary">{t(locale, 'status.confirmed')}</Badge>
    case 'cancelled':
      return <Badge variant="outline" className="border-rose-400 text-rose-700">{t(locale, 'status.cancelled')}</Badge>
    case 'refunded':
      return <Badge variant="outline" className="text-muted-foreground">{t(locale, 'status.refunded')}</Badge>
    default:
      return <Badge variant="secondary">{status}</Badge>
  }
}

function OrderTable({
  rows,
  emptyText,
  locale,
}: {
  rows: SellerOrderRow[]
  emptyText: string
  locale: Locale
}) {
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
              {statusBadge(o.status, locale)}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {o.customer_name ?? t(locale, 'dash.walkIn')} · {formatDate(o.sold_at)}
            </div>
          </div>
          <div className="text-right">
            <div className="tabular-nums">{formatDOP(o.total_cents)}</div>
            {o.outstanding_cents > 0 ? (
              <div className="text-xs text-rose-600 tabular-nums">
                {t(locale, 'dash.owes')} {formatDOP(o.outstanding_cents)}
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
  locale,
}: {
  data: SellerDashboard
  sellerName: string | null
  locale: Locale
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {sellerName ? `${t(locale, 'dash.greeting')}, ${sellerName}` : t(locale, 'dash.myDashboard')}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t(locale, 'dash.subtitle')}
        </p>
      </div>

      {/* Incoming transfers (distributors): stock heading to their warehouse */}
      {data.incoming_transfers.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {t(locale, 'dash.incomingTransfers')}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({data.incoming_transfers.length} {t(locale, 'dash.onTheWay')})
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {data.incoming_transfers.map((tr) => (
                <div key={tr.id} className="flex items-center justify-between gap-3 px-6 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm">
                      {tr.from_warehouse_name}
                      <ArrowRight className="mx-1 inline h-3 w-3 text-muted-foreground" />
                      {tr.to_warehouse_name}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {tr.total_qty} {plural(locale, tr.total_qty, 'unit.one', 'unit.other')} ·{' '}
                      {tr.item_count} {plural(locale, tr.item_count, 'product.one', 'product.other')} ·{' '}
                      {t(locale, 'dash.sent')} {formatDateTime(tr.initiated_at)}
                    </div>
                  </div>
                  <ReceiveTransferButton transferId={tr.id} toWarehouseName={tr.to_warehouse_name} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Money stat cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label={t(locale, 'dash.commissionOwed')}
          value={formatDOP(data.commissions.owed_cents)}
          sub={`${formatDOP(data.commissions.earned_cents)} ${t(locale, 'dash.earned')} · ${formatDOP(
            data.commissions.paid_cents,
          )} ${t(locale, 'dash.paid')}`}
        />
        <StatCard
          label={t(locale, 'dash.unpaidOnOrders')}
          value={formatDOP(data.orders.open_outstanding_cents)}
          sub={`${data.orders.open.length} ${plural(
            locale,
            data.orders.open.length,
            'order.one',
            'order.other',
          )} · ${t(locale, 'dash.businessOwedThis')}`}
          tone={data.orders.open_outstanding_cents > 0 ? 'warn' : 'normal'}
        />
        <StatCard
          label={t(locale, 'dash.cashHolding')}
          value={formatDOP(data.held_cash_cents)}
          sub={t(locale, 'dash.collectedNotHandedIn')}
          tone={data.held_cash_cents > 0 ? 'warn' : 'normal'}
        />
      </div>

      {/* Open orders */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {t(locale, 'dash.openOrders')}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({t(locale, 'dash.stillOwing')})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <OrderTable rows={data.orders.open} emptyText={t(locale, 'dash.noOpenOrders')} locale={locale} />
        </CardContent>
      </Card>

      {/* Recent orders */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {t(locale, 'dash.recentOrders')}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({data.orders.lifetime_count} {t(locale, 'dash.total')})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <OrderTable rows={data.orders.recent} emptyText={t(locale, 'dash.noOrders')} locale={locale} />
        </CardContent>
      </Card>

      {/* Cash you're holding — per-order breakdown */}
      {data.held_cash.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {t(locale, 'dash.cashHolding')}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({formatDOP(data.held_cash_cents)} {t(locale, 'dash.notYetHandedIn')})
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
            {t(locale, 'dash.availableStock')}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({data.stock.total_units.toLocaleString('en-US')}{' '}
              {plural(locale, data.stock.total_units, 'unit.one', 'unit.other')})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.stock.by_category.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t(locale, 'dash.nothingInStock')}</p>
          ) : (
            <div className="space-y-1">
              {data.stock.by_category.map((c) => (
                <div
                  key={c.category_id ?? '__uncat__'}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="truncate pr-2">{c.category_name}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {c.units.toLocaleString('en-US')} {plural(locale, c.units, 'unit.one', 'unit.other')}
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
