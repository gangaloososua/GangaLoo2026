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
import type { StockMovementRow } from '@/lib/inventory'

type Props = {
  rows: StockMovementRow[]
  productName?: string
}

// Mirrors the Inventory ledger labels so wording stays consistent app-wide.
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
  return (
    'RD$' +
    c.toLocaleString('en-GB', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  )
}

export function MovementsTab({ rows, productName }: Props) {
  const router = useRouter()

  function exportCsv() {
    const headers = [
      'Date',
      'Warehouse',
      'Type',
      'Qty',
      'Unit cost (DOP)',
      'Invoice',
      'Reason',
      'By',
    ]
    const esc = (v: string | number | null): string => {
      const s = v === null || v === undefined ? '' : String(v)
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
    }
    const lines = [headers.join(',')]
    for (const m of rows) {
      lines.push(
        [
          esc(m.occurredAt),
          esc(m.warehouseName),
          esc(KIND_LABELS[m.kind] ?? m.kind),
          esc(m.qtyDelta),
          esc(m.unitCostDop === null ? '' : m.unitCostDop),
          esc(m.saleInvoiceNumber),
          esc(m.adjustmentReason),
          esc(m.createdByName),
        ].join(','),
      )
    }
    const csv = lines.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const slug = (productName ?? 'product')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
    a.download = 'movements-' + slug + '-' + new Date().toISOString().slice(0, 10) + '.csv'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Stock movement history for this product across all warehouses. Showing
          the most recent {rows.length} movement{rows.length === 1 ? '' : 's'}.
          Rows tied to a sale are clickable — open the sale.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={exportCsv}
          disabled={rows.length === 0}
        >
          Export CSV
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No stock movements recorded for this product yet.
        </p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Warehouse</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit cost</TableHead>
                <TableHead>Reason / by</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((m) => {
                // Build the right-most cell from whichever bits apply.
                // Sale-linked rows show the invoice number first so it's
                // obvious what they'll open.
                const reasonBits: string[] = []
                if (m.saleInvoiceNumber) reasonBits.push(m.saleInvoiceNumber)
                if (m.adjustmentReason) reasonBits.push(m.adjustmentReason)
                if (m.createdByName) reasonBits.push(m.createdByName)
                const reasonText = reasonBits.length > 0 ? reasonBits.join(' · ') : '—'

                const clickable = m.saleId !== null
                const rowProps = clickable
                  ? {
                      onClick: () => router.push(`/sales/${m.saleId!}`),
                      onKeyDown: (e: React.KeyboardEvent<HTMLTableRowElement>) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          router.push(`/sales/${m.saleId!}`)
                        }
                      },
                      tabIndex: 0,
                      role: 'button' as const,
                      'aria-label':
                        'Open sale ' + (m.saleInvoiceNumber ?? m.saleId!),
                      className: 'cursor-pointer hover:bg-muted/50',
                    }
                  : {}

                return (
                  <TableRow key={m.id} {...rowProps}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {fmtDate(m.occurredAt)}
                    </TableCell>
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
                      {reasonText}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
