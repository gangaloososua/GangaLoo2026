'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Pencil, Trash2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
import { RateFormDialog } from './rate-form-dialog'
import { deleteRate } from './actions'
import type { ExchangeRate } from '@/lib/exchange-rates'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function monthLabel(month: number): string {
  return MONTH_NAMES[month - 1] ?? String(month)
}

function nextMonthAfter(rows: ExchangeRate[]): { year: number; month: number } {
  if (rows.length === 0) {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() + 1 }
  }
  // rows are sorted desc, first row is latest
  const latest = rows[0]
  let m = latest.month + 1
  let y = latest.year
  if (m > 12) {
    m = 1
    y += 1
  }
  return { year: y, month: m }
}

export function RatesTable({ rows }: { rows: ExchangeRate[] }) {
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const next = nextMonthAfter(rows)

  function onDelete(year: number, month: number) {
    const key = `${year}-${month}`
    setPendingKey(key)
    startTransition(async () => {
      const result = await deleteRate(year, month)
      setPendingKey(null)
      if (result.ok) {
        toast.success('Rate deleted.')
      } else {
        toast.error(result.error ?? 'Failed to delete rate.')
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {rows.length} {rows.length === 1 ? 'rate' : 'rates'} on file.
        </p>
        <RateFormDialog
          mode={{ kind: 'create', defaultYear: next.year, defaultMonth: next.month }}
          trigger={
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Add rate
            </Button>
          }
        />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Month</TableHead>
              <TableHead className="text-right">Rate (DOP / USD)</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="w-32 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-sm text-muted-foreground">
                  No exchange rates yet. Add the first one to get started.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const key = `${row.year}-${row.month}`
                const isPending = pendingKey === key
                return (
                  <TableRow key={key}>
                    <TableCell className="font-medium">
                      {monthLabel(row.month)} {row.year}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {row.rate.toFixed(4)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.source ?? '—'}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground">
                      {row.notes ?? '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <RateFormDialog
                          mode={{ kind: 'edit', row }}
                          trigger={
                            <Button variant="ghost" size="icon" aria-label="Edit rate">
                              <Pencil className="h-4 w-4" />
                            </Button>
                          }
                        />
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Delete rate"
                              disabled={isPending}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                Delete rate for {monthLabel(row.month)} {row.year}?
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                Products with this month in their Calculator state will keep their
                                stored exchange rate, but no fallback will be available for new
                                calculations targeting this month.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => onDelete(row.year, row.month)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
