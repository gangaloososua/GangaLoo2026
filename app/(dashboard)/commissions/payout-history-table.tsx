'use client'
import * as React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatDOP, formatDate, formatDateTime } from '@/lib/format'
import type { PayoutHistoryRow } from '@/lib/commissions'

type Props = {
  rows: PayoutHistoryRow[]
}

function periodLabel(start: string | null, end: string | null): string {
  if (!start && !end) return '—'
  return `${start ? formatDate(start) : '…'} – ${end ? formatDate(end) : '…'}`
}

export function PayoutHistoryTable({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No payments recorded yet.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Paid</TableHead>
              <TableHead>Person</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Period</TableHead>
              <TableHead>Note</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.payoutId}>
                <TableCell className="whitespace-nowrap">{formatDateTime(r.paidAt)}</TableCell>
                <TableCell>{r.earnerName}</TableCell>
                <TableCell className="text-right tabular-nums">{formatDOP(r.totalCents)}</TableCell>
                <TableCell>{r.moneyAccountName}</TableCell>
                <TableCell className="whitespace-nowrap">{periodLabel(r.periodStart, r.periodEnd)}</TableCell>
                <TableCell className="max-w-[20rem] truncate text-muted-foreground">
                  {r.notes ?? '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
