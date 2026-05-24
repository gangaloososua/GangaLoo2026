'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import Link from 'next/link'
import { ChevronDown, ChevronRight, MoreVertical, XCircle, RotateCcw, Plus, Banknote, CreditCard, ArrowRightLeft, Wallet, Printer, Pencil, MessageCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cancelSale, refundSale, recordPayment, logCashCollected } from '../actions'
import { buildInvoiceWhatsAppLink } from '@/lib/whatsapp'
import { isOwnerEquivalent, type Role } from '@/lib/auth/roles'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatDOP, formatDateTime } from '@/lib/format'
import { type Locale, localeForRole, t, plural } from '@/lib/i18n/dictionary'
import type {
  SaleDetail as SaleDetailType,
  SaleStatus,
  SaleDetailItem,
  MoneyAccount,
} from '@/lib/sales'

const STATUS_VARIANT: Record<SaleStatus, string> = {
  draft: 'bg-slate-100 text-slate-700',
  confirmed: 'bg-blue-100 text-blue-800',
  paid: 'bg-emerald-100 text-emerald-800',
  partially_paid: 'bg-amber-100 text-amber-900',
  refunded: 'bg-purple-100 text-purple-800',
  cancelled: 'bg-rose-100 text-rose-800',
}

// Status -> dictionary key (label resolved via t() at render time).
const STATUS_KEY: Record<SaleStatus, string> = {
  draft: 'status.draft',
  confirmed: 'status.confirmed',
  paid: 'status.paid',
  partially_paid: 'status.partiallyPaid',
  refunded: 'status.refunded',
  cancelled: 'status.cancelled',
}

// Fulfilment method -> dictionary key.
const FULFILLMENT_KEY: Record<string, string> = {
  in_store: 'fulfill.in_store',
  pickup: 'fulfill.pickup',
  delivery: 'fulfill.delivery',
}

