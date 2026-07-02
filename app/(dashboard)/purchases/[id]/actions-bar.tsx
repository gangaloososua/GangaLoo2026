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
  BadgeCheck,
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
  correctSupplierPayment,
  paySupplierForReceived,
  completePaymentRecord,
  addSupplierPayment,
  waiveSupplierRemainder,
  settleZeroSupplierPurchase,
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
  // round-38c: is a supplier payment already recorded? (drives late-pay button)
  alreadyPaid?: boolean
  // round-38e: half-paid migrated order (has amount+rate but no paid date/account)
  halfPaid?: boolean
  // round-40: any transport allocated? Hides the Edit button for pending orders
  // that already have transport spread, since editing items would invalidate it.
  hasTransport?: boolean
  // round-41a: running totals for the part-payment summary in the Pay dialog.
  usdTotalForPay?: number
  usdCoveredForPay?: number
  // round-75a: latest monthly rates, to auto-fill the EUR / USD payment fields.
  monthlyEurRate?: number | null
  monthlyUsdRate?: number | null
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
  alreadyPaid,
  halfPaid,
  hasTransport,
  usdTotalForPay,
  usdCoveredForPay,
  monthlyEurRate,
  monthlyUsdRate,
}: Props) {
  const router = useRouter()

  const [busyAction, setBusyAction] =
    useState<null | 'complete' | 'lost' | 'received' | 'cancelled' | 'paid' | 'correcting' | 'completingpay' | 'waiving' | 'settlingzero'>(null)
  const [completeOpen, setCompleteOpen] = useState(false)
  const [lostOpen, setLostOpen] = useState(false)
  const [receiveOpen, setReceiveOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [correctOpen, setCorrectOpen] = useState(false)
  const [cprOpen, setCprOpen] = useState(false)
  const [waiveOpen, setWaiveOpen] = useState(false)
  const [settleZeroOpen, setSettleZeroOpen] = useState(false)

  const catBlocks = useMemo(() => buildExpenseBlocks(categories), [categories])

  // round-75a: helper to read the currency of a chosen money account.
  const currencyOf = (accountId: string): string => {
    const a = moneyAccounts.find((m) => m.id === accountId)
    return (a?.currency ?? 'DOP').toUpperCase()
  }

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
  const [payEurRate,  setPayEurRate]    = useState<string>('')   // round-75a: DOP per EUR
  const [payAt,       setPayAt]         = useState<string>(
    toLocalDatetimeInputValue(new Date()),
  )

  // round-75a: is the chosen pay account a EUR account?
  const payIsEur = payAccount.length > 0 && currencyOf(payAccount) === 'EUR'

  // round-75a: when the account changes, auto-fill the rates from the monthly
  // settings so the owner barely types. We only set a field if it is still empty,
  // so we never clobber something already typed.
  function onPayAccountChange(accountId: string) {
    setPayAccount(accountId)
    const cur = currencyOf(accountId)
    if (cur === 'EUR') {
      if (!payEurRate && monthlyEurRate && monthlyEurRate > 0) {
        setPayEurRate(String(monthlyEurRate))
      }
      // for EUR, the USD rate (exchange/official) drives the order coverage
      if (!payExchange && monthlyUsdRate && monthlyUsdRate > 0) {
        setPayExchange(String(monthlyUsdRate))
      }
      if (!payOfficial && monthlyUsdRate && monthlyUsdRate > 0) {
        setPayOfficial(String(monthlyUsdRate))
      }
    } else if (cur === 'USD') {
      if (!payExchange && monthlyUsdRate && monthlyUsdRate > 0) {
        setPayExchange(String(monthlyUsdRate))
      }
      if (!payOfficial && monthlyUsdRate && monthlyUsdRate > 0) {
        setPayOfficial(String(monthlyUsdRate))
      }
    }
  }

  // round-75a: the peso figure that will be sent as dopAmount.
  //   EUR account  -> EUR paid x DOP-per-EUR
  //   DOP / USD     -> the typed number is already the peso total (unchanged)
  const payPesoFigure = payIsEur
    ? Number(payDopTotal) * Number(payEurRate || '0')
    : Number(payDopTotal)

  const payValid =
    Number(payDopTotal) > 0 &&
    Number(payExchange) > 0 &&
    Number(payOfficial) > 0 &&
    payAccount.length > 0 &&
    payCategory.length > 0 &&
    payAt.length > 0 &&
    (!payIsEur || Number(payEurRate) > 0)

  // ---- Correct payment dialog state (Round 24g; round-77a: + EUR) ----
  const [corDopTotal, setCorDopTotal] = useState<string>('')
  const [corExchange, setCorExchange] = useState<string>('')
  const [corOfficial, setCorOfficial] = useState<string>('')
  const [corAccount,  setCorAccount]  = useState<string>('')
  const [corCategory, setCorCategory] = useState<string>('')
  const [corEurRate,  setCorEurRate]  = useState<string>('')   // round-77a: DOP per EUR
  const [corAt,       setCorAt]       = useState<string>(
    toLocalDatetimeInputValue(new Date()),
  )

  // round-77a: is the chosen correct-payment account a EUR account?
  const corIsEur = corAccount.length > 0 && currencyOf(corAccount) === 'EUR'

  // round-77a: auto-fill rates from the monthly settings when the account
  // changes (only fills an empty field, never clobbers). Mirrors the pay dialog.
  function onCorAccountChange(accountId: string) {
    setCorAccount(accountId)
    const cur = currencyOf(accountId)
    if (cur === 'EUR') {
      if (!corEurRate && monthlyEurRate && monthlyEurRate > 0) {
        setCorEurRate(String(monthlyEurRate))
      }
      if (!corExchange && monthlyUsdRate && monthlyUsdRate > 0) {
        setCorExchange(String(monthlyUsdRate))
      }
      if (!corOfficial && monthlyUsdRate && monthlyUsdRate > 0) {
        setCorOfficial(String(monthlyUsdRate))
      }
    } else if (cur === 'USD') {
      if (!corExchange && monthlyUsdRate && monthlyUsdRate > 0) {
        setCorExchange(String(monthlyUsdRate))
      }
      if (!corOfficial && monthlyUsdRate && monthlyUsdRate > 0) {
        setCorOfficial(String(monthlyUsdRate))
      }
    }
  }

  // round-77a: the peso figure sent as dopPaidTotal.
  //   EUR account -> EUR paid x DOP-per-EUR ; DOP / USD -> the typed number unchanged.
  const corPesoFigure = corIsEur
    ? Number(corDopTotal) * Number(corEurRate || '0')
    : Number(corDopTotal)

  const corValid =
    Number(corDopTotal) > 0 &&
    Number(corExchange) > 0 &&
    Number(corOfficial) > 0 &&
    corAccount.length > 0 &&
    corCategory.length > 0 &&
    corAt.length > 0 &&
    (!corIsEur || Number(corEurRate) > 0)

  // ---- Complete payment record dialog state (round-38e) ----
  const [cprAccount, setCprAccount] = useState<string>('')
  const [cprCategory, setCprCategory] = useState<string>('')
  const [cprAt, setCprAt] = useState<string>(toLocalDatetimeInputValue(new Date()))

  const cprValid = cprAccount.length > 0 && cprAt.length > 0

  // Has any stock been received? Correcting a payment is only allowed before
  // the first receipt (the DB function also enforces this).
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
    // round-75a: for a EUR account the peso figure is EUR x DOP-per-EUR; for
    // DOP/USD accounts it is the typed number unchanged. The USD rate
    // (payExchange) is what tells the order how much of its USD total this covers.
    const pesoAmount = payIsEur
      ? Number(payDopTotal) * Number(payEurRate)
      : Number(payDopTotal)
    const payload = {
      orderId,
      dopPaidTotal:          pesoAmount,
      exchangeRate:          Number(payExchange),
      officialRateAtPayment: Number(payOfficial),
      supplierPaymentAccountId: payAccount,
      paidAtDop: new Date(payAt).toISOString(),
      categoryId: payCategory,
    }
    const res = status === 'pending'
      ? await addSupplierPayment({
          orderId,
          dopAmount:                pesoAmount,
          exchangeRate:             Number(payExchange),
          officialRateAtPayment:    Number(payOfficial),
          supplierPaymentAccountId: payAccount,
          paidAt:                   new Date(payAt).toISOString(),
          categoryId:               payCategory,
          eurRate:                  payIsEur ? Number(payEurRate) : undefined,
        })
      : await paySupplierForReceived(payload)
    if (!res.ok) { toast.error(res.error); setBusyAction(null); return }
    toast.success(
      status === 'pending'
        ? 'Payment recorded.'
        : 'Supplier payment recorded. Cost basis allocated across lines.',
    )
    setPayOpen(false); setBusyAction(null); router.refresh()
  }

  async function handleCorrectPayment() {
    if (!corValid) return
    setBusyAction('correcting')
    // round-77a: for a EUR account, send the peso figure (EUR x DOP-per-EUR) as
    // the DOP paid total and pass the DOP-per-EUR rate so the function deducts
    // euros from the account, not pesos. DOP/USD accounts are unchanged.
    const pesoAmount = corIsEur
      ? Number(corDopTotal) * Number(corEurRate)
      : Number(corDopTotal)
    const res = await correctSupplierPayment({
      orderId,
      dopPaidTotal:          pesoAmount,
      exchangeRate:          Number(corExchange),
      officialRateAtPayment: Number(corOfficial),
      supplierPaymentAccountId: corAccount,
      paidAtDop: new Date(corAt).toISOString(),
      categoryId: corCategory,
      eurRate: corIsEur ? Number(corEurRate) : undefined,
    })
    if (!res.ok) { toast.error(res.error); setBusyAction(null); return }
    toast.success('Payment corrected. Ledger and cost basis updated.')
    setCorrectOpen(false); setBusyAction(null); router.refresh()
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

  async function handleWaive() {
    setBusyAction('waiving')
    const res = await waiveSupplierRemainder(orderId)
    if (!res.ok) { toast.error(res.error); setBusyAction(null); return }
    toast.success('Remaining balance waived. Order marked paid.')
    setWaiveOpen(false); setBusyAction(null); router.refresh()
  }

  async function handleSettleZero() {
    setBusyAction('settlingzero')
    const res = await settleZeroSupplierPurchase(orderId)
    if (!res.ok) { toast.error(res.error); setBusyAction(null); return }
    toast.success('Order marked paid. Nothing owed to the supplier. You can now receive it.')
    setSettleZeroOpen(false); setBusyAction(null); router.refresh()
  }

  // ---- Visibility ----
  const canReceive  = status === 'paid_supplier' || status === 'received'
  const canComplete = status === 'received'
  const canLost     = status === 'received'
  const canCancel   = status === 'pending' || status === 'paid_supplier'
  const canPay      = status === 'pending'
  const canPayLate  = (status === 'received' || status === 'complete') && !alreadyPaid && !halfPaid
  const canCompletePay = halfPaid === true
  const canCorrect  = status === 'paid_supplier' && !hasReceipts
  // round-40: full edit available for pending PO with no transport allocated.
  // The "no transport" gate matches the RPC's own guard; the user's transport
  // flow is "at receive time", so pending POs typically don't have it yet.
  const canEdit     = status === 'pending' && !hasTransport
  // round-49a: a partly-paid pending order with a leftover sliver can be waived.
  const usdOpen     = Math.max((usdTotalForPay ?? 0) - (usdCoveredForPay ?? 0), 0)
  const canWaive    = status === 'pending' && (usdCoveredForPay ?? 0) > 0 && usdOpen > 0
  // Free order: pending with a zero USD total and nothing paid. Advance it to
  // paid_supplier with no payment (there is nothing to pay); transport still
  // lands as inventory cost at receive time.
  const canSettleZero = status === 'pending' && (usdTotalForPay ?? 0) === 0 && (usdCoveredForPay ?? 0) === 0

  return (
    <div className="flex flex-wrap gap-2">
      {/* Add transport (link to courier payments new with prefill) */}
      <Button asChild variant="outline">
        <Link href={`/courier-payments/new?prefill_po=${orderId}`}>
          <Truck className="mr-1 h-4 w-4" />
          Add transport
        </Link>
      </Button>

      {/* Edit order (round-40) - pending orders, no transport */}
      {canEdit && (
        <Button asChild variant="outline" size="sm">
          <Link href={`/purchases/${orderId}/edit`}>
            <Pencil className="mr-1.5 h-4 w-4" />
            Edit order
          </Link>
        </Button>
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
                    Record what you paid the supplier this time. You can pay in
                    parts &mdash; enter just this payment now and the rest later,
                    from the same or a different account.
                  </div>
                  {status === 'pending' && usdTotalForPay != null && (
                    <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs tabular-nums text-foreground">
                      Order total ${usdTotalForPay.toFixed(2)} &middot; Already paid $
                      {(usdCoveredForPay ?? 0).toFixed(2)} &middot; Still open $
                      {Math.max(usdTotalForPay - (usdCoveredForPay ?? 0), 0).toFixed(2)}
                    </div>
                  )}
                  <div className="text-muted-foreground">
                    When your payments cover the order total it flips to{' '}
                    <span className="font-medium">Paid supplier</span> on its own.
                    From there you can record receipts.
                  </div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pay-dop-total">
                  {payIsEur ? 'EUR paid' : 'DOP paid total'}
                </Label>
                <Input
                  id="pay-dop-total"
                  type="number"
                  min="0"
                  step="0.01"
                  value={payDopTotal}
                  onChange={(e) => setPayDopTotal(e.target.value)}
                  placeholder="0.00"
                />
                {payIsEur && (
                  <p className="text-xs text-muted-foreground">
                    The euros that left this account for this payment.
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pay-account">From account</Label>
                <Select value={payAccount} onValueChange={onPayAccountChange}>
                  <SelectTrigger id="pay-account">
                    <SelectValue placeholder="Pick an account..." />
                  </SelectTrigger>
                  <SelectContent>
                    {moneyAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                        {a.currency && a.currency.toUpperCase() !== 'DOP'
                          ? ` (${a.currency.toUpperCase()})`
                          : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* round-75a: DOP-per-EUR rate, only for EUR accounts */}
              {payIsEur && (
                <div className="space-y-1.5">
                  <Label htmlFor="pay-eur-rate">Rate (DOP per EUR)</Label>
                  <Input
                    id="pay-eur-rate"
                    type="number"
                    min="0"
                    step="0.0001"
                    value={payEurRate}
                    onChange={(e) => setPayEurRate(e.target.value)}
                    placeholder="0.0000"
                  />
                  <p className="text-xs text-muted-foreground">
                    How many pesos one euro is worth (this month&apos;s rate, editable).
                  </p>
                </div>
              )}

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
                  {payIsEur
                    ? 'Used to work out how much of the USD order this payment covers.'
                    : 'The negotiated rate you paid at.'}
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

              {/* round-75a: live preview of what gets recorded for a EUR payment */}
              {payIsEur && Number(payDopTotal) > 0 && Number(payEurRate) > 0 && (
                <div className="md:col-span-2 rounded-md border bg-muted/30 px-3 py-2 text-xs tabular-nums text-foreground">
                  Leaves this account: &euro;{Number(payDopTotal).toFixed(2)}
                  {' '}&middot; Peso cost: RD${payPesoFigure.toFixed(2)}
                  {Number(payExchange) > 0 && (
                    <>
                      {' '}&middot; Covers ${ (payPesoFigure / Number(payExchange)).toFixed(2) } of the order
                    </>
                  )}
                </div>
              )}

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

      {/* Settle zero-cost order - free purchase, nothing owed to supplier */}
      {canSettleZero && (
        <AlertDialog open={settleZeroOpen} onOpenChange={setSettleZeroOpen}>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="default" size="sm">
              <BadgeCheck className="mr-1.5 h-4 w-4" />
              Mark as paid (nothing owed)
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="max-w-xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Mark this order as paid?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-sm">
                  <div>
                    This order costs nothing (USD total is 0.00), so there is no
                    supplier payment to record. This moves it straight to{' '}
                    <span className="font-medium">Paid supplier</span> so you can
                    receive the goods.
                  </div>
                  <div className="text-muted-foreground">
                    No money moves and nothing is posted to your accounts. Any
                    transport you allocated still becomes the item cost when you
                    receive it.
                  </div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busyAction === 'settlingzero'}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={busyAction === 'settlingzero'}
                onClick={(e) => { e.preventDefault(); void handleSettleZero() }}
              >
                {busyAction === 'settlingzero' ? 'Working...' : 'Mark as paid'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Waive remaining (round-49a) - pending orders with an open sliver */}
      {canWaive && (
        <AlertDialog open={waiveOpen} onOpenChange={setWaiveOpen}>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="outline" size="sm">
              <BadgeCheck className="mr-1.5 h-4 w-4" />
              Waive remaining
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="max-w-xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Waive the remaining ${usdOpen.toFixed(2)}?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-sm">
                  <div>
                    This forgives the ${usdOpen.toFixed(2)} still open and marks the
                    order <span className="font-medium">Paid supplier</span>, using the
                    money you have already paid.
                  </div>
                  <div className="text-muted-foreground">
                    Your recorded payments stay exactly as they are &mdash; no new
                    payment is added and nothing extra is posted to your accounts. Use
                    this for small rounding / exchange-rate gaps.
                  </div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busyAction === 'waiving'}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={busyAction === 'waiving'}
                onClick={(e) => { e.preventDefault(); void handleWaive() }}
              >
                {busyAction === 'waiving' ? 'Waiving...' : 'Waive & mark paid'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Correct payment (Round 24g; round-77a: + EUR) - paid_supplier, no receipts */}
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
                <Label htmlFor="cor-dop-total">
                  {corIsEur ? 'EUR paid' : 'DOP paid total'}
                </Label>
                <Input
                  id="cor-dop-total"
                  type="number"
                  min="0"
                  step="0.01"
                  value={corDopTotal}
                  onChange={(e) => setCorDopTotal(e.target.value)}
                  placeholder="0.00"
                />
                {corIsEur && (
                  <p className="text-xs text-muted-foreground">
                    The euros that left this account for this payment.
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cor-account">From account</Label>
                <Select value={corAccount} onValueChange={onCorAccountChange}>
                  <SelectTrigger id="cor-account">
                    <SelectValue placeholder="Pick an account..." />
                  </SelectTrigger>
                  <SelectContent>
                    {moneyAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                        {a.currency && a.currency.toUpperCase() !== 'DOP'
                          ? ` (${a.currency.toUpperCase()})`
                          : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* round-77a: DOP-per-EUR rate, only for EUR accounts */}
              {corIsEur && (
                <div className="space-y-1.5">
                  <Label htmlFor="cor-eur-rate">Rate (DOP per EUR)</Label>
                  <Input
                    id="cor-eur-rate"
                    type="number"
                    min="0"
                    step="0.0001"
                    value={corEurRate}
                    onChange={(e) => setCorEurRate(e.target.value)}
                    placeholder="0.0000"
                  />
                  <p className="text-xs text-muted-foreground">
                    How many pesos one euro is worth (this month&apos;s rate, editable).
                  </p>
                </div>
              )}

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
                  {corIsEur
                    ? 'Used to work out how much of the USD order this payment covers.'
                    : 'The negotiated rate you paid at.'}
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

              {/* round-77a: live preview of what gets recorded for a EUR correction */}
              {corIsEur && Number(corDopTotal) > 0 && Number(corEurRate) > 0 && (
                <div className="md:col-span-2 rounded-md border bg-muted/30 px-3 py-2 text-xs tabular-nums text-foreground">
                  Leaves this account: &euro;{Number(corDopTotal).toFixed(2)}
                  {' '}&middot; Peso cost: RD${corPesoFigure.toFixed(2)}
                  {Number(corExchange) > 0 && (
                    <>
                      {' '}&middot; Covers ${ (corPesoFigure / Number(corExchange)).toFixed(2) } of the order
                    </>
                  )}
                </div>
              )}

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
          <AlertDialogContent className="max-w-2xl flex max-h-[85vh] flex-col">
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

            <div className="flex-1 overflow-y-auto overflow-x-auto">
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
