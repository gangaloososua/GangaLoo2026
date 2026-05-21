import { requireAdminCaller } from '@/lib/auth/guard'
import { isOwnerEquivalent } from '@/lib/auth/roles'
import {
  fetchStockOnHand,
  fetchStockMovements,
  listCategoriesForFilter,
  type StockMovementFilters,
} from '@/lib/inventory'
import { listWarehousesForFilter } from '@/lib/sales'
import { StockOnHandTable } from './stock-on-hand-table'
import { MovementsLedger } from './movements-ledger'

export const dynamic = 'force-dynamic'

type SearchParams = {
  warehouse?: string
  kind?: string
  category?: string
  product?: string
  from?: string
  to?: string
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const caller = await requireAdminCaller()
  const isOwner = isOwnerEquivalent(caller.role)

  if (!isOwner) {
    // Sellers / distributors: current stock on hand, no costs, no history.
    const stock = await fetchStockOnHand()
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
          <p className="text-sm text-muted-foreground">
            Current stock on hand across all warehouses.
          </p>
        </div>
        <StockOnHandTable rows={stock} />
      </div>
    )
  }

  // Owners / admins: the full movement ledger with filters.
  const sp = await searchParams
  const filters: StockMovementFilters = {
    warehouseId: sp.warehouse || undefined,
    kind: (sp.kind as StockMovementFilters['kind']) || undefined,
    categoryId: sp.category || undefined,
    productId: sp.product || undefined,
    fromDate: sp.from || undefined,
    toDate: sp.to || undefined,
  }
  const [movements, warehouses, categories] = await Promise.all([
    fetchStockMovements(filters),
    listWarehousesForFilter(),
    listCategoriesForFilter(),
  ])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
        <p className="text-sm text-muted-foreground">
          Movement history across all warehouses. Showing the most recent 500
          movements; use the filters to narrow down.
        </p>
      </div>
      <MovementsLedger
        rows={movements}
        warehouses={warehouses}
        categories={categories}
        current={{
          warehouse: sp.warehouse ?? '',
          kind: sp.kind ?? '',
          category: sp.category ?? '',
          product: sp.product ?? '',
          from: sp.from ?? '',
          to: sp.to ?? '',
        }}
      />
    </div>
  )
}