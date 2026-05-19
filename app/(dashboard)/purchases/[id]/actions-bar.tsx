'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  CheckCircle2,
  PackageMinus,
  Truck,
  XCircle,
  Banknote,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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

import {
  markComplete,
  markLost,
  markReceived,
  markCancelled,
  markPaidSupplier,
} from '../actions'
import type {
  PurchaseStatus,
  PurchaseOrderItemRow,
  LotRow,
} from '@/lib/purchases-types'
import type { MoneyAccount } from '@/lib/sales'

type Props = {
  orderId: string
  status: PurchaseStatus
  items: PurchaseOrderItemRow[]
  lotTrail: Map<string, LotRow[]>
  moneyAccounts: MoneyAccount[]
}

function alreadyReceivedQty(lineId: string, lotTrail: Map<string, LotRow[]>): number {
  const lots = lotTrail.get(lineId) ?? []
  return lots.reduce((sum, l) => sum + (l.qty_received ?? 0), 0)
}

function toLocalDatetimeInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    d.getFullYear() +
    '-' + pad(d.getMonth() + 1) +
    '-' + pad(d.getDate()) +
    'T' + pad(d.getHours()) +
    ':' + pad(d.getMinutes())
  )
}

export function PurchaseActionsBar({
  orderId,
  status,
  items,
  lotTrail,
  moneyAccounts,
}: Props) {
  const router = useRouter()

  const [busyAction, setBusyAction] =
    useState<null | 'complete' | 'lost' | 'received' | 'cancelled' | 'paid'>(null)
  const [completeOpen, setCompleteOpen] = useState(false)
  const [lostOpen, setLostOpen] = useState(false)
  const [receiveOpen, setReceiveOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)

  // ---- Receive dialog state ----
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

  // ---- Cancel dialog state ----
  const wasPaid = status === 'paid_supplier'
  const [refundOn, setRefundOn] = useState<boolean>(false)
  const [refundAmount, setRefundAmount] = useState<string>('')
  const [refundAccount, setRefundAccount] = useState<string>('')
  const [refundAt, setRefundAt] = useState<string>(
    toLocalDatetimeInputValue(new Date()),
  )

  const cancelValid =
    !refundOn ||
    (
      Number(refundAmount) > 0 &&
      refundAccount.length > 0 &&
      refundAt.length > 0
    )

  // ---- Pay supplier dialog state ----
  const [payDopTotal, setPayDopTotal]   = useState<string>('')
  const [payExchange, setPayExchange]   = useState<string>('')
  const [payOfficial, setPayOfficial]   = useState<string>('')
  const [payAccount,  setPayAccount]    = useState<string>('')
  const [payAt,       setPayAt]         = useState<string>(
    toLocalDatetimeInputValue(new Date()),
  )

  const payValid =
    Number(payDopTotal) > 0 &&
    Number(payExchange) > 0 &&
    Number(payOfficial) > 0 &&
    payAccount.length > 0 &&
    payAt.length > 0

  // ---- Handlers ----
  async function handleMarkComplete() {
    setBusyAction('complete')
    const res = await markComplete(orderId)
    if (!res.ok) { toast.error(res.error); setBusyAction(null); return }
    toast.success('Order marked complete.')
    setCompleteOpen(false); setBusyAction(null); router.refresh()
  }

  async function handleMarkLost() {
    setBusyAction('lost')
    const res = await markLost(orderId)
    if (!res.ok) { toast.error(res.error); setBusyAction(null); return }
    toast.success('Order marked lost. Cost basis recomputed on surviving lots.')
    setLostOpen(false); setBusyAction(null); router.refresh()
  }

  async function handleMarkReceived() {
    if (!receiveValid) return
    setBusyAction('received')
    const payload = items.map((ln) => ({
      lineId: ln.id,
      receivedQty: Number(receipts.get(ln.id) ?? '0'),
    }))
    const res = await markReceived({ orderId, receipts: payload })
    if (!res.ok) { toast.error(res.error); setBusyAction(null); return }
    toast.success('Receipts recorded. Inventory lots created.')
    setReceiveOpen(false); setBusyAction(null); router.refresh()
  }

  async function handleMarkCancelled() {
    if (!cancelValid) return
    setBusyAction('cancelled')
    const refund = refundOn
      ? {
          dopRefundTotal: Number(refundAmount),
          refundAtDop: new Date(refundAt).toISOString(),
          refundAccountId: refundAccount,
        }
      : undefined
    const res = await markCancelled({ orderId, refund })
    if (!res.ok) { toast.error(res.error); setBusyAction(null); return }
    toast.success(refund ? 'Order cancelled and refund recorded.' : 'Order cancelled.')
    setCancelOpen(false); setBusyAction(null); router.refresh()
  }

  async function handleMarkPaidSupplier() {
    if (!payValid) return
    setBusyAction('paid')
    const res = await markPaidSupplier({
      orderId,
      dopPaidTotal:          Number(payDopTotal),
      exchangeRate:          Number(payExchange),
      officialRateAtPayment: Number(payOfficial),
      supplierPaymentAccountId: payAccount,
      paidAtDop: new Date(payAt).toISOString(),
    })
    if (!res.ok) { toast.error(res.error); setBusyAction(null); return }
    toast.success('Supplier marked paid. Cost basis allocated across lines.')
    setPayOpen(false); setBusyAction(null); router.refresh()
  }

  // ---- Visibility ----
  const canReceive  = status === 'paid_supplier' || status === 'received'
  const canComplete = status === 'received'
  const canLost     = status === 'received'
  const canCancel   = status === 'pending' || status === 'paid_supplier'
  const canPay      = status === 'pending'

  if (!canReceive && !canComplete && !canLost && !canCancel && !canPay) return null

  return (
    <div className="flex flex-wrap gap-2">
      {/* Add transport (link to courier payments new with prefill) */}
      <Button asChild variant="outline">
        <Link href={`/courier-payments/new?prefill_po=${orderId}`}>
          <Truck className="mr-1 h-4 w-4" />
          Add transport
        </Link>
      </Button>
      {/* Pay supplier */}
      {canPay && (
        <AlertDialog open={payOpen} onOpenChange={setPayOpen}>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="default" size="sm">
              <Banknote className="mr-1.5 h-4 w-4" />
              Pay supplier
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="max-w-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Record supplier payment</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-sm">
                  <div>
                    Record the DOP you paid the supplier. This will allocate the
                    payment across the order&apos;s lines and compute the bank fee
                    (the spread between your negotiated and the official exchange rates).
                  </div>
                  <div className="text-muted-foreground">
                    Status flips to <span className="font-medium">Paid supplier</span>.
                    From there you can record receipts.
                  </div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pay-dop-total">DOP paid total</Label>
                <Input
                  id="pay-dop-total"
                  type="number"
                  min="0"
                  step="0.01"
                  value={payDopTotal}
                  onChange={(e) => setPayDopTotal(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pay-account">From account</Label>
                <Select value={payAccount} onValueChange={setPayAccount}>
                  <SelectTrigger id="pay-account">
                    <SelectValue placeholder="Pick an account..." />
                  </SelectTrigger>
                  <SelectContent>
                    {moneyAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pay-exchange">Exchange rate (DOP per USD)</Label>
                <Input
                  id="pay-exchange"
                  type="number"
                  min="0"
                  step="0.0001"
                  value={payExchange}
                  onChange={(e) => setPayExchange(e.target.value)}
                  placeholder="0.0000"
                />
                <p className="text-xs text-muted-foreground">
                  The negotiated rate you paid at.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pay-official">Official rate (DOP per USD)</Label>
                <Input
                  id="pay-official"
                  type="number"
                  min="0"
                  step="0.0001"
                  value={payOfficial}
                  onChange={(e) => setPayOfficial(e.target.value)}
                  placeholder="0.0000"
                />
                <p className="text-xs text-muted-foreground">
                  Market reference at payment time. Used to book the bank fee.
                </p>
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="pay-at">Paid at</Label>
                <Input
                  id="pay-at"
                  type="datetime-local"
                  value={payAt}
                  onChange={(e) => setPayAt(e.target.value)}
                />
              </div>
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel disabled={busyAction === 'paid'}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={!payValid || busyAction === 'paid'}
                onClick={(e) => { e.preventDefault(); void handleMarkPaidSupplier() }}
              >
                {busyAction === 'paid' ? 'Recording...' : 'Record payment'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

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
                onClick={(e) => { e.preventDefault(); void handleMarkReceived() }}
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
                onClick={(e) => { e.preventDefault(); void handleMarkComplete() }}
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
                onClick={(e) => { e.preventDefault(); void handleMarkLost() }}
              >
                {busyAction === 'lost' ? 'Working...' : 'Mark lost'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Cancel order */}
      {canCancel && (
        <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="outline" size="sm">
              <XCircle className="mr-1.5 h-4 w-4" />
              Cancel order
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="max-w-xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Cancel this order?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-sm">
                  <div>
                    {wasPaid
                      ? 'This order has already been paid. If you got money back from the supplier, tick the box below to record the refund.'
                      : 'This order has not been paid yet, so there is nothing to refund.'}
                  </div>
                  <div className="text-muted-foreground">
                    Cancellation is terminal. You cannot reopen a cancelled order.
                  </div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>

            {wasPaid && (
              <div className="space-y-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={refundOn}
                    onChange={(e) => setRefundOn(e.target.checked)}
                  />
                  Record a refund
                </label>

                {refundOn && (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="refund-amount">DOP refund total</Label>
                      <Input
                        id="refund-amount"
                        type="number"
                        min="0"
                        step="0.01"
                        value={refundAmount}
                        onChange={(e) => setRefundAmount(e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="refund-account">To account</Label>
                      <Select value={refundAccount} onValueChange={setRefundAccount}>
                        <SelectTrigger id="refund-account">
                          <SelectValue placeholder="Pick an account..." />
                        </SelectTrigger>
                        <SelectContent>
                          {moneyAccounts.map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                      <Label htmlFor="refund-at">Refunded at</Label>
                      <Input
                        id="refund-at"
                        type="datetime-local"
                        value={refundAt}
                        onChange={(e) => setRefundAt(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            <AlertDialogFooter>
              <AlertDialogCancel disabled={busyAction === 'cancelled'}>Keep order</AlertDialogCancel>
              <AlertDialogAction
                disabled={!cancelValid || busyAction === 'cancelled'}
                onClick={(e) => { e.preventDefault(); void handleMarkCancelled() }}
                className="bg-red-600 hover:bg-red-700"
              >
                {busyAction === 'cancelled' ? 'Working...' : 'Cancel order'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  )
}