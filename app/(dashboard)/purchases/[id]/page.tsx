import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, AlertTriangle, Check, Minus } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import { requireOwner } from '@/lib/auth/guard'
import {
  getPurchaseOrder,
  getPurchaseOrderItems,
  getLotTrailForOrder,
  getTransportSummaryForOrder,
} from '@/lib/purchases'
import {
  derivedStatus,
  statusMismatch,
  partialReceiveStatus,
  type PurchaseStatus,
  type PurchaseOrderRow,
} from '@/lib/purchases-types'

import { PurchaseDetailLineRow } from './detail-line-row'
import { PurchaseActionsBar } from './actions-bar'

export const dynamic = 'force-dynamic'

// ---- formatting helpers -----------------------------------

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatNumber(n: number, dp = 2): string {
  return new Intl.NumberFormat('en-GB', {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  }).format(n)
}

function formatNumberOrDash(n: number | null | undefined, dp = 2): string {
  if (n == null) return '—'
  if (n === 0) return '—'
  return formatNumber(n, dp)
}

function statusLabel(s: PurchaseStatus): string {
  switch (s) {
    case 'pending': return 'Pending'
    case 'paid_supplier': return 'Paid supplier'
    case 'received': return 'Received'
    case 'complete': return 'Complete'
    default: return s
  }
}

function StatusBadge({ status }: { status: PurchaseStatus }) {
  switch (status) {
    case 'pending':
      return <Badge variant="secondary">Pending</Badge>
    case 'paid_supplier':
      return <Badge variant="outline">Paid supplier</Badge>
    case 'received':
      return <Badge variant="default">Received</Badge>
    case 'complete':
      return (
        <Badge variant="default" className="bg-green-600 hover:bg-green-600 text-white">
          Complete
        </Badge>
      )
    default:
      return <Badge variant="secondary">{status}</Badge>
  }
}

// "isPaid" rule: paid_at_dop set AND dop_paid_total > 0.
// (Migration data has dop_paid_total = NULL or exchange_rate = 0
// on unpaid rows; treat 0 as null per the data-layer finding.)
function isPaid(po: PurchaseOrderRow): boolean {
  if (!po.paid_at_dop) return false
  if (po.dop_paid_total == null) return false
  if (po.dop_paid_total === 0) return false
  return true
}

// ---- stage timeline ---------------------------------------

type Stage = { key: string; label: string; iso: string | null }

