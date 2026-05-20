import { Suspense } from 'react'
import { requireRole } from '@/lib/auth/guard'
import {
  listOnlineOrders,
  getOnlineOrderFilterOptions,
} from '@/lib/online-orders'
import { OnlineOrdersListTable } from './list-table'

type SearchParams = {
  trackingStatus?: string
  fulfillmentWarehouseId?: string
  soldAfter?: string
  soldBefore?: string
  page?: string
}

function parsePage(raw: string | undefined): number {
  if (!raw) return 1
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.floor(n)
}

export default async function OnlineOrdersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  await requireRole(['owner', 'admin'] as const)
  const sp = await searchParams
  const trackingStatus = sp.trackingStatus?.trim() || undefined
  const fulfillmentWarehouseId = sp.fulfillmentWarehouseId?.trim() || undefined
  const soldAfter = sp.soldAfter?.trim() || undefined
  const soldBefore = sp.soldBefore?.trim() || undefined
  const page = parsePage(sp.page)
  const perPage = 50

  const [listResult, filterOptions] = await Promise.all([
    listOnlineOrders({
      trackingStatus: trackingStatus ?? null,
      fulfillmentWarehouseId: fulfillmentWarehouseId ?? null,
      soldAfter: soldAfter ?? null,
      soldBefore: soldBefore ?? null,
      page,
      perPage,
    }),
    getOnlineOrderFilterOptions(),
  ])

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Online Orders
          </h1>
          <p className="text-sm text-muted-foreground">
            Orders received from the web shop and admin entry.{' '}
            <span className="tabular-nums">
              {listResult.total} {listResult.total === 1 ? 'order' : 'orders'}
            </span>
            .
          </p>
        </div>
      </div>
      <Suspense>
        <OnlineOrdersListTable
          rows={listResult.rows}
          total={listResult.total}
          page={listResult.page}
          perPage={listResult.perPage}
          warehouses={filterOptions.warehouses}
          trackingStatuses={filterOptions.trackingStatuses}
          currentFilters={{
            trackingStatus: trackingStatus ?? '',
            fulfillmentWarehouseId: fulfillmentWarehouseId ?? '',
            soldAfter: soldAfter ?? '',
            soldBefore: soldBefore ?? '',
          }}
        />
      </Suspense>
    </div>
  )
}
