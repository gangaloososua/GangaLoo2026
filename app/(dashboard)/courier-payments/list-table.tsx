'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { CourierPaymentRow } from '@/lib/courier-payments'

const ALL_SENTINEL = '__all__'

type CurrentFilters = {
  courierId: string
  paidAfter: string
  paidBefore: string
}

type Props = {
  rows: CourierPaymentRow[]
  total: number
  page: number
  perPage: number
  couriers: Array<{ id: string; name: string }>
  currentFilters: CurrentFilters
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatDop(n: number): string {
  return new Intl.NumberFormat('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

export function CourierPaymentsListTable({
  rows,
  total,
  page,
  perPage,
  couriers,
  currentFilters,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const updateParam = React.useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString())
      for (const [k, v] of Object.entries(updates)) {
        if (v == null || v === '') next.delete(k)
        else next.set(k, v)
      }
      // Any filter change resets page to 1 unless page itself is being set.
      if (!('page' in updates)) next.delete('page')
      const qs = next.toString()
      router.push(qs ? `${pathname}?${qs}` : pathname)
    },
    [pathname, router, searchParams],
  )

  const totalPages = Math.max(1, Math.ceil(total / perPage))
  const canPrev = page > 1
  const canNext = page < totalPages

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 py-4">
          <div className="grid gap-1.5">
            <Label htmlFor="cp-courier" className="text-xs">
              Courier
            </Label>
            <Select
              value={currentFilters.courierId || ALL_SENTINEL}
              onValueChange={(v) =>
                updateParam({ courierId: v === ALL_SENTINEL ? null : v })
              }
            >
              <SelectTrigger id="cp-courier" className="w-[200px]">
                <SelectValue placeholder="All couriers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_SENTINEL}>All couriers</SelectItem>
                {couriers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="cp-after" className="text-xs">
              Paid from
            </Label>
            <Input
              id="cp-after"
              type="date"
              value={currentFilters.paidAfter}
              onChange={(e) =>
                updateParam({ paidAfter: e.target.value || null })
              }
              className="w-[160px]"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="cp-before" className="text-xs">
              Paid to
            </Label>
            <Input
              id="cp-before"
              type="date"
              value={currentFilters.paidBefore}
              onChange={(e) =>
                updateParam({ paidBefore: e.target.value || null })
              }
              className="w-[160px]"
            />
          </div>

          <div className="ml-auto">
            <Button asChild>
              <Link href="/courier-payments/new">
                <Plus className="mr-1 h-4 w-4" />
                New courier payment
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Paid</TableHead>
                <TableHead>Courier</TableHead>
                <TableHead className="text-right">Amount (DOP)</TableHead>
                <TableHead className="text-right">POs</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Reference</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    No courier payments match these filters.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id} className="cursor-pointer">
                    <TableCell>
                      <Link
                        href={`/courier-payments/${r.id}`}
                        className="block"
                      >
                        {formatDate(r.paidAt)}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/courier-payments/${r.id}`}
                        className="block"
                      >
                        {r.courierName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <Link
                        href={`/courier-payments/${r.id}`}
                        className="block"
                      >
                        {formatDop(r.amountDopTotal)}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <Link
                        href={`/courier-payments/${r.id}`}
                        className="block"
                      >
                        {r.allocationCount}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <Link
                        href={`/courier-payments/${r.id}`}
                        className="block"
                      >
                        {r.moneyAccountName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <Link
                        href={`/courier-payments/${r.id}`}
                        className="block"
                      >
                        {r.reference ?? '—'}
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div>
            Page <span className="tabular-nums">{page}</span> of{' '}
            <span className="tabular-nums">{totalPages}</span>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!canPrev}
              onClick={() => updateParam({ page: String(page - 1) })}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!canNext}
              onClick={() => updateParam({ page: String(page + 1) })}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
