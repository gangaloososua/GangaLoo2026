// Round 15.6 — online order detail page
//
// Server component. Renders the full sale + 4 sub-tables.
// Wires the actions bar to the three transition RPCs.

import { notFound } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import { requireRole } from '@/lib/auth/guard'
import { getOnlineOrderById } from '@/lib/online-orders'
import { listMoneyAccounts } from '@/lib/sales'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { OnlineOrderActionsBar } from './actions-bar'
import {
  StatusBadge,
  trackingBadgeClass,
  saleStatusBadgeClass,
  commissionStatusBadgeClass,
} from '../_lib/badges'

// ============================================================
// Formatting helpers
// ============================================================

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDopCents(cents: number | null): string {
  if (cents == null) return '—'
  return new Intl.NumberFormat('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100)
}

function formatDopNumeric(n: number | null): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

function formatPercent(n: number | null): string {
  if (n == null) return '—'
  return `${n.toFixed(2)}%`
}

function formatQty(n: number): string {
  // Show as integer when whole, else up to 3 decimals
  return Number.isInteger(n) ? String(n) : n.toFixed(3)
}

// ============================================================
// Page
// ============================================================

export default async function OnlineOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireRole(['owner', 'admin'] as const)
  const { id } = await params
  const order = await getOnlineOrderById(id)
  if (!order) notFound()
  const moneyAccounts = await listMoneyAccounts()
  const outstandingCents = (order.totalCents ?? 0) - order.paidCents

  // Integrity checks
  const itemsSubtotal = order.items.reduce(
    (acc, it) => acc + (it.lineTotalCents ?? 0),
    0,
  )
  const paymentsSum = order.payments.reduce(
    (acc, p) => acc + p.amountCents,
    0,
  )
  // subtotal_cents on the sale is computed from items at insert time;
  // a mismatch suggests data drift. Skip the check on cancelled orders
  // (cogs/profit are nulled on cancel; subtotal stays as the original).
  const subtotalIntegrityOk =
    order.items.length === 0 || itemsSubtotal === order.subtotalCents
  const paidIntegrityOk = paymentsSum === order.paidCents

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {order.invoiceNumber ?? 'Online order'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {order.customerName ?? '(no customer)'} —{' '}
            {formatDate(order.soldAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge className={trackingBadgeClass(order.trackingStatus)}>
            {order.trackingStatus ?? '—'}
          </StatusBadge>
          <StatusBadge className={saleStatusBadgeClass(order.saleStatus)}>
            {order.saleStatus}
          </StatusBadge>
        </div>
      </div>

      {/* Integrity warnings */}
      {!subtotalIntegrityOk ? (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
          <CardContent className="flex items-start gap-3 py-4 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-700" />
            <div className="space-y-1">
              <div className="font-medium text-amber-900 dark:text-amber-200">
                Items subtotal does not match sale subtotal
              </div>
              <div className="text-amber-900 dark:text-amber-200">
                Items sum to{' '}
                <span className="tabular-nums">
                  {formatDopCents(itemsSubtotal)}
                </span>{' '}
                DOP, sale subtotal is{' '}
                <span className="tabular-nums">
                  {formatDopCents(order.subtotalCents)}
                </span>{' '}
                DOP.
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {!paidIntegrityOk ? (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
          <CardContent className="flex items-start gap-3 py-4 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-700" />
            <div className="space-y-1">
              <div className="font-medium text-amber-900 dark:text-amber-200">
                Payments sum does not match paid_cents
              </div>
              <div className="text-amber-900 dark:text-amber-200">
                Payment rows sum to{' '}
                <span className="tabular-nums">
                  {formatDopCents(paymentsSum)}
                </span>{' '}
                DOP, sale.paid_cents is{' '}
                <span className="tabular-nums">
                  {formatDopCents(order.paidCents)}
                </span>{' '}
                DOP.
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Actions */}
      <OnlineOrderActionsBar
        saleId={order.id}
        trackingStatus={order.trackingStatus}
        saleStatus={order.saleStatus}
        fulfillmentMethod={order.fulfillmentMethod}
        outstandingCents={outstandingCents}
        moneyAccounts={moneyAccounts}
      />

      {/* Two-column info */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Customer & Delivery */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Customer &amp; delivery</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-3 text-sm">
              <div className="space-y-0.5">
                <dt className="text-xs text-muted-foreground">Customer</dt>
                <dd>{order.customerName ?? '(no customer)'}</dd>
              </div>
              {order.customerEmail ? (
                <div className="space-y-0.5">
                  <dt className="text-xs text-muted-foreground">Email</dt>
                  <dd>{order.customerEmail}</dd>
                </div>
              ) : null}
              {order.customerPhone ? (
                <div className="space-y-0.5">
                  <dt className="text-xs text-muted-foreground">Phone</dt>
                  <dd>{order.customerPhone}</dd>
                </div>
              ) : null}
              <div className="space-y-0.5">
                <dt className="text-xs text-muted-foreground">
                  Fulfillment method
                </dt>
                <dd className="capitalize">{order.fulfillmentMethod}</dd>
              </div>
              {order.shippingAddress ? (
                <div className="space-y-0.5">
                  <dt className="text-xs text-muted-foreground">Address</dt>
                  <dd className="whitespace-pre-wrap">
                    {order.shippingAddress}
                  </dd>
                </div>
              ) : null}
              {order.shippingCity ? (
                <div className="space-y-0.5">
                  <dt className="text-xs text-muted-foreground">City</dt>
                  <dd>{order.shippingCity}</dd>
                </div>
              ) : null}
              {order.deliveryNotes ? (
                <div className="space-y-0.5">
                  <dt className="text-xs text-muted-foreground">Notes</dt>
                  <dd className="whitespace-pre-wrap">
                    {order.deliveryNotes}
                  </dd>
                </div>
              ) : null}
              {order.trackingNumber ? (
                <div className="space-y-0.5">
                  <dt className="text-xs text-muted-foreground">
                    Tracking number
                  </dt>
                  <dd className="font-mono text-xs">{order.trackingNumber}</dd>
                </div>
              ) : null}
            </dl>
          </CardContent>
        </Card>

        {/* Timeline */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-3 text-sm">
              <div className="space-y-0.5">
                <dt className="text-xs text-muted-foreground">Sold at</dt>
                <dd>{formatDateTime(order.soldAt)}</dd>
              </div>
              <div className="space-y-0.5">
                <dt className="text-xs text-muted-foreground">Confirmed at</dt>
                <dd>{formatDateTime(order.confirmedAt)}</dd>
              </div>
              <div className="space-y-0.5">
                <dt className="text-xs text-muted-foreground">Paid at</dt>
                <dd>{formatDateTime(order.paidAt)}</dd>
              </div>
              <div className="space-y-0.5">
                <dt className="text-xs text-muted-foreground">Dispatched at</dt>
                <dd>{formatDateTime(order.dispatchedAt)}</dd>
              </div>
              <div className="space-y-0.5">
                <dt className="text-xs text-muted-foreground">Delivered at</dt>
                <dd>{formatDateTime(order.deliveredAt)}</dd>
              </div>
              {order.refundedAt ? (
                <div className="space-y-0.5">
                  <dt className="text-xs text-muted-foreground">Refunded at</dt>
                  <dd>{formatDateTime(order.refundedAt)}</dd>
                </div>
              ) : null}
              {order.refundReason ? (
                <div className="space-y-0.5">
                  <dt className="text-xs text-muted-foreground">
                    Cancel / refund reason
                  </dt>
                  <dd className="whitespace-pre-wrap">{order.refundReason}</dd>
                </div>
              ) : null}
            </dl>
          </CardContent>
        </Card>
      </div>

      {/* Order metadata + totals */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Order summary</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3 lg:grid-cols-4">
            <div className="space-y-0.5">
              <dt className="text-xs text-muted-foreground">
                Source warehouse
              </dt>
              <dd>{order.sourceWarehouseName ?? '—'}</dd>
            </div>
            <div className="space-y-0.5">
              <dt className="text-xs text-muted-foreground">
                Fulfillment warehouse
              </dt>
              <dd>{order.fulfillmentWarehouseName}</dd>
            </div>
            <div className="space-y-0.5">
              <dt className="text-xs text-muted-foreground">Seller</dt>
              <dd>{order.sellerName ?? '—'}</dd>
            </div>
            <div className="space-y-0.5">
              <dt className="text-xs text-muted-foreground">
                Mixed warehouse?
              </dt>
              <dd>{order.isMixedWarehouse ? 'Yes' : 'No'}</dd>
            </div>
            <div className="space-y-0.5">
              <dt className="text-xs text-muted-foreground">Subtotal</dt>
              <dd className="tabular-nums">
                {formatDopCents(order.subtotalCents)}
              </dd>
            </div>
            <div className="space-y-0.5">
              <dt className="text-xs text-muted-foreground">
                Order discount
              </dt>
              <dd className="tabular-nums">
                {formatDopCents(order.discountCents)}
              </dd>
            </div>
            <div className="space-y-0.5">
              <dt className="text-xs text-muted-foreground">Shipping</dt>
              <dd className="tabular-nums">
                {formatDopCents(order.shippingCents)}
              </dd>
            </div>
            <div className="space-y-0.5">
              <dt className="text-xs text-muted-foreground">Tax</dt>
              <dd className="tabular-nums">
                {formatDopCents(order.taxCents)}
              </dd>
            </div>
            <div className="space-y-0.5">
              <dt className="text-xs font-medium text-muted-foreground">
                Total
              </dt>
              <dd className="tabular-nums font-semibold">
                {formatDopCents(order.totalCents)}
              </dd>
            </div>
            <div className="space-y-0.5">
              <dt className="text-xs text-muted-foreground">Paid</dt>
              <dd className="tabular-nums">
                {formatDopCents(order.paidCents)}
              </dd>
            </div>
            <div className="space-y-0.5">
              <dt className="text-xs text-muted-foreground">COGS</dt>
              <dd className="tabular-nums">
                {formatDopCents(order.cogsCents)}
              </dd>
            </div>
            <div className="space-y-0.5">
              <dt className="text-xs text-muted-foreground">Gross profit</dt>
              <dd className="tabular-nums">
                {formatDopCents(order.grossProfitCents)}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Items{' '}
            <span className="text-xs font-normal text-muted-foreground">
              ({order.items.length}{' '}
              {order.items.length === 1 ? 'line' : 'lines'})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit price</TableHead>
                <TableHead className="text-right">Discount</TableHead>
                <TableHead className="text-right">Line total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.items.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    No items on this order.
                  </TableCell>
                </TableRow>
              ) : (
                order.items.map((it) => (
                  <TableRow key={it.id}>
                    <TableCell>
                      <div>{it.productName ?? '—'}</div>
                      {it.productSku ? (
                        <div className="font-mono text-xs text-muted-foreground">
                          {it.productSku}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatQty(it.qty)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatDopCents(it.unitPriceCents)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatDopCents(it.discountCents)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatDopCents(it.lineTotalCents)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Lot consumption — only render if non-empty */}
      {order.lotConsumption.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Lot consumption{' '}
              <span className="text-xs font-normal text-muted-foreground">
                ({order.lotConsumption.length}{' '}
                {order.lotConsumption.length === 1 ? 'layer' : 'layers'})
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lot</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Qty consumed</TableHead>
                  <TableHead className="text-right">
                    Unit cost (DOP)
                  </TableHead>
                  <TableHead className="text-right">
                    Layer cost (DOP)
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.lotConsumption.map((lc) => {
                  const layerCost = lc.qtyConsumed * lc.unitCostDop
                  return (
                    <TableRow key={lc.id}>
                      <TableCell className="font-mono text-xs">
                        {lc.lotNumber ?? lc.lotId.slice(0, 8)}
                      </TableCell>
                      <TableCell>{lc.productName ?? '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatQty(lc.qtyConsumed)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatDopNumeric(lc.unitCostDop)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatDopNumeric(layerCost)}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {/* Payments */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Payments{' '}
            <span className="text-xs font-normal text-muted-foreground">
              ({order.payments.length}{' '}
              {order.payments.length === 1 ? 'row' : 'rows'})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Paid at</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.payments.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    No payments recorded.
                  </TableCell>
                </TableRow>
              ) : (
                order.payments.map((p) => {
                  const isCompensating = p.amountCents < 0
                  return (
                    <TableRow
                      key={p.id}
                      className={isCompensating ? 'bg-rose-50/40' : undefined}
                    >
                      <TableCell>{formatDateTime(p.paidAt)}</TableCell>
                      <TableCell className="capitalize">{p.method}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {p.moneyAccountName ?? '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {p.reference ?? '—'}
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums ${
                          isCompensating ? 'text-rose-900' : ''
                        }`}
                      >
                        {formatDopCents(p.amountCents)}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Commissions — only render if non-empty */}
      {order.commissions.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Commissions{' '}
              <span className="text-xs font-normal text-muted-foreground">
                ({order.commissions.length}{' '}
                {order.commissions.length === 1 ? 'row' : 'rows'})
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Earner</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Percent</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.commissions.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{c.earnerName ?? '—'}</TableCell>
                    <TableCell className="capitalize text-muted-foreground">
                      {c.earnerRole}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPercent(c.percent)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatDopCents(c.amountCents)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        className={commissionStatusBadgeClass(c.status)}
                      >
                        {c.status}
                      </StatusBadge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
