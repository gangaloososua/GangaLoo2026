import Link from 'next/link'
import { Suspense } from 'react'

import { requireOwner } from '@/lib/auth/guard'
import {
  listPurchaseOrders,
  getPurchaseFilterOptions,
  PURCHASE_STATUSES,
  type PurchaseStatus,
} from '@/lib/purchases'

import { Button } from '@/components/ui/button'
 import { PurchasesListTable } from './list-table'

type SearchParams = {
  q?: string
  status?: string
  supplierId?: string
  warehouseId?: string
  dateFrom?: string
  dateTo?: string
  mismatch?: string
  page?: string
}

function parsePage(raw: string | undefined): number {
  if (!raw) return 1
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.floor(n)
}

function parseStatus(raw: string | undefined): PurchaseStatus | undefined {
  if (!raw) return undefined
  return (PURCHASE_STATUSES as readonly string[]).includes(raw)
    ? (raw as PurchaseStatus)
    : undefined
}

export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  await requireOwner()
  const sp = await searchParams

  const search = sp.q?.trim() ?? ''
  const status = parseStatus(sp.status)
  const supplierId = sp.supplierId?.trim() || undefined
  const warehouseId = sp.warehouseId?.trim() || undefined
  const dateFrom = sp.dateFrom?.trim() || undefined
  const dateTo = sp.dateTo?.trim() || undefined
  const mismatchOnly = sp.mismatch === '1'
  const page = parsePage(sp.page)
  const pageSize = 50

  const [listResult, filterOptions] = await Promise.all([
    listPurchaseOrders({
      search: search || undefined,
      status,
      supplierId,
      warehouseId,
      dateFrom,
      dateTo,
      mismatchOnly,
      page,
      pageSize,
    }),
    getPurchaseFilterOptions(),
  ])

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Purchases
          </h1>
          <p className="text-sm text-muted-foreground">
            Where the stock came from.{' '}
            <span className="tabular-nums">
              {listResult.total} {listResult.total === 1 ? 'order' : 'orders'}
            </span>
            {mismatchOnly ? ' with status mismatches' : ''}.
          </p>
        </div>
        <Button asChild>
          <Link href="/purchases/new">New purchase order</Link>
        </Button>
      </div>

      <Suspense>
        <PurchasesListTable
          rows={listResult.rows}
          total={listResult.total}
          page={listResult.page}
          pageSize={listResult.pageSize}
          suppliers={filterOptions.suppliers}
          warehouses={filterOptions.warehouses}
          currentFilters={{
            search,
            status: status ?? '',
            supplierId: supplierId ?? '',
            warehouseId: warehouseId ?? '',
            dateFrom: dateFrom ?? '',
            dateTo: dateTo ?? '',
            mismatchOnly,
          }}
        />
      </Suspense>
    </div>
  )
}