export function SaleDetail({
  sale,
  moneyAccounts,
  role,
}: {
  sale: SaleDetailType
  moneyAccounts: MoneyAccount[]
  role: Role
}) {
  const locale = localeForRole(role)
  return (
    <div className="space-y-4">
      <HeaderCard sale={sale} role={role} locale={locale} />
      <ItemsCard items={sale.items} locale={locale} />
      <SummaryCards sale={sale} moneyAccounts={moneyAccounts} locale={locale} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// HeaderCard — invoice number, status, dates, customer, seller, warehouse
// ---------------------------------------------------------------------------

function HeaderCard({ sale, role, locale }: { sale: SaleDetailType; role: Role; locale: Locale }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')

  const [refundOpen, setRefundOpen] = useState(false)
  const [refundReason, setRefundReason] = useState('')
  const [refundRestock, setRefundRestock] = useState(true)

  const [logCashOpen, setLogCashOpen] = useState(false)

  const canCancel =
    sale.status === 'draft' ||
    sale.status === 'confirmed' ||
    sale.status === 'partially_paid'
  const canRefund =
    sale.status === 'confirmed' ||
    sale.status === 'paid' ||
    sale.status === 'partially_paid'
  const canEditProducts = sale.status === 'confirmed' && sale.paid_cents === 0
  const outstandingForCash = sale.total_cents - sale.paid_cents
  const canLogCash =
    outstandingForCash > 0 &&
    (sale.status === 'confirmed' || sale.status === 'partially_paid')
  const hasAnyAction = true // Print receipt is always available
  const waHref = buildInvoiceWhatsAppLink({ phone: sale.customer_phone, customerName: sale.customer_name, invoiceNumber: sale.invoice_number, totalCents: sale.total_cents })

  function doCancel() {
    startTransition(async () => {
      const res = await cancelSale(sale.id, cancelReason)
      if (res.ok) {
        toast.success(t(locale, 'sd.toastSaleCancelled'))
        setCancelOpen(false)
        setCancelReason('')
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  function doRefund() {
    if (!refundReason.trim()) {
      toast.error(t(locale, 'sd.toastRefundReasonRequired'))
      return
    }
    startTransition(async () => {
      const res = await refundSale(sale.id, refundReason, refundRestock)
      if (res.ok) {
        toast.success(
          refundRestock ? t(locale, 'sd.toastRefundedRestock') : t(locale, 'sd.toastRefunded'),
        )
        setRefundOpen(false)
        setRefundReason('')
        setRefundRestock(true)
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-baseline justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <CardTitle className="font-mono text-xl">
                  {sale.invoice_number ?? t(locale, 'sd.draftPlaceholder')}
                </CardTitle>
                <Badge variant="secondary" className={STATUS_VARIANT[sale.status]}>
                  {t(locale, STATUS_KEY[sale.status])}
                </Badge>
                {hasAnyAction && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                        <MoreVertical className="h-4 w-4" />
                        <span className="sr-only">{t(locale, 'sd.actions')}</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem asChild>
                        <Link href={`/sales/${sale.id}/print`} target="_blank" rel="noopener noreferrer">
                          <Printer className="mr-2 h-4 w-4" />
                          {t(locale, 'sd.printReceipt')}
                        </Link>
                      </DropdownMenuItem>
                      {waHref && (
                        <DropdownMenuItem asChild>
                          <a href={waHref} target="_blank" rel="noopener noreferrer">
                            <MessageCircle className="mr-2 h-4 w-4" />
                            {t(locale, 'sd.sendWhatsApp')}
                          </a>
                        </DropdownMenuItem>
                      )}
                      {canLogCash && (
                        <DropdownMenuItem onClick={() => setLogCashOpen(true)}>
                          <Banknote className="mr-2 h-4 w-4" />
                          {t(locale, 'sd.logCashCollected')}
                        </DropdownMenuItem>
                      )}
                      {(canCancel || canRefund) && <DropdownMenuSeparator />}
                      {canEditProducts && (
                        <DropdownMenuItem asChild>
                          <Link href={`/sales/${sale.id}/edit-products`}>
                            <Pencil className="mr-2 h-4 w-4" />
                            {t(locale, 'sd.editProducts')}
                          </Link>
                        </DropdownMenuItem>
                      )}
                      {canCancel && (
                        <DropdownMenuItem onClick={() => setCancelOpen(true)}>
                          <XCircle className="mr-2 h-4 w-4" />
                          {t(locale, 'sd.cancelSale')}
                        </DropdownMenuItem>
                      )}
                      {canRefund && (
                        <DropdownMenuItem
                          onClick={() => setRefundOpen(true)}
                          className="text-rose-700 focus:text-rose-700"
                        >
                          <RotateCcw className="mr-2 h-4 w-4" />
                          {t(locale, 'sd.refundSale')}
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {t(locale, 'sd.sold')} {formatDateTime(sale.sold_at)}
                {sale.confirmed_at && (
                  <> · {t(locale, 'sd.confirmedAt')} {formatDateTime(sale.confirmed_at)}</>
                )}
                {sale.paid_at && <> · {t(locale, 'sd.paidAt')} {formatDateTime(sale.paid_at)}</>}
              </p>
            </div>
            <div className="text-right">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                {t(locale, 'sd.totalLabel')}
              </div>
              <div className="text-2xl font-semibold tabular-nums">
                {formatDOP(sale.total_cents)}
              </div>
              {sale.paid_cents !== sale.total_cents && (
                <div className="text-xs text-muted-foreground tabular-nums">
                  {formatDOP(sale.paid_cents)} {t(locale, 'sd.paidSuffix')}
                </div>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <Field label={t(locale, 'sales.col.customer')} value={sale.customer_name ?? t(locale, 'sales.walkIn')} />
            <Field label={t(locale, 'sales.col.seller')} value={sale.seller_name ?? '—'} />
            <Field
              label={t(locale, 'sd.fulfillment')}
              value={`${sale.fulfillment_warehouse_name} · ${
                t(locale, FULFILLMENT_KEY[sale.fulfillment_method] ?? '') || sale.fulfillment_method
              }`}
            />
            {sale.source_warehouse_name &&
              sale.source_warehouse_id !== sale.fulfillment_warehouse_id && (
                <Field
                  label={t(locale, 'sd.sourceWarehouse')}
                  value={sale.source_warehouse_name}
                />
              )}
            {sale.tracking_number && (
              <Field label={t(locale, 'sd.tracking')} value={sale.tracking_number} />
            )}
            {sale.delivery_notes && (
              <Field label={t(locale, 'sd.deliveryNotes')} value={sale.delivery_notes} />
            )}
            {sale.refunded_at && (
              <Field
                label={t(locale, 'status.refunded')}
                value={`${formatDateTime(sale.refunded_at)} — ${
                  sale.refund_reason ?? t(locale, 'sd.noReason')
                }`}
              />
            )}
          </dl>
        </CardContent>
      </Card>

      {/* Cancel dialog */}
      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(locale, 'sd.cancelTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(locale, 'sd.cancelDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="cancel-reason" className="text-sm">
              {t(locale, 'sd.reasonOptional')}
            </Label>
            <Textarea
              id="cancel-reason"
              placeholder={t(locale, 'sd.cancelReasonPh')}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
              disabled={pending}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>{t(locale, 'sd.keepSale')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={doCancel}
              disabled={pending}
              className="bg-rose-600 hover:bg-rose-700"
            >
              {pending ? t(locale, 'sd.cancelling') : t(locale, 'sd.cancelSale')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Refund dialog */}
      <Dialog open={refundOpen} onOpenChange={setRefundOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t(locale, 'sd.refundTitle')}</DialogTitle>
            <DialogDescription>
              {t(locale, 'sd.refundDesc')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="refund-reason" className="text-sm">
                {t(locale, 'sd.refundReason')} <span className="text-rose-600">*</span>
              </Label>
              <Textarea
                id="refund-reason"
                placeholder={t(locale, 'sd.refundReasonPh')}
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                rows={3}
                disabled={pending}
                required
              />
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={refundRestock}
                onChange={(e) => setRefundRestock(e.target.checked)}
                disabled={pending}
                className="mt-0.5"
              />
              <span>
                <strong>{t(locale, 'sd.restockBold')}</strong> {t(locale, 'sd.restockHint')}
              </span>
            </label>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRefundOpen(false)}
              disabled={pending}
            >
              {t(locale, 'common.cancel')}
            </Button>
            <Button
              onClick={doRefund}
              disabled={pending || !refundReason.trim()}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              {pending ? t(locale, 'sd.refunding') : t(locale, 'sd.refundSale')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LogCashDialog
        open={logCashOpen}
        onOpenChange={setLogCashOpen}
        saleId={sale.id}
        outstandingCents={outstandingForCash}
        sellerName={sale.seller_name}
        isOnBehalf={isOwnerEquivalent(role)}
        locale={locale}
      />
    </>
  )
}

function LogCashDialog({
  open,
  onOpenChange,
  saleId,
  outstandingCents,
  sellerName,
  isOnBehalf,
  locale,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  saleId: string
  outstandingCents: number
  sellerName: string | null
  isOnBehalf: boolean
  locale: Locale
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [amountStr, setAmountStr] = useState<string>(
    (Math.max(outstandingCents, 0) / 100).toFixed(2),
  )
  const [note, setNote] = useState<string>('')

  function handleOpenChange(next: boolean) {
    if (next) {
      setAmountStr((Math.max(outstandingCents, 0) / 100).toFixed(2))
      setNote('')
    }
    onOpenChange(next)
  }

  function doSubmit() {
    const amount = Number(amountStr)
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error(t(locale, 'sd.toastAmountPositive'))
      return
    }
    startTransition(async () => {
      const res = await logCashCollected({
        saleId,
        amountCents: Math.round(amount * 100),
        note: note.trim() || undefined,
      })
      if (res.ok) {
        toast.success(t(locale, 'sd.toastCashLogged'))
        handleOpenChange(false)
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(locale, 'sd.logCashCollected')}</DialogTitle>
          <DialogDescription>
            {isOnBehalf
              ? `${t(locale, 'sd.recordsThat')} ${sellerName ?? t(locale, 'sd.theSeller')} ${t(locale, 'sd.logCashHoldingTail')}`
              : t(locale, 'sd.logCashSelf')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="logcash-amount" className="text-xs">
              {t(locale, 'sd.amountCollected')} <span className="text-rose-600">*</span>
            </Label>
            <Input
              id="logcash-amount"
              type="number"
              step="0.01"
              min="0"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              disabled={pending}
            />
            <p className="text-xs text-muted-foreground">
              {t(locale, 'sd.outstandingOnOrder')} {formatDOP(Math.max(outstandingCents, 0))}
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="logcash-note" className="text-xs">
              {t(locale, 'sd.noteOptional')}
            </Label>
            <Textarea
              id="logcash-note"
              placeholder={t(locale, 'sd.logCashNotePh')}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              disabled={pending}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={pending}>
            {t(locale, 'common.cancel')}
          </Button>
          <Button onClick={doSubmit} disabled={pending}>
            {pending ? t(locale, 'sd.logging') : t(locale, 'sd.logCollection')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="font-medium">{value}</dd>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ItemsCard — line items with expand-row showing FIFO lot consumption
// ---------------------------------------------------------------------------

function ItemsCard({ items, locale }: { items: SaleDetailItem[]; locale: Locale }) {
  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          {t(locale, 'sd.noLineItems')}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {t(locale, 'sales.col.items')}
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            ({items.length} {plural(locale, items.length, 'product.one', 'product.other')})
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10"></TableHead>
              <TableHead>{t(locale, 'sd.colProduct')}</TableHead>
              <TableHead className="text-right">{t(locale, 'sd.colQty')}</TableHead>
              <TableHead className="text-right">{t(locale, 'sd.colUnitPrice')}</TableHead>
              <TableHead className="text-right">{t(locale, 'sd.colDiscount')}</TableHead>
              <TableHead className="text-right">{t(locale, 'sd.colLineTotal')}</TableHead>
              <TableHead className="text-right">{t(locale, 'sd.colCogs')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <ItemRow key={item.id} item={item} locale={locale} />
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function ItemRow({ item, locale }: { item: SaleDetailItem; locale: Locale }) {
  const [open, setOpen] = useState(false)
  const hasTrail = item.lot_consumption.length > 0

  return (
    <>
      <TableRow
        className={hasTrail ? 'cursor-pointer hover:bg-muted/30' : ''}
        onClick={hasTrail ? () => setOpen(!open) : undefined}
      >
        <TableCell className="w-10">
          {hasTrail ? (
            open ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )
          ) : null}
        </TableCell>
        <TableCell>
          <div className="font-medium">{item.product_name}</div>
          {item.product_sku && (
            <div className="font-mono text-xs text-muted-foreground">
              {item.product_sku}
            </div>
          )}
        </TableCell>
        <TableCell className="text-right tabular-nums">{item.qty}</TableCell>
        <TableCell className="text-right tabular-nums">
          {formatDOP(item.unit_price_cents)}
        </TableCell>
        <TableCell className="text-right tabular-nums">
          {item.discount_cents > 0 ? (
            <span className="text-rose-700">−{formatDOP(item.discount_cents)}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </TableCell>
        <TableCell className="text-right font-medium tabular-nums">
          {formatDOP(item.line_total_cents)}
        </TableCell>
        <TableCell className="text-right tabular-nums text-muted-foreground">
          {item.cogs_cents != null ? formatDOP(item.cogs_cents) : '—'}
        </TableCell>
      </TableRow>
      {open && hasTrail && (
        <TableRow className="bg-muted/20 hover:bg-muted/20">
          <TableCell colSpan={7} className="py-3">
            <div className="ml-10 space-y-1">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                {t(locale, 'sd.fifoConsumption')}
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th className="py-1 text-left font-normal">{t(locale, 'sd.lot')}</th>
                    <th className="py-1 text-right font-normal">{t(locale, 'sd.colQty')}</th>
                    <th className="py-1 text-right font-normal">{t(locale, 'sd.unitCost')}</th>
                    <th className="py-1 text-right font-normal">{t(locale, 'sd.subtotalCost')}</th>
                  </tr>
                </thead>
                <tbody>
                  {item.lot_consumption.map((c) => (
                    <tr key={c.id}>
                      <td className="py-1 font-mono">
                        {c.lot_number ?? c.lot_id.slice(0, 8)}
                      </td>
                      <td className="py-1 text-right tabular-nums">
                        {c.qty_consumed}
                      </td>
                      <td className="py-1 text-right tabular-nums">
                        {formatDOP(Math.round(c.unit_cost_dop * 100))}
                      </td>
                      <td className="py-1 text-right tabular-nums">
                        {formatDOP(
                          Math.round(c.qty_consumed * c.unit_cost_dop * 100),
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// TotalsCard — totals breakdown + outstanding balance
// ---------------------------------------------------------------------------

function TotalsCard({ sale, locale }: { sale: SaleDetailType; locale: Locale }) {
  const outstanding = sale.total_cents - sale.paid_cents
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t(locale, 'sd.totals')}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="space-y-1 text-sm">
          <Row label={t(locale, 'sd.subtotal')} value={formatDOP(sale.subtotal_cents)} />
          {sale.discount_cents > 0 && (
            <Row
              label={t(locale, 'sd.colDiscount')}
              value={`-${formatDOP(sale.discount_cents)}`}
              tone="negative"
            />
          )}
          {sale.tax_cents > 0 && (
            <Row label={t(locale, 'sd.tax')} value={formatDOP(sale.tax_cents)} />
          )}
          {sale.shipping_cents > 0 && (
            <Row label={t(locale, 'sd.shipping')} value={formatDOP(sale.shipping_cents)} />
          )}
          <Row label={t(locale, 'sales.col.total')} value={formatDOP(sale.total_cents)} bold />
          <Row label={t(locale, 'sales.col.paid')} value={formatDOP(sale.paid_cents)} />
          {outstanding > 0 && (
            <Row
              label={t(locale, 'sd.outstanding')}
              value={formatDOP(outstanding)}
              tone="negative"
              bold
            />
          )}
          {sale.cogs_cents != null && (
            <Row
              label={t(locale, 'sd.colCogs')}
              value={formatDOP(sale.cogs_cents)}
              tone="muted"
            />
          )}
          {sale.gross_profit_cents != null && (
            <Row
              label={t(locale, 'sd.grossProfit')}
              value={formatDOP(sale.gross_profit_cents)}
              tone="muted"
            />
          )}
        </dl>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// PaymentsPanel — payments list + outstanding line + "Add payment"
// ---------------------------------------------------------------------------

const METHOD_ICON: Record<string, typeof Banknote> = {
  cash: Banknote,
  card: CreditCard,
  transfer: ArrowRightLeft,
  paypal: Wallet,
  stripe: CreditCard,
  credit: Wallet,
  mixed: Wallet,
}

// Payment method -> dictionary key.
const METHOD_KEY: Record<string, string> = {
  cash: 'method.cash',
  card: 'method.card',
  transfer: 'method.transfer',
  paypal: 'method.paypal',
  stripe: 'method.stripe',
  credit: 'method.credit',
  mixed: 'method.mixed',
}

function PaymentsPanel({
  sale,
  moneyAccounts,
  locale,
}: {
  sale: SaleDetailType
  moneyAccounts: MoneyAccount[]
  locale: Locale
}) {
  const outstanding = sale.total_cents - sale.paid_cents
  const isCancelled = sale.status === 'cancelled' || sale.status === 'refunded'
  const canAddPayment =
    !isCancelled &&
    (sale.status === 'confirmed' ||
      sale.status === 'paid' ||
      sale.status === 'partially_paid')

  const [addOpen, setAddOpen] = useState(false)

  // Suggest outstanding (or total if no payments yet) as the default amount.
  const suggestedAmountCents = outstanding > 0 ? outstanding : sale.total_cents

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">
          {t(locale, 'sd.payments')}
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            ({sale.payments.length})
          </span>
        </CardTitle>
        {canAddPayment && (
          <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            {t(locale, 'sd.addPayment')}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {sale.payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t(locale, 'sd.noPayments')}</p>
        ) : (
          <ul className="divide-y">
            {sale.payments.map((p) => {
              const Icon = METHOD_ICON[p.method] ?? Wallet
              return (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <div className="text-sm font-medium">
                        {t(locale, METHOD_KEY[p.method] ?? '') || p.method}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {p.money_account_name} . {formatDateTime(p.paid_at)}
                        {p.reference && <> . {p.reference}</>}
                      </div>
                    </div>
                  </div>
                  <div className="text-right tabular-nums text-sm font-medium">
                    {formatDOP(p.amount_cents)}
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {sale.payments.length > 0 && (
          <div className="mt-3 border-t pt-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t(locale, 'sales.col.paid')}</dt>
              <dd className="tabular-nums">{formatDOP(sale.paid_cents)}</dd>
            </div>
            {outstanding > 0 && (
              <div className="flex justify-between font-medium text-rose-700">
                <dt>{t(locale, 'sd.outstanding')}</dt>
                <dd className="tabular-nums">{formatDOP(outstanding)}</dd>
              </div>
            )}
            {outstanding < 0 && (
              <div className="flex justify-between font-medium text-amber-700">
                <dt>{t(locale, 'sd.overpaid')}</dt>
                <dd className="tabular-nums">{formatDOP(-outstanding)}</dd>
              </div>
            )}
          </div>
        )}
      </CardContent>
      <AddPaymentDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        saleId={sale.id}
        suggestedAmountCents={suggestedAmountCents}
        moneyAccounts={moneyAccounts}
        locale={locale}
      />
    </Card>
  )
}

// ---------------------------------------------------------------------------
// CommissionsPanel — grouped by earner, status breakdown per earner
// ---------------------------------------------------------------------------

type CommissionsByEarner = {
  earner_id: string
  earner_name: string
  roles: Set<'seller' | 'distributor'>
  total_cents: number
  paid_cents: number
  pending_cents: number
  void_cents: number
  rows: number
}

function CommissionsPanel({ sale, locale }: { sale: SaleDetailType; locale: Locale }) {
  const grouped = new Map<string, CommissionsByEarner>()
  for (const c of sale.commissions) {
    let g = grouped.get(c.earner_id)
    if (!g) {
      g = {
        earner_id: c.earner_id,
        earner_name: c.earner_name,
        roles: new Set(),
        total_cents: 0,
        paid_cents: 0,
        pending_cents: 0,
        void_cents: 0,
        rows: 0,
      }
      grouped.set(c.earner_id, g)
    }
    g.roles.add(c.earner_role)
    g.total_cents += c.amount_cents
    g.rows += 1
    if (c.status === 'paid') g.paid_cents += c.amount_cents
    else if (c.status === 'pending') g.pending_cents += c.amount_cents
    else if (c.status === 'void') g.void_cents += c.amount_cents
  }

  const earners = Array.from(grouped.values()).sort((a, b) =>
    a.earner_name.localeCompare(b.earner_name),
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {t(locale, 'sd.commissions')}
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            ({sale.commissions.length} {plural(locale, sale.commissions.length, 'row.one', 'row.other')})
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {earners.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t(locale, 'sd.noCommissions')}</p>
        ) : (
          <ul className="divide-y">
            {earners.map((g) => {
              const rolesLabel = Array.from(g.roles)
                .map((r) => t(locale, r === 'seller' ? 'role.seller' : 'role.distributor'))
                .join(' + ')
              return (
                <li key={g.earner_id} className="py-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">{g.earner_name}</div>
                      <div className="text-xs capitalize text-muted-foreground">
                        {rolesLabel} . {g.rows} {plural(locale, g.rows, 'line.one', 'line.other')}
                      </div>
                    </div>
                    <div className="text-right tabular-nums text-sm font-medium">
                      {formatDOP(g.total_cents)}
                    </div>
                  </div>
                  {(g.paid_cents > 0 || g.pending_cents > 0 || g.void_cents > 0) && (
                    <div className="mt-1 flex gap-3 text-xs">
                      {g.paid_cents > 0 && (
                        <span className="text-emerald-700">
                          {t(locale, 'sales.col.paid')} {formatDOP(g.paid_cents)}
                        </span>
                      )}
                      {g.pending_cents > 0 && (
                        <span className="text-amber-700">
                          {t(locale, 'sd.pending')} {formatDOP(g.pending_cents)}
                        </span>
                      )}
                      {g.void_cents > 0 && (
                        <span className="text-muted-foreground">
                          {t(locale, 'sd.void')} {formatDOP(g.void_cents)}
                        </span>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// SummaryCards — three-column row, kept as wrapper for layout
// ---------------------------------------------------------------------------

function SummaryCards({
  sale,
  moneyAccounts,
  locale,
}: {
  sale: SaleDetailType
  moneyAccounts: MoneyAccount[]
  locale: Locale
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <TotalsCard sale={sale} locale={locale} />
      <PaymentsPanel sale={sale} moneyAccounts={moneyAccounts} locale={locale} />
      <CommissionsPanel sale={sale} locale={locale} />
    </div>
  )
}

function Row({
  label,
  value,
  bold,
  tone,
}: {
  label: string
  value: string
  bold?: boolean
  tone?: 'negative' | 'muted'
}) {
  return (
    <div className="flex justify-between">
      <dt
        className={
          tone === 'muted'
            ? 'text-muted-foreground'
            : bold
              ? 'font-semibold'
              : ''
        }
      >
        {label}
      </dt>
      <dd
        className={`tabular-nums ${
          tone === 'negative'
            ? 'text-rose-700'
            : tone === 'muted'
              ? 'text-muted-foreground'
              : bold
                ? 'font-semibold'
                : ''
        }`}
      >
        {value}
      </dd>
    </div>
  )
}

// ---------------------------------------------------------------------------
// AddPaymentDialog — records a payment against a sale
// ---------------------------------------------------------------------------

const PAYMENT_METHODS: Array<{ value: string; labelKey: string }> = [
  { value: 'cash', labelKey: 'method.cash' },
  { value: 'card', labelKey: 'method.card' },
  { value: 'transfer', labelKey: 'method.transfer' },
  { value: 'paypal', labelKey: 'method.paypal' },
  { value: 'stripe', labelKey: 'method.stripe' },
  { value: 'credit', labelKey: 'method.credit' },
  { value: 'mixed', labelKey: 'method.mixed' },
]

// Account kind -> dictionary key.
const ACCOUNT_KIND_KEY: Record<MoneyAccount['kind'], string> = {
  bank: 'acctKind.bank',
  cash: 'acctKind.cash',
  card: 'acctKind.card',
  digital: 'acctKind.digital',
  credit_line: 'acctKind.credit_line',
}

function AddPaymentDialog({
  open,
  onOpenChange,
  saleId,
  suggestedAmountCents,
  moneyAccounts,
  locale,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  saleId: string
  suggestedAmountCents: number
  moneyAccounts: MoneyAccount[]
  locale: Locale
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  // Initial values are computed each time the dialog mounts.
  const today = new Date().toISOString().slice(0, 10)
  const [method, setMethod] = useState<string>('cash')
  const [amountStr, setAmountStr] = useState<string>(
    (suggestedAmountCents / 100).toFixed(2),
  )
  const [accountId, setAccountId] = useState<string>('')
  const [paidAt, setPaidAt] = useState<string>(today)
  const [reference, setReference] = useState<string>('')

  // Reset when the dialog reopens so it always shows fresh state.
  function handleOpenChange(next: boolean) {
    if (next) {
      setMethod('cash')
      setAmountStr((suggestedAmountCents / 100).toFixed(2))
      setAccountId('')
      setPaidAt(new Date().toISOString().slice(0, 10))
      setReference('')
    }
    onOpenChange(next)
  }

  // Group accounts by kind for the Select.
  const grouped = moneyAccounts.reduce<Record<string, MoneyAccount[]>>(
    (acc, a) => {
      const k = a.kind
      if (!acc[k]) acc[k] = []
      acc[k].push(a)
      return acc
    },
    {},
  )
  const kindOrder: Array<MoneyAccount['kind']> = [
    'bank',
    'cash',
    'card',
    'digital',
    'credit_line',
  ]

  function doSubmit() {
    const amount = Number(amountStr)
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error(t(locale, 'sd.toastAmountPositive'))
      return
    }
    if (!accountId) {
      toast.error(t(locale, 'sd.toastPickAccount'))
      return
    }
    const amountCents = Math.round(amount * 100)

    startTransition(async () => {
      const res = await recordPayment({
        saleId,
        method: method as
          | 'cash'
          | 'card'
          | 'transfer'
          | 'paypal'
          | 'stripe'
          | 'credit'
          | 'mixed',
        amountCents,
        moneyAccountId: accountId,
        paidAt,
        reference: reference.trim() || undefined,
      })
      if (res.ok) {
        toast.success(t(locale, 'sd.toastPaymentRecorded'))
        handleOpenChange(false)
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(locale, 'sd.addPayment')}</DialogTitle>
          <DialogDescription>
            {t(locale, 'sd.addPaymentDesc')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="pay-method" className="text-xs">
                {t(locale, 'sd.method')}
              </Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger id="pay-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {t(locale, m.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="pay-amount" className="text-xs">
                {t(locale, 'sd.amountDop')} <span className="text-rose-600">*</span>
              </Label>
              <Input
                id="pay-amount"
                type="number"
                step="0.01"
                min="0"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                disabled={pending}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="pay-account" className="text-xs">
              {t(locale, 'sd.account')} <span className="text-rose-600">*</span>
            </Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger id="pay-account">
                <SelectValue placeholder={t(locale, 'sd.pickAccount')} />
              </SelectTrigger>
              <SelectContent>
                {kindOrder
                  .filter((k) => grouped[k]?.length)
                  .map((k) => (
                    <SelectGroup key={k}>
                      <SelectLabel>{t(locale, ACCOUNT_KIND_KEY[k])}</SelectLabel>
                      {grouped[k].map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="pay-date" className="text-xs">
                {t(locale, 'sd.date')}
              </Label>
              <Input
                id="pay-date"
                type="date"
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
                disabled={pending}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pay-ref" className="text-xs">
                {t(locale, 'sd.reference')}
              </Label>
              <Input
                id="pay-ref"
                placeholder={t(locale, 'sd.referencePh')}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                disabled={pending}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={pending}
          >
            {t(locale, 'common.cancel')}
          </Button>
          <Button onClick={doSubmit} disabled={pending}>
            {pending ? t(locale, 'sd.recording') : t(locale, 'sd.recordPayment')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
