'use client'

import Link from 'next/link'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatDOP, formatDate } from '@/lib/format'
import type { SaleListItem, SaleStatus } from '@/lib/sales'

type Props = {
  rows: SaleListItem[]
  total: number
  page: number
  pageSize: number
}

// Visual treatment per status. Tailwind utility classes only (no compiler).
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

export function SalesTable({ rows, total, page, pageSize }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  function goToPage(p: number) {
    const params = new URLSearchParams(searchParams.toString())
    if (p <= 1) params.delete('page')
    else params.set('page', String(p))
    router.push(`${pathname}?${params.toString()}`)
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-md border bg-card p-12 text-center">
        <p className="text-sm text-muted-foreground">
          No sales match the current filters.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Seller</TableHead>
              <TableHead>Warehouse</TableHead>
              <TableHead className="text-right">Items</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Paid</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const href = `/sales/${r.id}`
              return (
                <TableRow key={r.id} className="cursor-pointer hover:bg-muted/40">
                  <TableCell className="font-mono text-sm">
                    <Link href={href} className="hover:underline">
                      {r.invoice_number ?? <span className="text-muted-foreground">—</span>}
                    </Link>
                  </TableCell>
                  <TableCell>{formatDate(r.sold_at)}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={STATUS_VARIANT[r.status]}>
                      {STATUS_LABEL[r.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {r.customer_name ?? (
                      <span className="text-muted-foreground">Walk-in</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {r.seller_name ?? <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>{r.warehouse_name}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.item_count}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatDOP(r.total_cents, { decimals: 0 })}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.paid_cents === r.total_cents ? (
                      <span className="text-emerald-700">
                        {formatDOP(r.paid_cents, { decimals: 0 })}
                      </span>
                    ) : (
                      <span>{formatDOP(r.paid_cents, { decimals: 0 })}</span>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm">
        <div className="text-muted-foreground">
          {from}–{to} of {total}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => goToPage(page - 1)}
          >
            Previous
          </Button>
          <span className="text-muted-foreground">
            Page {page} of {pageCount}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pageCount}
            onClick={() => goToPage(page + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  )
}
