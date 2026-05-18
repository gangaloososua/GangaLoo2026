'use client'

import * as React from 'react'
import Link from 'next/link'
import { ChevronRight, AlertTriangle, Check, Minus } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import {
  TableCell,
  TableRow,
} from '@/components/ui/table'

import type {
  PurchaseOrderItemRow,
  LotTrailEntry,
  PartialReceiveStatus,
} from '@/lib/purchases-types'

// ---- formatting ------------------------------------------

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
  return formatNumber(n, dp)
}

function formatQty(n: number): string {
  return new Intl.NumberFormat('en-GB', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(n)
}

// ---- partial-receive badge -------------------------------

function ReceiptIndicator({ partial }: { partial: PartialReceiveStatus }) {
  if (partial.is_unreceived) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        <Minus className="mr-1 size-3" />
        Not received
      </Badge>
    )
  }
  if (partial.is_partial) {
    return (
      <Badge variant="outline" className="border-amber-500 bg-amber-50 text-amber-900">
        <AlertTriangle className="mr-1 size-3" />
        {formatQty(partial.received)} of {formatQty(partial.ordered)}
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="border-green-500 bg-green-50 text-green-900">
      <Check className="mr-1 size-3" />
      {formatQty(partial.received)}
    </Badge>
  )
}

// ---- one consumption row (deepest level) -----------------

function ConsumptionRows({ entries }: { entries: LotTrailEntry['consumption'] }) {
  if (entries.length === 0) {
    return (
      <div className="py-2 px-4 text-xs text-muted-foreground italic">
        Lot not yet consumed by any sale.
      </div>
    )
  }
  return (
    <div className="bg-muted/40">
      <div className="grid grid-cols-12 gap-2 px-4 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold border-b">
        <div className="col-span-3">Sale</div>
        <div className="col-span-3">Date</div>
        <div className="col-span-2 text-right">Qty consumed</div>
        <div className="col-span-4">Seller</div>
      </div>
      {entries.map((c) => (
        <div
          key={c.sale_id + '-' + c.qty_consumed}
          className="grid grid-cols-12 gap-2 px-4 py-1.5 text-xs border-b last:border-b-0 hover:bg-muted/60 transition-colors"
        >
          <div className="col-span-3">
            {c.sale_invoice_number ? (
              <Link
                href={`/sales/${c.sale_id}`}
                className="font-mono hover:underline"
              >
                {c.sale_invoice_number}
              </Link>
            ) : (
              <Link
                href={`/sales/${c.sale_id}`}
                className="font-mono text-muted-foreground hover:underline"
              >
                {c.sale_id.split('-')[0]}
              </Link>
            )}
          </div>
          <div className="col-span-3 tabular-nums text-muted-foreground">
            {formatDate(c.sale_occurred_at)}
          </div>
          <div className="col-span-2 text-right tabular-nums">
            {formatQty(c.qty_consumed)}
          </div>
          <div className="col-span-4 text-muted-foreground">
            {c.seller_name ?? '—'}
          </div>
        </div>
      ))}
    </div>
  )
}

// ---- one lot row, expandable -----------------------------

function LotRow({ entry }: { entry: LotTrailEntry }) {
  const [open, setOpen] = React.useState(false)
  const hasConsumption = entry.consumption.length > 0
  const consumedQty = entry.consumption.reduce((s, c) => s + c.qty_consumed, 0)

  return (
    <div className="border-b last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full grid grid-cols-12 gap-2 px-4 py-2 text-xs items-center hover:bg-muted/40 transition-colors text-left"
        aria-expanded={open}
      >
        <div className="col-span-1">
          <ChevronRight
            className={
              'size-3 text-muted-foreground transition-transform ' +
              (open ? 'rotate-90' : '')
            }
          />
        </div>
        <div className="col-span-2 font-mono">
          {entry.lot.lot_number ?? entry.lot.id.split('-')[0]}
        </div>
        <div className="col-span-2 tabular-nums text-muted-foreground">
          {formatDate(entry.lot.received_at)}
        </div>
        <div className="col-span-2 text-right tabular-nums">
          {formatQty(entry.lot.qty_received)}
        </div>
        <div className="col-span-2 text-right tabular-nums">
          {formatQty(entry.lot.qty_remaining)}
        </div>
        <div className="col-span-2 text-right tabular-nums">
          {formatNumberOrDash(entry.lot.unit_cost_dop)}
        </div>
        <div className="col-span-1 text-right">
          {hasConsumption ? (
            <span className="text-[10px] text-muted-foreground">
              -{formatQty(consumedQty)}
            </span>
          ) : null}
        </div>
      </button>
      {open && <ConsumptionRows entries={entry.consumption} />}
    </div>
  )
}

