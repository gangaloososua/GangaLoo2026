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
  Pencil,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
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
  correctSupplierPayment,
  editPendingPurchaseCosts,
  paySupplierForReceived,
  completePaymentRecord,
} from '../actions'
import type {
  PurchaseStatus,
  PurchaseOrderItemRow,
  LotTrailEntry,
} from '@/lib/purchases-types'
import type { MoneyAccount } from '@/lib/sales'
import type { AccountCategoryOption } from '@/lib/transactions'

type Props = {
  orderId: string
  status: PurchaseStatus
  items: PurchaseOrderItemRow[]
  lotTrail: Map<string, LotTrailEntry[]>
  moneyAccounts: MoneyAccount[]
  categories: AccountCategoryOption[]
  // round-38a — current USD costs, used to pre-fill the Edit costs dialog.
  usdShipping?: number
  usdTax?: number
  usdDiscount?: number
  // round-38c: is a supplier payment already recorded? (drives late-pay button)
  alreadyPaid?: boolean
  // round-38e: half-paid migrated order (has amount+rate but no paid date/account)
  halfPaid?: boolean
}

function alreadyReceivedQty(lineId: string, lotTrail: Map<string, LotTrailEntry[]>): number {
  const lots = lotTrail.get(lineId) ?? []
  return lots.reduce((sum, l) => sum + (l.lot.qty_received ?? 0), 0)
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

// Group expense categories: parent-with-children -> heading + items; childless
// top-levels collected under "Other expense". Parents with children are
// headings only (not selectable). Mirrors the courier-payment form.
type CatBlock = { key: string; heading: string; items: AccountCategoryOption[] }
function buildExpenseBlocks(categories: AccountCategoryOption[]): CatBlock[] {
  const childrenOf = new Map<string, AccountCategoryOption[]>()
  for (const c of categories) {
    if (c.parentId) {
      const list = childrenOf.get(c.parentId) ?? []
      list.push(c)
      childrenOf.set(c.parentId, list)
    }
  }
  const tops = categories.filter((c) => c.parentId === null)
  const blocks: CatBlock[] = []
  const standalone: AccountCategoryOption[] = []
  for (const top of tops) {
    const kids = childrenOf.get(top.id)
    if (kids && kids.length > 0) blocks.push({ key: top.id, heading: top.name, items: kids })
    else standalone.push(top)
  }
  if (standalone.length > 0) blocks.push({ key: 'general', heading: 'Other expense', items: standalone })
  return blocks
}

export function PurchaseActionsBar({
  orderId,
  status,
  items,
  lotTrail,
  moneyAccounts,
  categories,
  usdShipping,
  usdTax,
  usdDiscount,
  alreadyPaid,
  halfPaid,
}: Props) {
  const router = useRouter()

  const [busyAction, setBusyAction] =
    useState<null | 'complete' | 'lost' | 'received' | 'cancelled' | 'paid' | 'correcting' | 'editing' | 'completingpay'>(null)
  const [completeOpen, setCompleteOpen] = useState(false)
  const [lostOpen, setLostOpen] = useState(false)
  const [receiveOpen, setReceiveOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [correctOpen, setCorrectOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [cprOpen, setCprOpen] = useState(false)

  const catBlocks = useMemo(() => buildExpenseBlocks(categories), [categories])

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
  const [payCategory, setPayCategory]   = useState<string>('')
  const [payAt,       setPayAt]         = useState<string>(
    toLocalDatetimeInputValue(new Date()),
  )

  const payValid =
    Number(payDopTotal) > 0 &&
    Number(payExchange) > 0 &&
    Number(payOfficial) > 0 &&
    payAccount.length > 0 &&
    payCategory.length > 0 &&
    payAt.length > 0

  // ---- Correct payment dialog state (Round 24g) ----
  // Starts blank; the current values are visible in the order's Money card.
  const [corDopTotal, setCorDopTotal] = useState<string>('')
  const [corExchange, setCorExchange] = useState<string>('')
  const [corOfficial, setCorOfficial] = useState<string>('')
  const [corAccount,  setCorAccount]  = useState<string>('')
  const [corCategory, setCorCategory] = useState<string>('')
  const [corAt,       setCorAt]       = useState<string>(
    toLocalDatetimeInputValue(new Date()),
  )

  const corValid =
    Number(corDopTotal) > 0 &&
    Number(corExchange) > 0 &&
    Number(corOfficial) > 0 &&
    corAccount.length > 0 &&
    corCategory.length > 0 &&
    corAt.length > 0

  // ---- Edit costs dialog state (round-38a) ----
  // Pre-fills with the order's current shipping/tax/discount so the user can
  // see and adjust. Pending-only.
  const [editShipping, setEditShipping] = useState<string>(String(usdShipping ?? 0))
  const [editTax,      setEditTax]      = useState<string>(String(usdTax ?? 0))
  const [editDiscount, setEditDiscount] = useState<string>(String(usdDiscount ?? 0))

  // ---- Complete payment record dialog state (round-38e) ----
  const [cprAccount, setCprAccount] = useState<string>('')
  const [cprCategory, setCprCategory] = useState<string>('')
  const [cprAt, setCprAt] = useState<string>(toLocalDatetimeInputValue(new Date()))

  const cprValid = cprAccount.length > 0 && cprAt.length > 0

  const editValid =
    Number(editShipping) >= 0 &&
    Number(editTax) >= 0 &&
    Number(editDiscount) >= 0 &&
    Number.isFinite(Number(editShipping)) &&
    Number.isFinite(Number(editTax)) &&
    Number.isFinite(Number(editDiscount))

  // Has any stock been received for this order? Correcting a payment is only
  // allowed before the first receipt (the DB function also enforces this).
  const hasReceipts = useMemo(
    () => items.some((ln) => alreadyReceivedQty(ln.id, lotTrail) > 0),
    [items, lotTrail],
  )

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
    const payload = {
      orderId,
      dopPaidTotal:          Number(payDopTotal),
      exchangeRate:          Number(payExchange),
      officialRateAtPayment: Number(payOfficial),
      supplierPaymentAccountId: payAccount,
      paidAtDop: new Date(payAt).toISOString(),
      categoryId: payCategory,
    }
    // round-38c: pending uses the normal flow (flips to paid_supplier); a
    // received/complete order records the payment WITHOUT regressing status.
    const res = status === 'pending'
      ? await markPaidSupplier(payload)
      : await paySupplierForReceived(payload)
    if (!res.ok) { toast.error(res.error); setBusyAction(null); return }
    toast.success('Supplier payment recorded. Cost basis allocated across lines.')
    setPayOpen(false); setBusyAction(null); router.refresh()
  }

  async function handleCorrectPayment() {
    if (!corValid) return
    setBusyAction('correcting')
    const res = await correctSupplierPayment({
      orderId,
      dopPaidTotal:          Number(corDopTotal),
      exchangeRate:          Number(corExchange),
      officialRateAtPayment: Number(corOfficial),
      supplierPaymentAccountId: corAccount,
      paidAtDop: new Date(corAt).toISOString(),
      categoryId: corCategory,
    })
    if (!res.ok) { toast.error(res.error); setBusyAction(null); return }
    toast.success('Payment corrected. Ledger and cost basis updated.')
    setCorrectOpen(false); setBusyAction(null); router.refresh()
  }

  async function handleEditCosts() {
    if (!editValid) return
    setBusyAction('editing')
    const res = await editPendingPurchaseCosts({
      orderId,
      usdShipping: Number(editShipping),
      usdTax:      Number(editTax),
      usdDiscount: Number(editDiscount),
    })
    if (!res.ok) { toast.error(res.error); setBusyAction(null); return }
    toast.success('Costs updated. Order total recalculated.')
    setEditOpen(false); setBusyAction(null); router.refresh()
  }

  async function handleCompletePayment() {
    if (!cprValid) return
    setBusyAction('completingpay')
    const res = await completePaymentRecord({
      orderId,
      supplierPaymentAccountId: cprAccount,
      paidAtDop: new Date(cprAt).toISOString(),
      categoryId: cprCategory || null,
    })
    if (!res.ok) { toast.error(res.error); setBusyAction(null); return }
    toast.success('Payment record completed.')
    setCprOpen(false); setBusyAction(null); router.refresh()
  }

  // ---- Visibility ----
  const canReceive  = status === 'paid_supplier' || status === 'received'
  const canComplete = status === 'received'
  const canLost     = status === 'received'
  const canCancel   = status === 'pending' || status === 'paid_supplier'
  const canPay      = status === 'pending'
  // round-38c: completed/received orders that were never paid can record payment too.
  // Truly-unpaid received/complete orders (no amount at all). Half-paid orders
  // (amount but no date) use Complete payment instead.
  const canPayLate  = (status === 'received' || status === 'complete') && !alreadyPaid && !halfPaid
  // round-38e: half-paid order just needs its date+account completed.
  const canCompletePay = halfPaid === true
  const canCorrect  = status === 'paid_supplier' && !hasReceipts
  const canEdit     = status === 'pending'

  // Add transport is always shown, so the bar always renders.
  return (
    <div className="flex flex-wrap gap-2">
      {/* Add transport (link to courier payments new with prefill) */}
      <Button asChild variant="outline">
        <Link href={`/courier-payments/new?prefill_po=${orderId}`}>
          <Truck className="mr-1 h-4 w-4" />
          Add transport
        </Link>
      </Button>

      {/* Edit costs (round-38a) - pending orders only */}
      {canEdit && (
        <AlertDialog open={editOpen} onOpenChange={setEditOpen}>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="outline" size="sm">
              <Pencil className="mr-1.5 h-4 w-4" />
              Edit costs
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="max-w-xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Edit shipping, tax &amp; discount</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-sm">
                  <div>
                    Adjust the USD shipping, tax and discount for this order. The
                    USD total recalculates automatically
                    (subtotal + shipping + tax &minus; discount).
                  </div>
                  <div className="text-muted-foreground">
                    Available only while the order is pending (before it is paid
                    or received).
                  </div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-shipping">Shipping (USD)</Label>
                <Input
                  id="edit-shipping"
                  type="number"
                  min="0"
                  step="0.01"
                  value={editShipping}
                  onChange={(e) => setEditShipping(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-tax">Tax (USD)</Label>
                <Input
                  id="edit-tax"
                  type="number"
                  min="0"
                  step="0.01"
                  value={editTax}
                  onChange={(e) => setEditTax(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-discount">Discount (USD)</Label>
                <Input
                  id="edit-discount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={editDiscount}
                  onChange={(e) => setEditDiscount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel disabled={busyAction === 'editing'}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={!editValid || busyAction === 'editing'}
                onClick={(e) => { e.preventDefault(); void handleEditCosts() }}
              >
                {busyAction === 'editing' ? 'Saving...' : 'Save costs'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Complete payment record (round-38e) - half-paid migrated orders */}
      {canCompletePay && (
        <AlertDialog open={cprOpen} onOpenChange={setCprOpen}>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="default" size="sm">
              <Banknote className="mr-1.5 h-4 w-4" />
              Complete payment
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="max-w-xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Complete the payment record</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-sm">
                  <div>
                    This order already has a recorded amount and exchange rate, but
                    is missing the account it was paid from and the payment date.
                    Fill those in to mark it as paid.
                  </div>
                  <div className="text-muted-foreground">
                    This does not change the amount or recompute item costs &mdash; it
                    only completes the record.
                  </div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cpr-account">From account</Label>
                <Select value={cprAccount} onValueChange={setCprAccount}>
                  <SelectTrigger id="cpr-account">
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
                <Label htmlFor="cpr-at">Paid at</Label>
                <Input
                  id="cpr-at"
                  type="datetime-local"
                  value={cprAt}
                  onChange={(e) => setCprAt(e.target.value)}
                />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="cpr-category">Expense category (optional)</Label>
                <Select value={cprCategory} onValueChange={setCprCategory}>
                  <SelectTrigger id="cpr-category">
                    <SelectValue placeholder="Leave blank to skip ledger post..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {catBlocks.map((b) => (
                      <SelectGroup key={b.key}>
                        <SelectLabel>{b.heading}</SelectLabel>
                        {b.items.map((c) => (
                          <SelectItem key={c.id} value={c.id} className="pl-6">
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Optional. Only set this if you also want a ledger entry posted.
                </p>
              </div>
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel disabled={busyAction === 'completingpay'}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={!cprValid || busyAction === 'completingpay'}
                onClick={(e) => { e.preventDefault(); void handleCompletePayment() }}
              >
                {busyAction === 'completingpay' ? 'Saving...' : 'Mark as paid'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Pay supplier (round-38c: also for received/complete unpaid orders) */}
      {(canPay || canPayLate) && (
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
                <Label htmlFor="pay-category">Expense category</Label>
                <Select value={payCategory} onValueChange={setPayCategory}>
                  <SelectTrigger id="pay-category">
                    <SelectValue placeholder="Pick a category..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {catBlocks.map((b) => (
                      <SelectGroup key={b.key}>
                        <SelectLabel>{b.heading}</SelectLabel>
                        {b.items.map((c) => (
                          <SelectItem key={c.id} value={c.id} className="pl-6">
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Which expense bucket this purchase posts to in the ledger.
                </p>
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

      {/* Correct payment (Round 24g) - paid_supplier orders with no receipts */}
      {canCorrect && (
        <AlertDialog open={correctOpen} onOpenChange={setCorrectOpen}>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="outline" size="sm">
              <Banknote className="mr-1.5 h-4 w-4" />
              Correct payment
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="max-w-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Correct supplier payment</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-sm">
                  <div>
                    Fix a mistaken payment. This reverses the original ledger
                    entry and re-records it with the corrected figures,
                    re-allocating the landed cost across the order&apos;s lines.
                  </div>
                  <div className="text-muted-foreground">
                    The current values are shown in the Money panel above. Only
                    available before any stock has been received.
                  </div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cor-dop-total">DOP paid total</Label>
                <Input
                  id="cor-dop-total"
                  type="number"
                  min="0"
                  step="0.01"
                  value={corDopTotal}
                  onChange={(e) => setCorDopTotal(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cor-account">From account</Label>
                <Select value={corAccount} onValueChange={setCorAccount}>
                  <SelectTrigger id="cor-account">
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
                <Label htmlFor="cor-category">Expense category</Label>
                <Select value={corCategory} onValueChange={setCorCategory}>
                  <SelectTrigger id="cor-category">
                    <SelectValue placeholder="Pick a category..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {catBlocks.map((b) => (
                      <SelectGroup key={b.key}>
                        <SelectLabel>{b.heading}</SelectLabel>
                        {b.items.map((c) => (
                          <SelectItem key={c.id} value={c.id} className="pl-6">
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Which expense bucket this purchase posts to in the ledger.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cor-exchange">Exchange rate (DOP per USD)</Label>
                <Input
                  id="cor-exchange"
                  type="number"
                  min="0"
                  step="0.0001"
                  value={corExchange}
                  onChange={(e) => setCorExchange(e.target.value)}
                  placeholder="0.0000"
                />
                <p className="text-xs text-muted-foreground">
                  The negotiated rate you paid at.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cor-official">Official rate (DOP per USD)</Label>
                <Input
                  id="cor-official"
                  type="number"
                  min="0"
                  step="0.0001"
                  value={corOfficial}
                  onChange={(e) => setCorOfficial(e.target.value)}
                  placeholder="0.0000"
                />
                <p className="text-xs text-muted-foreground">
                  Market reference at payment time. Used to book the bank fee.
                </p>
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="cor-at">Paid at</Label>
                <Input
                  id="cor-at"
                  type="datetime-local"
                  value={corAt}
                  onChange={(e) => setCorAt(e.target.value)}
                />
              </div>
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel disabled={busyAction === 'correcting'}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={!corValid || busyAction === 'correcting'}
                onClick={(e) => { e.preventDefault(); void handleCorrectPayment() }}
              >
                {busyAction === 'correcting' ? 'Correcting...' : 'Save correction'}
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