function StageTimeline({ po }: { po: PurchaseOrderRow }) {
  const stages: Stage[] = [
    { key: 'ordered', label: 'Ordered', iso: po.ordered_at },
    { key: 'paid', label: 'Paid supplier', iso: po.paid_at_dop },
    { key: 'received', label: 'Received', iso: po.received_at },
    { key: 'complete', label: 'Complete', iso: po.completed_at },
  ]
  return (
    <div className="flex items-start justify-between gap-2">
      {stages.map((s, i) => {
        const reached = !!s.iso
        return (
          <div key={s.key} className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <div
                className={
                  'size-3 rounded-full flex-shrink-0 ' +
                  (reached
                    ? 'bg-foreground'
                    : 'bg-background border-2 border-dashed border-muted-foreground/40')
                }
              />
              {i < stages.length - 1 && (
                <div
                  className={
                    'h-px flex-1 ' +
                    (reached ? 'bg-foreground/30' : 'bg-muted-foreground/20')
                  }
                />
              )}
            </div>
            <div className="mt-2">
              <div className={'text-xs font-medium ' + (reached ? '' : 'text-muted-foreground')}>
                {s.label}
              </div>
              <div className={'text-xs tabular-nums ' + (reached ? 'text-muted-foreground' : 'text-muted-foreground/60')}>
                {formatDate(s.iso)}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ---- the page ---------------------------------------------

export default async function PurchaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireOwner()
  const { id } = await params

  const order = await getPurchaseOrder(id)
  if (!order) notFound()

  // Fetch the four side-data sets in parallel.
  const [items, lotTrail, transport] = await Promise.all([
    getPurchaseOrderItems(order.id),
    getLotTrailForOrder(order.id),
    getTransportSummaryForOrder(order.id),
  ])

  const stored = order.status
  const derived = derivedStatus(order)
  const mismatch = statusMismatch(order)

  const paid = isPaid(order)
  const usdTotal = order.usd_total
  const dopPaid = order.dop_paid_total ?? 0
  const dopBankFee = order.dop_bank_fee ?? 0
  const effectiveRate = paid && usdTotal > 0 ? (dopPaid + dopBankFee) / usdTotal : null
  const officialRate = order.official_rate_at_payment && order.official_rate_at_payment > 0
    ? order.official_rate_at_payment
    : null
  const storedRate = order.exchange_rate && order.exchange_rate > 0 ? order.exchange_rate : null

  // Line-item audit: base + bank + transport == landed?
  // Tolerance of 0.01 DOP per unit to absorb migration rounding.
  function lineAuditMismatch(line: typeof items[number]): boolean {
    if (line.dop_unit_landed_cost == null) return false
    const base = line.dop_unit_cost_base ?? 0
    const bank = line.dop_bank_share ?? 0
    const transport = line.dop_transport_share ?? 0
    const expected = base + bank + transport
    return Math.abs(expected - line.dop_unit_landed_cost) > 0.01
  }

  const lineMismatchCount = items.filter(lineAuditMismatch).length
  const showLineMismatchDots = lineMismatchCount > 0 && lineMismatchCount / Math.max(items.length, 1) <= 0.10

  // Header label: prefer legacy_id, else short id.
  const shortId = order.id.split('-')[0]
  const headerLabel = order.legacy_id ?? shortId

  return (
    <div className="space-y-6 max-w-6xl">
      <Link
        href="/purchases"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Back to purchases
      </Link>

      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Purchase <span className="font-mono text-xl">{headerLabel}</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            {order.supplier_name ?? 'Unknown supplier'} ·{' '}
            <span className="tabular-nums">{formatDate(order.ordered_at)}</span>
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusBadge status={stored} />
          <PurchaseActionsBar orderId={order.id} status={stored} items={items} lotTrail={lotTrail} />
        </div>
      </div>

      {/* Order overview */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Order overview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 text-sm">
            <div className="space-y-3">
              <div>
                <div className="text-xs text-muted-foreground">Supplier</div>
                <div className="font-medium">{order.supplier_name ?? <span className="text-muted-foreground">Unknown</span>}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Warehouse</div>
                <div className="font-medium">{order.warehouse_name ?? <span className="text-muted-foreground">Unknown</span>}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Notes</div>
                <div className={order.notes ? '' : 'text-muted-foreground'}>
                  {order.notes ?? 'None'}
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <div className="text-xs text-muted-foreground">Stored status</div>
                <div className="mt-1"><StatusBadge status={stored} /></div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Derived from timestamps</div>
                <div className="mt-1 flex items-center gap-2">
                  <StatusBadge status={derived} />
                  {mismatch ? (
                    <Badge variant="outline" className="border-amber-500 bg-amber-50 text-amber-900">
                      <AlertTriangle className="mr-1 size-3" />
                      Mismatch
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-green-500 bg-green-50 text-green-900">
                      <Check className="mr-1 size-3" />
                      Agreement
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t">
            <StageTimeline po={order} />
          </div>
        </CardContent>
      </Card>

      {/* Money */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Money</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* USD */}
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                USD
              </div>
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Subtotal</dt>
                  <dd className="tabular-nums">{formatNumber(order.usd_subtotal)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">+ Shipping</dt>
                  <dd className="tabular-nums">{formatNumber(order.usd_shipping)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">+ Tax</dt>
                  <dd className="tabular-nums">{formatNumber(order.usd_tax)}</dd>
                </div>
                <div className="flex justify-between pt-1.5 border-t font-semibold">
                  <dt>USD total</dt>
                  <dd className="tabular-nums">{formatNumber(order.usd_total)}</dd>
                </div>
              </dl>
            </div>

            {/* DOP */}
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                DOP (supplier payment)
              </div>
              {paid ? (
                <dl className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Paid total</dt>
                    <dd className="tabular-nums">{formatNumber(dopPaid)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">+ Bank fee</dt>
                    <dd className="tabular-nums">{formatNumber(dopBankFee)}</dd>
                  </div>
                  <div className="flex justify-between pt-1.5 border-t font-semibold">
                    <dt>Effective rate</dt>
                    <dd className="tabular-nums">{effectiveRate != null ? formatNumber(effectiveRate, 4) : '—'}</dd>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <dt>Stored rate</dt>
                    <dd className="tabular-nums">{storedRate != null ? formatNumber(storedRate, 4) : '—'}</dd>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <dt>Official rate at payment</dt>
                    <dd className="tabular-nums">{officialRate != null ? formatNumber(officialRate, 4) : '—'}</dd>
                  </div>
                  <div className="flex justify-between pt-1.5 text-xs">
                    <dt className="text-muted-foreground">Paid on</dt>
                    <dd className="tabular-nums">{formatDate(order.paid_at_dop)}</dd>
                  </div>
                </dl>
              ) : (
                <div className="text-sm text-muted-foreground italic">
                  Not paid yet
                </div>
              )}
            </div>

            {/* Transport */}
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Transport (courier)
              </div>
              {transport.allocated_dop > 0 ? (
                <div className="space-y-3">
                  <div className="text-sm">
                    <div className="flex justify-between font-semibold">
                      <span>Allocated total</span>
                      <span className="tabular-nums">{formatNumber(transport.allocated_dop)}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {transport.allocation_count}{' '}
                      {transport.allocation_count === 1 ? 'allocation' : 'allocations'}
                    </div>
                  </div>
                  <div className="rounded-md border max-h-64 overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Paid</TableHead>
                          <TableHead className="text-xs">Courier</TableHead>
                          <TableHead className="text-xs">From</TableHead>
                          <TableHead className="text-xs text-right">DOP</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {transport.allocations.map((a) => (
                          <TableRow key={a.allocation_id}>
                            <TableCell className="text-xs tabular-nums">{formatDate(a.paid_at)}</TableCell>
                            <TableCell className="text-xs">{a.courier_name ?? '—'}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{a.money_account_name ?? '—'}</TableCell>
                            <TableCell className="text-xs text-right tabular-nums">{formatNumber(a.amount_dop)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground italic">
                  No transport allocations
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Items */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Items <span className="text-sm font-normal text-muted-foreground">· {items.length}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <div className="text-sm text-muted-foreground italic py-4">No line items.</div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">USD unit</TableHead>
                    <TableHead className="text-right">USD line</TableHead>
                    <TableHead className="text-right">DOP base</TableHead>
                    <TableHead className="text-right">+ Bank</TableHead>
                    <TableHead className="text-right">+ Transport</TableHead>
                    <TableHead className="text-right">DOP landed</TableHead>
                    <TableHead>Receipt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((line) => {
                    const lots = lotTrail.get(line.id) ?? []
                    const partial = partialReceiveStatus(line, lots)
                    const flagged = showLineMismatchDots && lineAuditMismatch(line)
                    return (
                      <PurchaseDetailLineRow
                        key={line.id}
                        line={line}
                        lots={lots}
                        partial={partial}
                        landedMismatch={flagged}
                      />
                    )
                  })}
                </TableBody>
              </Table>
              {lineMismatchCount > 0 && !showLineMismatchDots && (
                <div className="px-3 py-2 text-xs text-muted-foreground border-t bg-muted/30">
                  <Minus className="inline size-3 mr-1" />
                  {lineMismatchCount} of {items.length} line items have a landed-cost rounding gap.
                  Indicator suppressed because more than 10% of rows would be flagged (likely a
                  migration-wide rounding difference rather than per-row data issues).
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
