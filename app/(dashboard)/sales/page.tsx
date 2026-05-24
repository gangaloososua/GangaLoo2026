import { Suspense } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  listSales,
  listSellersForFilter,
  listWarehousesForFilter,
  type SaleFilters,
  type SaleStatus,
} from '@/lib/sales'
import { SalesFilters } from './sales-filters'
import { SalesTable } from './sales-table'
import { requireAdminCaller } from '@/lib/auth/guard'
import { isOwnerEquivalent } from '@/lib/auth/roles'
import { localeForRole, t, plural } from '@/lib/i18n/dictionary'

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
  const caller = await requireAdminCaller()
  const canSeeAllSales = isOwnerEquivalent(caller.role)
  const locale = localeForRole(caller.role)

  const sp = await searchParams
  const filters = parseFilters(sp)

  // Non-owners only ever see their own sales. Force the seller_id filter
  // and ignore any sellerId in searchParams.
  if (!canSeeAllSales) {
    filters.sellerId = caller.id
  }

  const [salesResult, sellers, warehouses] = await Promise.all([
    listSales(filters),
    canSeeAllSales ? listSellersForFilter() : Promise.resolve([]),
    listWarehousesForFilter(),
  ])

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t(locale, 'sales.title')}</h1>
          <p className="text-sm text-muted-foreground">
            {t(locale, 'sales.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-sm text-muted-foreground">
            {salesResult.total} {plural(locale, salesResult.total, 'sale.one', 'sale.other')}
          </div>
          {canSeeAllSales && (
            <Button asChild size="sm" variant="outline">
              <Link href="/sales/receive-payment">{t(locale, 'sales.receivePayment')}</Link>
            </Button>
          )}
          <Button asChild size="sm">
            <Link href="/sales/new">
              <Plus className="mr-1 size-4" />
              {t(locale, 'sales.newPosSale')}
            </Link>
          </Button>
        </div>
      </div>

      <Suspense>
        <SalesFilters
          sellers={sellers}
          warehouses={warehouses}
          canFilterBySeller={canSeeAllSales}
          locale={locale}
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
        locale={locale}
      />
    </div>
  )
}
