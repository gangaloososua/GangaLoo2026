'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CheckCircle2, PackageMinus, Truck } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

import { markComplete, markLost, markReceived } from '../actions'
import type {
  PurchaseStatus,
  PurchaseOrderItemRow,
  LotRow,
} from '@/lib/purchases-types'

type Props = {
  orderId: string
  status: PurchaseStatus
  items: PurchaseOrderItemRow[]
  // Map keyed by line id (purchase_order_item.id) -> lots created for that line.
  lotTrail: Map<string, LotRow[]>
}

// Sum already-received qty for a given line from its lot trail.
function alreadyReceivedQty(lineId: string, lotTrail: Map<string, LotRow[]>): number {
  const lots = lotTrail.get(lineId) ?? []
  return lots.reduce((sum, l) => sum + (l.qty_received ?? 0), 0)
}

export function PurchaseActionsBar({ orderId, status, items, lotTrail }: Props) {
  const router = useRouter()

  const [busyAction, setBusyAction] =
    useState<null | 'complete' | 'lost' | 'received'>(null)
  const [completeOpen, setCompleteOpen] = useState(false)
  const [lostOpen, setLostOpen] = useState(false)
  const [receiveOpen, setReceiveOpen] = useState(false)

  // ---- Receive dialog state ----
  // Map keyed by line id -> string typed by user. Defaults to outstanding qty.
  const initialReceipts = useMemo(() => {
    const m = new Map<string, string>()
    for (const ln of items) {
      const already = alreadyReceivedQty(ln.id, lotTrail)
      const outstanding = Math.max(0, ln.qty - already)
      m.set(ln.id, String(outstanding))
    }
    return m
  }, [items, lotTrail])

  const [receipts, setReceipts] = useState<Map<string, string>>(initialReceipts)

  function updateReceipt(lineId: string, raw: string) {
    setReceipts((prev) => {
      const next = new Map(prev)
      next.set(lineId, raw)
      return next
    })
  }

  // Validity: at least one line with qty > 0, none with qty < 0, none NaN.
  const receiveValid = useMemo(() => {
    let anyPositive = false
    for (const ln of items) {
      const raw = receipts.get(ln.id) ?? '0'
      const n = Number(raw)
      if (!Number.isFinite(n)) return false
      if (n < 0) return false
      if (n > 0) anyPositive = true
    }
    return anyPositive
  }, [items, receipts])

  async function handleMarkComplete() {
    setBusyAction('complete')
    const res = await markComplete(orderId)
    if (!res.ok) {
      toast.error(res.error)
      setBusyAction(null)
      return
    }
    toast.success('Order marked complete.')
    setCompleteOpen(false)
    setBusyAction(null)
    router.refresh()
  }

  async function handleMarkLost() {
    setBusyAction('lost')
    const res = await markLost(orderId)
    if (!res.ok) {
      toast.error(res.error)
      setBusyAction(null)
      return
    }
    toast.success('Order marked lost. Cost basis recomputed on surviving lots.')
    setLostOpen(false)
    setBusyAction(null)
    router.refresh()
  }

  async function handleMarkReceived() {
    if (!receiveValid) return
    setBusyAction('received')
    const payload = items.map((ln) => ({
      lineId: ln.id,
      receivedQty: Number(receipts.get(ln.id) ?? '0'),
    }))
    const res = await markReceived({ orderId, receipts: payload })
    if (!res.ok) {
      toast.error(res.error)
      setBusyAction(null)
      return
    }
    toast.success('Receipts recorded. Inventory lots created.')
    setReceiveOpen(false)
    setBusyAction(null)
    router.refresh()
  }

  // Visibility rules by status:
  //   pending        - no buttons in 14b.4.a (markPaidSupplier/cancel come later)
  //   paid_supplier  - receive
  //   received       - receive (partial), complete, lost
  //   complete/lost  - none
  const canReceive  = status === 'paid_supplier' || status === 'received'
  const canComplete = status === 'received'
  const canLost     = status === 'received'

  if (!canReceive && !canComplete && !canLost) return null

  return (
    <div className="flex flex-wrap gap-2">
      {/* Mark received */}
      {canReceive && (
        <AlertDialog open={receiveOpen} onOpenChange={setReceiveOpen}>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="default" size="sm">
              <Truck className="mr-1.5 h-4 w-4" />
              Receive
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="max-w-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Record receipts</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-sm">
                  <div>
                    Enter the quantity received for each line. The defaults are
                    the outstanding amounts (ordered - already received).
                  </div>
                  <div className="text-muted-foreground">
                    Re-entrant: receive partials now and the rest later. Each
                    receipt creates inventory lots at the line&apos;s landed cost.
                  </div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-2 font-medium">Product</th>
                    <th className="w-20 px-2 py-2 text-right font-medium">Ordered</th>
                    <th className="w-20 px-2 py-2 text-right font-medium">Already</th>
                    <th className="w-24 px-2 py-2 font-medium">Receive now</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((ln) => {
                    const already = alreadyReceivedQty(ln.id, lotTrail)
                    return (
                      <tr key={ln.id} className="border-b last:border-b-0">
                        <td className="py-2 pr-2">
                          <div className="font-medium">{ln.product_name}</div>
                          <div className="text-xs text-muted-foreground">{ln.product_sku}</div>
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">{ln.qty}</td>
                        <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{already}</td>
                        <td className="px-2 py-2">
                          <Input
                            type="number"
                            min="0"
                            step="1"
                            value={receipts.get(ln.id) ?? '0'}
                            onChange={(e) => updateReceipt(ln.id, e.target.value)}
                            className="h-8"
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel disabled={busyAction === 'received'}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={!receiveValid || busyAction === 'received'}
                onClick={(e) => {
                  e.preventDefault()
                  void handleMarkReceived()
                }}
              >
                {busyAction === 'received' ? 'Recording...' : 'Record receipts'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Mark complete */}
      {canComplete && (
        <AlertDialog open={completeOpen} onOpenChange={setCompleteOpen}>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="default" size="sm">
              <CheckCircle2 className="mr-1.5 h-4 w-4" />
              Mark complete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Mark this order complete?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-sm">
                  <div>
                    This marks the order finished. Use this after the goods have arrived,
                    been counted, and any transport has been paid.
                  </div>
                  <div className="text-muted-foreground">
                    This is a pure acknowledgment - it does not move money or inventory.
                  </div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busyAction === 'complete'}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={busyAction === 'complete'}
                onClick={(e) => {
                  e.preventDefault()
                  void handleMarkComplete()
                }}
              >
                {busyAction === 'complete' ? 'Working...' : 'Mark complete'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Mark lost */}
      {canLost && (
        <AlertDialog open={lostOpen} onOpenChange={setLostOpen}>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="outline" size="sm">
              <PackageMinus className="mr-1.5 h-4 w-4" />
              Mark lost
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Mark this order as having shipping loss?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-sm">
                  <div>
                    Loss is auto-detected per line as (ordered - received). The cost
                    basis on any surviving unconsumed inventory lots will be recomputed
                    upward to absorb the lost-line cost.
                  </div>
                  <div className="text-muted-foreground">
                    Use this when some of the goods did not arrive. For damage or theft
                    after receipt, use the Inventory module instead (Round 17).
                  </div>
                  <div className="text-muted-foreground">
                    Already-consumed lots keep their original cost (immutable booked
                    sale cogs).
                  </div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busyAction === 'lost'}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={busyAction === 'lost'}
                onClick={(e) => {
                  e.preventDefault()
                  void handleMarkLost()
                }}
              >
                {busyAction === 'lost' ? 'Working...' : 'Mark lost'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  )
}