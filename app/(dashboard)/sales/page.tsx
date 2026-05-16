import { Suspense } from 'react'
import {
  listSales,
  listSellersForFilter,
  listWarehousesForFilter,
  type SaleFilters,
  type SaleStatus,
} from '@/lib/sales'
import { SalesFilters } from './sales-filters'
import { SalesTable } from './sales-table'

export const dynamic = 'force-dynamic'

type SearchParams = {
  search?: string
  status?: string
  sellerId?: string
  warehouseId?: string
  dateFrom?: string
  dateTo?: string
  page?: string
}

const VALID_STATUSES: SaleStatus[] = [
  'draft',
  'confirmed',
  'paid',
  'partially_paid',
  'refunded',
  'cancelled',
]

function parseFilters(sp: SearchParams): SaleFilters {
  const status =
    sp.status && (VALID_STATUSES as string[]).includes(sp.status)
      ? (sp.status as SaleStatus)
      : undefined
  const pageNum = sp.page ? Number(sp.page) : 1
  const page = Number.isFinite(pageNum) && pageNum > 0 ? Math.floor(pageNum) : 1

  return {
    search: sp.search?.trim() || undefined,
    status,
    sellerId: sp.sellerId || undefined,
    warehouseId: sp.warehouseId || undefined,
    dateFrom: sp.dateFrom || undefined,
    dateTo: sp.dateTo || undefined,
    page,
    pageSize: 50,
  }
}

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const filters = parseFilters(sp)

  const [salesResult, sellers, warehouses] = await Promise.all([
    listSales(filters),
    listSellersForFilter(),
    listWarehousesForFilter(),
  ])

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sales</h1>
          <p className="text-sm text-muted-foreground">
            In-person POS sales. Online orders live in their own module.
          </p>
        </div>
        <div className="text-sm text-muted-foreground">
          {salesResult.total} {salesResult.total === 1 ? 'sale' : 'sales'}
        </div>
      </div>

      <Suspense>
        <SalesFilters
          sellers={sellers}
          warehouses={warehouses}
          currentFilters={{
            search: filters.search ?? '',
            status: filters.status ?? '',
            sellerId: filters.sellerId ?? '',
            warehouseId: filters.warehouseId ?? '',
            dateFrom: filters.dateFrom ?? '',
            dateTo: filters.dateTo ?? '',
          }}
        />
      </Suspense>

      <SalesTable
        rows={salesResult.rows}
        total={salesResult.total}
        page={salesResult.page}
        pageSize={salesResult.pageSize}
      />
    </div>
  )
}
