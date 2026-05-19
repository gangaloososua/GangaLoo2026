import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AlertTriangle, ExternalLink } from 'lucide-react'
import { requireOwner } from '@/lib/auth/guard'
import {
  getCourierPayment,
  getAllocationsForCourierPayment,
} from '@/lib/courier-payments'
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

// --- formatting helpers ------------------------------------

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

function formatDop(n: number): string {
  return new Intl.NumberFormat('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

function statusBadgeClass(status: string | null): string {
  switch (status) {
    case 'complete':
      return 'bg-green-100 text-green-900 border-green-200'
    case 'received':
      return 'bg-blue-100 text-blue-900 border-blue-200'
    case 'paid_supplier':
      return 'bg-amber-100 text-amber-900 border-amber-200'
    case 'pending':
      return 'bg-zinc-100 text-zinc-900 border-zinc-200'
    case 'cancelled':
      return 'bg-rose-100 text-rose-900 border-rose-200'
    case 'lost':
      return 'bg-rose-100 text-rose-900 border-rose-200'
    default:
      return 'bg-zinc-100 text-zinc-900 border-zinc-200'
  }
}

export default async function CourierPaymentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireOwner()
  const { id } = await params

  const [payment, allocations] = await Promise.all([
    getCourierPayment(id),
    getAllocationsForCourierPayment(id),
  ])

  if (!payment) {
    notFound()
  }

  const sumOfAllocations = allocations.reduce((acc, a) => acc + a.amountDop, 0)
  const integrityDelta = sumOfAllocations - payment.amountDopTotal
  const integrityOk = Math.abs(integrityDelta) <= 0.01

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Courier payment
          </h1>
          <p className="text-sm text-muted-foreground">
            Paid to {payment.courierName} on {formatDate(payment.paidAt)}.
          </p>
        </div>
      </div>

      {/* Integrity warning */}
      {!integrityOk ? (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="flex items-start gap-3 py-4 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-700" />
            <div className="space-y-1">
              <div className="font-medium text-amber-900">
                Allocation sum does not match payment total
              </div>
              <div className="text-amber-900">
                Allocations sum to{' '}
                <span className="tabular-nums">
                  {formatDop(sumOfAllocations)}
                </span>{' '}
                DOP, payment total is{' '}
                <span className="tabular-nums">
                  {formatDop(payment.amountDopTotal)}
                </span>{' '}
                DOP. Difference:{' '}
                <span className="tabular-nums">
                  {formatDop(integrityDelta)}
                </span>{' '}
                DOP.
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Header card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payment details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 text-sm">
            <div className="space-y-0.5">
              <dt className="text-xs text-muted-foreground">Courier</dt>
              <dd>{payment.courierName}</dd>
            </div>
            <div className="space-y-0.5">
              <dt className="text-xs text-muted-foreground">Paid at</dt>
              <dd>{formatDateTime(payment.paidAt)}</dd>
            </div>
            <div className="space-y-0.5">
              <dt className="text-xs text-muted-foreground">Amount (DOP)</dt>
              <dd className="tabular-nums">
                {formatDop(payment.amountDopTotal)}
              </dd>
            </div>
            <div className="space-y-0.5">
              <dt className="text-xs text-muted-foreground">Payment account</dt>
              <dd>{payment.moneyAccountName}</dd>
            </div>
            <div className="space-y-0.5">
              <dt className="text-xs text-muted-foreground">Reference</dt>
              <dd>{payment.reference ?? '—'}</dd>
            </div>
            <div className="space-y-0.5">
              <dt className="text-xs text-muted-foreground">Created</dt>
              <dd>{formatDateTime(payment.createdAt)}</dd>
            </div>
            {payment.description ? (
              <div className="space-y-0.5 sm:col-span-2 lg:col-span-3">
                <dt className="text-xs text-muted-foreground">Description</dt>
                <dd className="whitespace-pre-wrap">{payment.description}</dd>
              </div>
            ) : null}
          </dl>
        </CardContent>
      </Card>

      {/* Allocations */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Allocations{' '}
            <span className="text-xs font-normal text-muted-foreground">
              ({allocations.length}{' '}
              {allocations.length === 1 ? 'PO' : 'POs'})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ordered</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>PO</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount (DOP)</TableHead>
                <TableHead className="w-[1%]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allocations.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    No allocations on this payment.
                  </TableCell>
                </TableRow>
              ) : (
                allocations.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>{formatDate(a.purchaseOrderOrderedAt)}</TableCell>
                    <TableCell>{a.supplierName ?? '—'}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {a.purchaseOrderLegacyId ?? a.purchaseOrderId.slice(0, 8)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={statusBadgeClass(a.purchaseOrderStatus)}
                      >
                        {a.purchaseOrderStatus ?? '—'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatDop(a.amountDop)}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/purchases/${a.purchaseOrderId}`}
                        className="inline-flex items-center text-muted-foreground hover:text-foreground"
                        aria-label="Open PO"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
            {allocations.length > 0 ? (
              <tfoot>
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="text-right font-medium"
                  >
                    Total
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {formatDop(sumOfAllocations)}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </tfoot>
            ) : null}
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
