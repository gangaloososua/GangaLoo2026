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
import { type Locale, t } from '@/lib/i18n/dictionary'

type Props = {
  rows: SaleListItem[]
  total: number
  page: number
  pageSize: number
  locale: Locale
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

// Status -> dictionary key (label resolved via t() at render time).
const STATUS_KEY: Record<SaleStatus, string> = {
  draft: 'status.draft',
  confirmed: 'status.confirmed',
  paid: 'status.paid',
  partially_paid: 'status.partiallyPaid',
  refunded: 'status.refunded',
  cancelled: 'status.cancelled',
}

export function SalesTable({ rows, total, page, pageSize, locale }: Props) {
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
          {t(locale, 'sales.noMatch')}
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
              <TableHead>{t(locale, 'sales.col.invoice')}</TableHead>
              <TableHead>{t(locale, 'sales.col.date')}</TableHead>
              <TableHead>{t(locale, 'sales.col.status')}</TableHead>
              <TableHead>{t(locale, 'sales.col.customer')}</TableHead>
              <TableHead>{t(locale, 'sales.col.seller')}</TableHead>
              <TableHead>{t(locale, 'sales.col.warehouse')}</TableHead>
              <TableHead className="text-right">{t(locale, 'sales.col.items')}</TableHead>
              <TableHead className="text-right">{t(locale, 'sales.col.total')}</TableHead>
              <TableHead className="text-right">{t(locale, 'sales.col.paid')}</TableHead>
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
                      {t(locale, STATUS_KEY[r.status])}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {r.customer_name ?? (
                      <span className="text-muted-foreground">{t(locale, 'sales.walkIn')}</span>
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
          {from}–{to} {t(locale, 'common.of')} {total}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => goToPage(page - 1)}
          >
            {t(locale, 'common.previous')}
          </Button>
          <span className="text-muted-foreground">
            {t(locale, 'common.page')} {page} {t(locale, 'common.of')} {pageCount}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pageCount}
            onClick={() => goToPage(page + 1)}
          >
            {t(locale, 'common.next')}
          </Button>
        </div>
      </div>
    </div>
  )
}
