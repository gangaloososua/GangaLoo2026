'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
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
import { formatDOP, formatDateTime } from '@/lib/format'
import type {
  SaleDetail as SaleDetailType,
  SaleStatus,
  SaleDetailItem,
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

export function SaleDetail({ sale }: { sale: SaleDetailType }) {
  return (
    <div className="space-y-4">
      <HeaderCard sale={sale} />
      <ItemsCard items={sale.items} />
      <SummaryCards sale={sale} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// HeaderCard — invoice number, status, dates, customer, seller, warehouse
// ---------------------------------------------------------------------------

function HeaderCard({ sale }: { sale: SaleDetailType }) {
  return (
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

function SummaryCards({ sale }: { sale: SaleDetailType }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
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
                value={`−${formatDOP(sale.discount_cents)}`}
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Payments
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({sale.payments.length})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sale.payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments recorded.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {sale.payments.map((p) => (
                <li key={p.id} className="flex justify-between gap-2">
                  <div>
                    <div className="font-medium capitalize">
                      {p.method.replace('_', ' ')}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {p.money_account_name} · {formatDateTime(p.paid_at)}
                    </div>
                  </div>
                  <div className="text-right tabular-nums font-medium">
                    {formatDOP(p.amount_cents)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Commissions
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({sale.commissions.length})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sale.commissions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No commissions recorded.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {sale.commissions.map((c) => (
                <li key={c.id} className="flex justify-between gap-2">
                  <div>
                    <div className="font-medium">{c.earner_name}</div>
                    <div className="text-xs text-muted-foreground capitalize">
                      {c.earner_role} · {c.percent}% · {c.status}
                    </div>
                  </div>
                  <div className="text-right tabular-nums font-medium">
                    {formatDOP(c.amount_cents)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
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
