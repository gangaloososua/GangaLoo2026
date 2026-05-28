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
import type { OnlineOrderRow } from '@/lib/online-orders'
import {
  StatusBadge,
  trackingBadgeClass,
  saleStatusBadgeClass,
} from './_lib/badges'

const ALL_SENTINEL = '__all__'

type CurrentFilters = {
  trackingStatus: string
  fulfillmentWarehouseId: string
  soldAfter: string
  soldBefore: string
}

type Props = {
  rows: OnlineOrderRow[]
  total: number
  page: number
  perPage: number
  warehouses: Array<{ id: string; name: string }>
  trackingStatuses: string[]
  currentFilters: CurrentFilters
}

// ============================================================
// Formatting helpers (kept here; not yet repeated elsewhere)
// ============================================================

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

function formatDopCents(cents: number): string {
  return new Intl.NumberFormat('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100)
}

// ============================================================
// Main component
// ============================================================

export function OnlineOrdersListTable({
  rows,
  total,
  page,
  perPage,
  warehouses,
  trackingStatuses,
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
            <Label htmlFor="oo-tracking" className="text-xs">
              Tracking
            </Label>
            <Select
              value={currentFilters.trackingStatus || ALL_SENTINEL}
              onValueChange={(v) =>
                updateParam({ trackingStatus: v === ALL_SENTINEL ? null : v })
              }
            >
              <SelectTrigger id="oo-tracking" className="w-[180px]">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_SENTINEL}>All statuses</SelectItem>
                {trackingStatuses.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="oo-warehouse" className="text-xs">
              Warehouse
            </Label>
            <Select
              value={currentFilters.fulfillmentWarehouseId || ALL_SENTINEL}
              onValueChange={(v) =>
                updateParam({
                  fulfillmentWarehouseId: v === ALL_SENTINEL ? null : v,
                })
              }
            >
              <SelectTrigger id="oo-warehouse" className="w-[220px]">
                <SelectValue placeholder="All warehouses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_SENTINEL}>All warehouses</SelectItem>
                {warehouses.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="oo-after" className="text-xs">
              Sold from
            </Label>
            <Input
              id="oo-after"
              type="date"
              value={currentFilters.soldAfter}
              onChange={(e) =>
                updateParam({ soldAfter: e.target.value || null })
              }
              className="w-[160px]"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="oo-before" className="text-xs">
              Sold to
            </Label>
            <Input
              id="oo-before"
              type="date"
              value={currentFilters.soldBefore}
              onChange={(e) =>
                updateParam({ soldBefore: e.target.value || null })
              }
              className="w-[160px]"
            />
          </div>

          <div className="ml-auto">
            <Button asChild>
              <Link href="/online-orders/new">
                <Plus className="mr-1 h-4 w-4" />
                New online order
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
                <TableHead>Sold</TableHead>
                <TableHead>Invoice</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Warehouse</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Tracking</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total (DOP)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    No online orders match these filters.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id} className="cursor-pointer">
                    <TableCell>
                      <Link href={`/online-orders/${r.id}`} className="block">
                        {formatDate(r.soldAt)}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      <Link href={`/online-orders/${r.id}`} className="block">
                        {r.invoiceNumber ?? '—'}
                      </Link>
                    </TableCell>
                  <TableCell>
                      <Link href={`/online-orders/${r.id}`} className="block">
                        {r.customerName ?? (
                          <span className="text-muted-foreground">
                            (no customer)
                          </span>
                        )}
                        {r.sellerName ? (
                          <span className="block text-xs text-muted-foreground">
                            Seller: {r.sellerName}
                          </span>
                        ) : null}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <Link href={`/online-orders/${r.id}`} className="block">
                        {r.fulfillmentWarehouseName}
                      </Link>
                    </TableCell>
                    <TableCell className="capitalize text-muted-foreground">
                      <Link href={`/online-orders/${r.id}`} className="block">
                        {r.fulfillmentMethod}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/online-orders/${r.id}`} className="block">
                        <StatusBadge
                          className={trackingBadgeClass(r.trackingStatus)}
                        >
                          {r.trackingStatus ?? '—'}
                        </StatusBadge>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/online-orders/${r.id}`} className="block">
                        <StatusBadge
                          className={saleStatusBadgeClass(r.saleStatus)}
                        >
                          {r.saleStatus}
                        </StatusBadge>
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <Link href={`/online-orders/${r.id}`} className="block">
                        {formatDopCents(r.totalCents)}
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
