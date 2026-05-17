'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import Link from 'next/link'
import { ChevronDown, ChevronRight, MoreVertical, XCircle, RotateCcw, Plus, Banknote, CreditCard, ArrowRightLeft, Wallet, Printer } from 'lucide-react'
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
import { cancelSale, refundSale, recordPayment } from '../actions'
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

const STATUS_LABEL: Record<SaleStatus, string> = {
  draft: 'Draft',
  confirmed: 'Confirmed',
  paid: 'Paid',
  partially_paid: 'Partially paid',
  refunded: 'Refunded',
  cancelled: 'Cancelled',
}

const FULFILLMENT_LABEL: Record<string, string> = {
  in_store: 'In-store',
  pickup: 'Pickup',
  delivery: 'Delivery',
}

export function SaleDetail({
  sale,
  moneyAccounts,
}: {
  sale: SaleDetailType
  moneyAccounts: MoneyAccount[]
}) {
  return (
    <div className="space-y-4">
      <HeaderCard sale={sale} />
      <ItemsCard items={sale.items} />
      <SummaryCards sale={sale} moneyAccounts={moneyAccounts} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// HeaderCard — invoice number, status, dates, customer, seller, warehouse
// ---------------------------------------------------------------------------

function HeaderCard({ sale }: { sale: SaleDetailType }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')

  const [refundOpen, setRefundOpen] = useState(false)
  const [refundReason, setRefundReason] = useState('')
  const [refundRestock, setRefundRestock] = useState(true)

  const canCancel =
    sale.status === 'draft' ||
    sale.status === 'confirmed' ||
    sale.status === 'partially_paid'
  const canRefund =
    sale.status === 'confirmed' ||
    sale.status === 'paid' ||
    sale.status === 'partially_paid'
  const hasAnyAction = true // Print receipt is always available

  function doCancel() {
    startTransition(async () => {
      const res = await cancelSale(sale.id, cancelReason)
      if (res.ok) {
        toast.success('Sale cancelled.')
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
      toast.error('Refund reason is required.')
      return
    }
    startTransition(async () => {
      const res = await refundSale(sale.id, refundReason, refundRestock)
      if (res.ok) {
        toast.success(
          refundRestock ? 'Sale refunded and stock returned to lots.' : 'Sale refunded.',
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
                  {sale.invoice_number ?? '— (draft)'}
                </CardTitle>
                <Badge variant="secondary" className={STATUS_VARIANT[sale.status]}>
                  {STATUS_LABEL[sale.status]}
                </Badge>
                {hasAnyAction && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                        <MoreVertical className="h-4 w-4" />
                        <span className="sr-only">Actions</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem asChild>
                        <Link href={`/sales/${sale.id}/print`} target="_blank" rel="noopener noreferrer">
                          <Printer className="mr-2 h-4 w-4" />
                          Print receipt
                        </Link>
                      </DropdownMenuItem>
                      {(canCancel || canRefund) && <DropdownMenuSeparator />}
                      {canCancel && (
                        <DropdownMenuItem onClick={() => setCancelOpen(true)}>
                          <XCircle className="mr-2 h-4 w-4" />
                          Cancel sale
                        </DropdownMenuItem>
                      )}
                      {canRefund && (
                        <DropdownMenuItem
                          onClick={() => setRefundOpen(true)}
                          className="text-rose-700 focus:text-rose-700"
                        >
                          <RotateCcw className="mr-2 h-4 w-4" />
                          Refund sale
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                Sold {formatDateTime(sale.sold_at)}
                {sale.confirmed_at && (
                  <> · confirmed {formatDateTime(sale.confirmed_at)}</>
                )}
                {sale.paid_at && <> · paid {formatDateTime(sale.paid_at)}</>}
              </p>
            </div>
            <div className="text-right">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Total
              </div>
              <div className="text-2xl font-semibold tabular-nums">
                {formatDOP(sale.total_cents)}
              </div>
              {sale.paid_cents !== sale.total_cents && (
                <div className="text-xs text-muted-foreground tabular-nums">
                  {formatDOP(sale.paid_cents)} paid
                </div>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Customer" value={sale.customer_name ?? 'Walk-in'} />
            <Field label="Seller" value={sale.seller_name ?? '—'} />
            <Field
              label="Fulfillment"
              value={`${sale.fulfillment_warehouse_name} · ${
                FULFILLMENT_LABEL[sale.fulfillment_method] ?? sale.fulfillment_method
              }`}
            />
            {sale.source_warehouse_name &&
              sale.source_warehouse_id !== sale.fulfillment_warehouse_id && (
                <Field
                  label="Source warehouse"
                  value={sale.source_warehouse_name}
                />
              )}
            {sale.tracking_number && (
              <Field label="Tracking" value={sale.tracking_number} />
            )}
            {sale.delivery_notes && (
              <Field label="Delivery notes" value={sale.delivery_notes} />
            )}
            {sale.refunded_at && (
              <Field
                label="Refunded"
                value={`${formatDateTime(sale.refunded_at)} — ${
                  sale.refund_reason ?? 'no reason given'
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
            <AlertDialogTitle>Cancel this sale?</AlertDialogTitle>
            <AlertDialogDescription>
              The sale will move to <strong>cancelled</strong>. Stock movements are not
              reversed. If this sale already had stock pulled, refund it instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="cancel-reason" className="text-sm">
              Reason (optional)
            </Label>
            <Textarea
              id="cancel-reason"
              placeholder="Operator error, duplicate entry, …"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
              disabled={pending}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Keep sale</AlertDialogCancel>
            <AlertDialogAction
              onClick={doCancel}
              disabled={pending}
              className="bg-rose-600 hover:bg-rose-700"
            >
              {pending ? 'Cancelling…' : 'Cancel sale'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Refund dialog */}
      <Dialog open={refundOpen} onOpenChange={setRefundOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Refund this sale?</DialogTitle>
            <DialogDescription>
              Status moves to <strong>refunded</strong>. Audit-trail stock movements
              are written for every consumed lot. All commissions on this sale are
              voided (including ones already paid out, which creates a clawback debt).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="refund-reason" className="text-sm">
                Refund reason <span className="text-rose-600">*</span>
              </Label>
              <Textarea
                id="refund-reason"
                placeholder="Customer returned product, wrong item, …"
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
                <strong>Add stock back to lots.</strong> Uncheck only if the items
                were damaged or destroyed and won't return to inventory.
              </span>
            </label>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRefundOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              onClick={doRefund}
              disabled={pending || !refundReason.trim()}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              {pending ? 'Refunding…' : 'Refund sale'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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

function ItemsCard({ items }: { items: SaleDetailItem[] }) {
  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          This sale has no line items.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Items
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            ({items.length} {items.length === 1 ? 'product' : 'products'})
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10"></TableHead>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Unit price</TableHead>
              <TableHead className="text-right">Discount</TableHead>
              <TableHead className="text-right">Line total</TableHead>
              <TableHead className="text-right">COGS</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <ItemRow key={item.id} item={item} />
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function ItemRow({ item }: { item: SaleDetailItem }) {
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
                FIFO lot consumption
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th className="py-1 text-left font-normal">Lot</th>
                    <th className="py-1 text-right font-normal">Qty</th>
                    <th className="py-1 text-right font-normal">Unit cost</th>
                    <th className="py-1 text-right font-normal">Subtotal cost</th>
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
// SummaryCards — totals breakdown + small placeholders for payments/commissions
// (richer panels arrive in 9.3)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// TotalsCard — totals breakdown + outstanding balance
// ---------------------------------------------------------------------------

function TotalsCard({ sale }: { sale: SaleDetailType }) {
  const outstanding = sale.total_cents - sale.paid_cents
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Totals</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="space-y-1 text-sm">
          <Row label="Subtotal" value={formatDOP(sale.subtotal_cents)} />
          {sale.discount_cents > 0 && (
            <Row
              label="Discount"
              value={`-${formatDOP(sale.discount_cents)}`}
              tone="negative"
            />
          )}
          {sale.tax_cents > 0 && (
            <Row label="Tax" value={formatDOP(sale.tax_cents)} />
          )}
          {sale.shipping_cents > 0 && (
            <Row label="Shipping" value={formatDOP(sale.shipping_cents)} />
          )}
          <Row label="Total" value={formatDOP(sale.total_cents)} bold />
          <Row label="Paid" value={formatDOP(sale.paid_cents)} />
          {outstanding > 0 && (
            <Row
              label="Outstanding"
              value={formatDOP(outstanding)}
              tone="negative"
              bold
            />
          )}
          {sale.cogs_cents != null && (
            <Row
              label="COGS"
              value={formatDOP(sale.cogs_cents)}
              tone="muted"
            />
          )}
          {sale.gross_profit_cents != null && (
            <Row
              label="Gross profit"
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
// PaymentsPanel — payments list + outstanding line + "Add payment" placeholder
// (real action wires up in 9.5)
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

const METHOD_LABEL: Record<string, string> = {
  cash: 'Cash',
  card: 'Card',
  transfer: 'Transfer',
  paypal: 'PayPal',
  stripe: 'Stripe',
  credit: 'Credit',
  mixed: 'Mixed',
}

function PaymentsPanel({
  sale,
  moneyAccounts,
}: {
  sale: SaleDetailType
  moneyAccounts: MoneyAccount[]
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
          Payments
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            ({sale.payments.length})
          </span>
        </CardTitle>
        {canAddPayment && (
          <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add payment
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {sale.payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payments recorded.</p>
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
                        {METHOD_LABEL[p.method] ?? p.method}
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
              <dt className="text-muted-foreground">Paid</dt>
              <dd className="tabular-nums">{formatDOP(sale.paid_cents)}</dd>
            </div>
            {outstanding > 0 && (
              <div className="flex justify-between font-medium text-rose-700">
                <dt>Outstanding</dt>
                <dd className="tabular-nums">{formatDOP(outstanding)}</dd>
              </div>
            )}
            {outstanding < 0 && (
              <div className="flex justify-between font-medium text-amber-700">
                <dt>Overpaid</dt>
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

function CommissionsPanel({ sale }: { sale: SaleDetailType }) {
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
          Commissions
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            ({sale.commissions.length} {sale.commissions.length === 1 ? 'row' : 'rows'})
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {earners.length === 0 ? (
          <p className="text-sm text-muted-foreground">No commissions recorded.</p>
        ) : (
          <ul className="divide-y">
            {earners.map((g) => {
              const rolesLabel = Array.from(g.roles).join(' + ')
              return (
                <li key={g.earner_id} className="py-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">{g.earner_name}</div>
                      <div className="text-xs capitalize text-muted-foreground">
                        {rolesLabel} . {g.rows} {g.rows === 1 ? 'line' : 'lines'}
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
                          Paid {formatDOP(g.paid_cents)}
                        </span>
                      )}
                      {g.pending_cents > 0 && (
                        <span className="text-amber-700">
                          Pending {formatDOP(g.pending_cents)}
                        </span>
                      )}
                      {g.void_cents > 0 && (
                        <span className="text-muted-foreground">
                          Void {formatDOP(g.void_cents)}
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
}: {
  sale: SaleDetailType
  moneyAccounts: MoneyAccount[]
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <TotalsCard sale={sale} />
      <PaymentsPanel sale={sale} moneyAccounts={moneyAccounts} />
      <CommissionsPanel sale={sale} />
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

const PAYMENT_METHODS: Array<{ value: string; label: string }> = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'paypal', label: 'PayPal' },
  { value: 'stripe', label: 'Stripe' },
  { value: 'credit', label: 'Credit' },
  { value: 'mixed', label: 'Mixed' },
]

const ACCOUNT_KIND_LABEL: Record<MoneyAccount['kind'], string> = {
  bank: 'Bank',
  cash: 'Cash',
  card: 'Card',
  digital: 'Digital',
  credit_line: 'Credit line',
}

function AddPaymentDialog({
  open,
  onOpenChange,
  saleId,
  suggestedAmountCents,
  moneyAccounts,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  saleId: string
  suggestedAmountCents: number
  moneyAccounts: MoneyAccount[]
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
      toast.error('Amount must be greater than zero.')
      return
    }
    if (!accountId) {
      toast.error('Pick a money account.')
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
        toast.success('Payment recorded.')
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
          <DialogTitle>Add payment</DialogTitle>
          <DialogDescription>
            Records a payment against this sale and updates the paid total.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="pay-method" className="text-xs">
                Method
              </Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger id="pay-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="pay-amount" className="text-xs">
                Amount (DOP) <span className="text-rose-600">*</span>
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
              Account <span className="text-rose-600">*</span>
            </Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger id="pay-account">
                <SelectValue placeholder="Pick an account…" />
              </SelectTrigger>
              <SelectContent>
                {kindOrder
                  .filter((k) => grouped[k]?.length)
                  .map((k) => (
                    <SelectGroup key={k}>
                      <SelectLabel>{ACCOUNT_KIND_LABEL[k]}</SelectLabel>
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
                Date
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
                Reference
              </Label>
              <Input
                id="pay-ref"
                placeholder="Transfer #, auth code…"
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
            Cancel
          </Button>
          <Button onClick={doSubmit} disabled={pending}>
            {pending ? 'Recording…' : 'Record payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