// ---- the line-item row (top-level export) ----------------

type Props = {
  line: PurchaseOrderItemRow
  lots: LotTrailEntry[]
  partial: PartialReceiveStatus
  landedMismatch: boolean
}

export function PurchaseDetailLineRow({ line, lots, partial, landedMismatch }: Props) {
  const [open, setOpen] = React.useState(false)
  const canExpand = lots.length > 0

  return (
    <>
      <TableRow className={canExpand ? 'cursor-pointer hover:bg-muted/50' : ''}>
        <TableCell className="w-8 p-2">
          {canExpand && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="text-muted-foreground hover:text-foreground p-1 -m-1"
              aria-expanded={open}
              aria-label={open ? 'Hide lots' : 'Show lots'}
            >
              <ChevronRight
                className={'size-4 transition-transform ' + (open ? 'rotate-90' : '')}
              />
            </button>
          )}
        </TableCell>
        <TableCell>
          <div className="font-medium">{line.product_name ?? <span className="text-muted-foreground">Unknown product</span>}</div>
          {line.product_sku && (
            <div className="text-xs font-mono text-muted-foreground">{line.product_sku}</div>
          )}
        </TableCell>
        <TableCell className="text-right tabular-nums">{formatQty(line.qty)}</TableCell>
        <TableCell className="text-right tabular-nums">{formatNumber(line.usd_unit_cost, 4)}</TableCell>
        <TableCell className="text-right tabular-nums">{formatNumber(line.usd_line_total)}</TableCell>
        <TableCell className="text-right tabular-nums">{formatNumberOrDash(line.dop_unit_cost_base, 4)}</TableCell>
        <TableCell className="text-right tabular-nums text-muted-foreground">
          {formatNumberOrDash(line.dop_bank_share)}
        </TableCell>
        <TableCell className="text-right tabular-nums text-muted-foreground">
          {formatNumberOrDash(line.dop_transport_share)}
        </TableCell>
        <TableCell className="text-right tabular-nums font-semibold">
          <div className="flex items-center justify-end gap-1">
            {landedMismatch && (
              <span title="Base + bank + transport does not match landed cost">
                <AlertTriangle className="size-3 text-amber-600" />
              </span>
            )}
            {formatNumberOrDash(line.dop_unit_landed_cost, 4)}
          </div>
        </TableCell>
        <TableCell>
          <ReceiptIndicator partial={partial} />
        </TableCell>
      </TableRow>

      {open && canExpand && (
        <TableRow className="bg-muted/20 hover:bg-muted/20">
          <TableCell colSpan={10} className="p-0">
            <div className="border-l-2 border-foreground/10 ml-4">
              <div className="grid grid-cols-12 gap-2 px-4 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold border-b bg-muted/30">
                <div className="col-span-1"></div>
                <div className="col-span-2">Lot</div>
                <div className="col-span-2">Received</div>
                <div className="col-span-2 text-right">Qty received</div>
                <div className="col-span-2 text-right">Qty remaining</div>
                <div className="col-span-2 text-right">DOP / unit</div>
                <div className="col-span-1 text-right">Consumed</div>
              </div>
              {lots.map((entry) => (
                <LotRow key={entry.lot.id} entry={entry} />
              ))}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}
