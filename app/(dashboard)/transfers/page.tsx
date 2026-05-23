import Link from 'next/link'
import { Plus, ArrowRight } from 'lucide-react'
import { requireOwner } from '@/lib/auth/guard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatDateTime } from '@/lib/format'
import { listTransfers, type TransferListRow } from '@/lib/stock-transfers'
import { ReceiveTransferButton } from './receive-transfer-button'

export const dynamic = 'force-dynamic'

function statusBadge(status: string) {
  switch (status) {
    case 'in_transit':
      return <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">In transit</Badge>
    case 'received':
      return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Received</Badge>
    case 'cancelled':
      return <Badge variant="outline" className="border-rose-400 text-rose-700">Cancelled</Badge>
    default:
      return <Badge variant="secondary">{status}</Badge>
  }
}

function TransferRow({ t, showReceive }: { t: TransferListRow; showReceive: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 px-6 py-3">
      <Link href={`/transfers/${t.id}`} className="min-w-0 flex-1 hover:opacity-80">
        <div className="flex items-center gap-2">
          {statusBadge(t.status)}
          <span className="truncate text-sm">
            {t.from_warehouse_name}
            <ArrowRight className="mx-1 inline h-3 w-3 text-muted-foreground" />
            {t.to_warehouse_name}
          </span>
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {t.total_qty} {t.total_qty === 1 ? 'unit' : 'units'} ·{' '}
          {t.item_count} {t.item_count === 1 ? 'product' : 'products'} ·{' '}
          {t.status === 'received' && t.received_at
            ? `received ${formatDateTime(t.received_at)}`
            : `sent ${formatDateTime(t.initiated_at)}`}
        </div>
      </Link>
      {showReceive && (
        <ReceiveTransferButton transferId={t.id} toWarehouseName={t.to_warehouse_name} />
      )}
    </div>
  )
}

export default async function TransfersPage() {
  await requireOwner()
  const [inTransit, received] = await Promise.all([
    listTransfers({ status: 'in_transit' }),
    listTransfers({ status: 'received', limit: 50 }),
  ])

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Stock Transfers</h1>
          <p className="text-sm text-muted-foreground">
            Move stock between warehouses. Sent stock waits in transit until received.
          </p>
        </div>
        <Button asChild>
          <Link href="/transfers/new">
            <Plus className="mr-1 h-4 w-4" />
            New transfer
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            In transit
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({inTransit.length})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {inTransit.length === 0 ? (
            <p className="px-6 py-6 text-sm text-muted-foreground">Nothing in transit.</p>
          ) : (
            <div className="divide-y">
              {inTransit.map((t) => (
                <TransferRow key={t.id} t={t} showReceive />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Received
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              (recent)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {received.length === 0 ? (
            <p className="px-6 py-6 text-sm text-muted-foreground">No received transfers yet.</p>
          ) : (
            <div className="divide-y">
              {received.map((t) => (
                <TransferRow key={t.id} t={t} showReceive={false} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
