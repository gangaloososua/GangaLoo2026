'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { AlertTriangle, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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

import {
  PURCHASE_STATUSES,
  derivedStatus,
  statusMismatch,
  type PurchaseOrderRow,
  type PurchaseStatus,
} from '@/lib/purchases-types'

// shadcn Select forbids "" as a value; sentinel for "no filter".
const ALL_SENTINEL = '__all__'

type CurrentFilters = {
  search: string
  status: string
  supplierId: string
  warehouseId: string
  dateFrom: string
  dateTo: string
  mismatchOnly: boolean
}

type Props = {
  rows: PurchaseOrderRow[]
  total: number
  page: number
  pageSize: number
  suppliers: Array<{ id: string; name: string }>
  warehouses: Array<{ id: string; name: string }>
  currentFilters: CurrentFilters
}

// --- formatting helpers ------------------------------------

function formatDate(iso: string | null): string {
  if (!iso) return 'â€”'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'â€”'
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatUSD(n: number): string {
  return new Intl.NumberFormat('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

function formatDOP(n: number | null): string {
  if (n == null || n === 0) return 'â€”'
  return new Intl.NumberFormat('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

function statusLabel(s: PurchaseStatus): string {
  switch (s) {
    case 'pending': return 'Pending'
    case 'paid_supplier': return 'Paid supplier'
    case 'received': return 'Received'
    case 'complete': return 'Complete'
    default: return s
  }
}

// --- status badge -----------------------------------------

function StatusBadge({ status }: { status: PurchaseStatus }) {
  switch (status) {
    case 'pending':
      return <Badge variant="secondary">Pending</Badge>
    case 'paid_supplier':
      return <Badge variant="outline">Paid supplier</Badge>
    case 'received':
      return <Badge variant="default">Received</Badge>
    case 'complete':
      return (
        <Badge
          variant="default"
          className="bg-green-600 hover:bg-green-600 text-white"
        >
          Complete
        </Badge>
      )
    default:
      return <Badge variant="secondary">{status}</Badge>
  }
}

// --- list table -------------------------------------------

export function PurchasesListTable({
  rows,
  total,
  page,
  pageSize,
  suppliers,
  warehouses,
  currentFilters,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Local search input for snappy typing; URL update is debounced.
  const [searchInput, setSearchInput] = React.useState(currentFilters.search)
  React.useEffect(() => {
    setSearchInput(currentFilters.search)
  }, [currentFilters.search])

  function buildHref(next: Record<string, string | null>): string {
    const params = new URLSearchParams(searchParams?.toString() ?? '')
    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === '' || value === ALL_SENTINEL) {
        params.delete(key)
      } else {
        params.set(key, value)
      }
    }
    const qs = params.toString()
    return qs ? `${pathname}?${qs}` : pathname
  }

  function updateParam(key: string, value: string | null) {
    // Any filter change resets to page 1.
    const href = buildHref({ [key]: value, page: null })
    router.push(href)
  }

  function goToPage(p: number) {
    const href = buildHref({ page: p === 1 ? null : String(p) })
    router.push(href)
  }

  // Debounce search input -> URL.
  React.useEffect(() => {
    if (searchInput === currentFilters.search) return
    const t = setTimeout(() => {
      updateParam('q', searchInput)
    }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput])

  // Pre-compute mismatch state for every visible row so we know
  // whether any row in this page needs the mismatch column at all.
  // (Column header always renders; cells render the pill only when
  // mismatch is true for that row.)
  const rowsWithMismatch = React.useMemo(
    () =>
      rows.map((r) => ({
        row: r,
        derived: derivedStatus(r),
        mismatch: statusMismatch(r),
      })),
    [rows],
  )

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const canPrev = page > 1
  const canNext = page < totalPages

  // Show "Clear filters" link if any non-default filter is set.
  const anyFilter =
    currentFilters.search !== '' ||
    currentFilters.status !== '' ||
    currentFilters.supplierId !== '' ||
    currentFilters.warehouseId !== '' ||
    currentFilters.dateFrom !== '' ||
    currentFilters.dateTo !== '' ||
    currentFilters.mismatchOnly

  return (
    <div className="space-y-4">
      {/* Filter row */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-6">
          <div className="grid gap-1.5">
            <Label htmlFor="po-search" className="text-xs">Search</Label>
            <Input
              id="po-search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Supplier, legacy id, notes..."
              className="w-64"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="po-status" className="text-xs">Status</Label>
            <Select
              value={currentFilters.status || ALL_SENTINEL}
              onValueChange={(v) => updateParam('status', v)}
            >
              <SelectTrigger id="po-status" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_SENTINEL}>All statuses</SelectItem>
                {PURCHASE_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="po-supplier" className="text-xs">Supplier</Label>
            <Select
              value={currentFilters.supplierId || ALL_SENTINEL}
              onValueChange={(v) => updateParam('supplierId', v)}
            >
              <SelectTrigger id="po-supplier" className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_SENTINEL}>All suppliers</SelectItem>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="po-warehouse" className="text-xs">Warehouse</Label>
            <Select
              value={currentFilters.warehouseId || ALL_SENTINEL}
              onValueChange={(v) => updateParam('warehouseId', v)}
            >
              <SelectTrigger id="po-warehouse" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_SENTINEL}>All warehouses</SelectItem>
                {warehouses.map((w) => (
                  <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="po-from" className="text-xs">Ordered from</Label>
            <Input
              id="po-from"
              type="date"
              value={currentFilters.dateFrom}
              onChange={(e) => updateParam('dateFrom', e.target.value || null)}
              className="w-40"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="po-to" className="text-xs">Ordered to</Label>
            <Input
              id="po-to"
              type="date"
              value={currentFilters.dateTo}
              onChange={(e) => updateParam('dateTo', e.target.value || null)}
              className="w-40"
            />
          </div>

          <div className="flex items-center gap-2 pb-2">
            <Switch
              id="po-mismatch"
              checked={currentFilters.mismatchOnly}
              onCheckedChange={(v) => updateParam('mismatch', v ? '1' : null)}
            />
            <Label htmlFor="po-mismatch" className="text-sm">
              Mismatches only
            </Label>
          </div>

          {anyFilter && (
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="pb-2"
            >
              <Link href={pathname}>Clear filters</Link>
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Table or empty state */}
      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No purchases match these filters.
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ordered</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Warehouse</TableHead>
                <TableHead className="text-right">USD total</TableHead>
                <TableHead className="text-right">DOP paid</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Audit</TableHead>
                <TableHead className="w-24 text-right">Manage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rowsWithMismatch.map(({ row: r, mismatch }) => (
                <TableRow key={r.id}>
                  <TableCell className="tabular-nums">
                    {formatDate(r.ordered_at)}
                  </TableCell>
                  <TableCell className="font-medium">
                    {r.supplier_name ?? <span className="text-muted-foreground">â€”</span>}
                  </TableCell>
                  <TableCell className="max-w-[16rem] align-top">
                    {r.order_no ? (
                      <div className="font-medium tabular-nums">{r.order_no}</div>
                    ) : null}
                    {r.legacy_id ? (
                      <div className="text-xs tabular-nums text-muted-foreground">{r.legacy_id}</div>
                    ) : null}
                    {r.notes ? (
                      <div className="whitespace-pre-wrap text-xs text-muted-foreground">
                        {r.notes}
                      </div>
                    ) : null}
                    {!r.order_no && !r.legacy_id && !r.notes ? (
                      <span className="text-muted-foreground">&mdash;</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.warehouse_name ?? 'â€”'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatUSD(r.usd_total)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatDOP(r.dop_paid_total)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={r.status} />
                  </TableCell>
                  <TableCell>
                    {mismatch && (
                      <Badge
                        variant="outline"
                        className="border-amber-500 bg-amber-50 text-amber-900"
                      >
                        <AlertTriangle className="mr-1 size-3" />
                        Mismatch
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/purchases/${r.id}`}>
                        <ExternalLink className="mr-1 size-3.5" />
                        Open
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div>
            Page {page} of {totalPages} Â· {total} {total === 1 ? 'order' : 'orders'}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!canPrev}
              onClick={() => goToPage(page - 1)}
            >
              <ChevronLeft className="mr-1 size-4" />
              Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!canNext}
              onClick={() => goToPage(page + 1)}
            >
              Next
              <ChevronRight className="ml-1 size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
