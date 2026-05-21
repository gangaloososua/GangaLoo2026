'use client'

import { useRouter } from 'next/navigation'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import type { StockMovementRow } from '@/lib/inventory'

type WarehouseOption = { id: string; name: string }

type Props = {
  rows: StockMovementRow[]
  warehouses: WarehouseOption[]
  current: { warehouse: string; kind: string; from: string; to: string }
}

const KIND_LABELS: Record<string, string> = {
  purchase_in: 'Purchase in',
  sale_out: 'Sale out',
  transfer_in: 'Transfer in',
  transfer_out: 'Transfer out',
  adjustment_in: 'Adjustment in',
  adjustment_out: 'Adjustment out',
  return_in: 'Return in',
  initial: 'Initial',
}

const KIND_ORDER = [
  'purchase_in',
  'sale_out',
  'transfer_in',
  'transfer_out',
  'adjustment_in',
  'adjustment_out',
  'return_in',
  'initial',
]

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function fmtCost(c: number | null): string {
  if (c === null) return '—'
  return 'RD$' + c.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const selectClass =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

export function MovementsLedger({ rows, warehouses, current }: Props) {
  const router = useRouter()

  function applyFilters(form: HTMLFormElement) {
    const fd = new FormData(form)
    const params = new URLSearchParams()
    const w = String(fd.get('warehouse') || '')
    const k = String(fd.get('kind') || '')
    const from = String(fd.get('from') || '')
    const to = String(fd.get('to') || '')
    if (w) params.set('warehouse', w)
    if (k) params.set('kind', k)
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    const qs = params.toString()
    router.push(qs ? '/inventory?' + qs : '/inventory')
  }

  const hasFilters =
    !!current.warehouse || !!current.kind || !!current.from || !!current.to

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          applyFilters(e.currentTarget)
        }}
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end"
      >
        <div className="space-y-1">
          <Label className="text-xs">Warehouse</Label>
          <select name="warehouse" defaultValue={current.warehouse} className={selectClass}>
            <option value="">All warehouses</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Type</Label>
          <select name="kind" defaultValue={current.kind} className={selectClass}>
            <option value="">All types</option>
            {KIND_ORDER.map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">From</Label>
          <input type="date" name="from" defaultValue={current.from} className={selectClass} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">To</Label>
          <input type="date" name="to" defaultValue={current.to} className={selectClass} />
        </div>
        <div className="flex gap-2">
          <Button type="submit">Apply</Button>
          {hasFilters ? (
            <Button type="button" variant="outline" onClick={() => router.push('/inventory')}>
              Clear
            </Button>
          ) : null}
        </div>
      </form>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No movements match these filters.
        </p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Warehouse</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit cost</TableHead>
                <TableHead>Reason / by</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {fmtDate(m.occurredAt)}
                  </TableCell>
                  <TableCell className="font-medium">{m.productName}</TableCell>
                  <TableCell>{m.warehouseName}</TableCell>
                  <TableCell>{KIND_LABELS[m.kind] ?? m.kind}</TableCell>
                  <TableCell
                    className={
                      'text-right tabular-nums ' +
                      (m.qtyDelta < 0 ? 'text-rose-600' : 'text-emerald-700')
                    }
                  >
                    {m.qtyDelta > 0 ? '+' : ''}
                    {m.qtyDelta}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {fmtCost(m.unitCostDop)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {m.adjustmentReason ? m.adjustmentReason + ' · ' : ''}
                    {m.createdByName ?? ''}
                    {!m.adjustmentReason && !m.createdByName ? '—' : ''}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}