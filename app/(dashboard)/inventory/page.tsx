import { requireAdminCaller } from '@/lib/auth/guard'
import { isOwnerEquivalent } from '@/lib/auth/roles'
import {
  fetchStockOnHand,
  fetchStockMovements,
  fetchInventoryDashboardStats,
  fetchStockByWarehouse,
  fetchStockByCategory,
  listCategoriesForFilter,
  type StockMovementFilters,
} from '@/lib/inventory'
import { listWarehousesForFilter } from '@/lib/sales'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { StockOnHandTable } from './stock-on-hand-table'
import { MovementsLedger } from './movements-ledger'
import { InventoryDashboard } from './inventory-dashboard'

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
    // Sellers / distributors: current stock on hand only, no costs, no history.
    const [stock, sellerWarehouses, sellerCategories] = await Promise.all([
      fetchStockOnHand(),
      listWarehousesForFilter(),
      listCategoriesForFilter(),
    ])
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
          <p className="text-sm text-muted-foreground">
            Current stock on hand across all warehouses.
          </p>
        </div>
        <StockOnHandTable
          rows={stock}
          warehouses={sellerWarehouses}
          categories={sellerCategories.filter((c) => c.parentId === null)}
        />
      </div>
    )
  }

  // Owners / admins: dashboard + stock + full movement ledger, in tabs.
  const sp = await searchParams
  const filters: StockMovementFilters = {
    warehouseId: sp.warehouse || undefined,
    kind: (sp.kind as StockMovementFilters['kind']) || undefined,
    categoryId: sp.category || undefined,
    productId: sp.product || undefined,
    fromDate: sp.from || undefined,
    toDate: sp.to || undefined,
  }

  const [
    stats,
    byWarehouse,
    byCategory,
    stock,
    movements,
    warehouses,
    categories,
  ] = await Promise.all([
    fetchInventoryDashboardStats(),
    fetchStockByWarehouse(),
    fetchStockByCategory(),
    fetchStockOnHand(),
    fetchStockMovements(filters),
    listWarehousesForFilter(),
    listCategoriesForFilter(),
  ])

  // If any history filter is active, open the History tab by default so the
  // user sees the result of the filter they just applied.
  const hasHistoryFilter =
    !!sp.warehouse || !!sp.kind || !!sp.category || !!sp.product || !!sp.from || !!sp.to
  const defaultTab = hasHistoryFilter ? 'history' : 'dashboard'

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
        <p className="text-sm text-muted-foreground">
          Stock levels, value, and movement history across all warehouses.
        </p>
      </div>

      <Tabs defaultValue={defaultTab}>
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="stock">Stock on hand</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="pt-4">
          <InventoryDashboard
            stats={stats}
            byWarehouse={byWarehouse}
            byCategory={byCategory}
          />
        </TabsContent>

        <TabsContent value="stock" className="pt-4">
          <StockOnHandTable
            rows={stock}
            warehouses={warehouses}
            categories={categories.filter((c) => c.parentId === null)}
          />
        </TabsContent>

        <TabsContent value="history" className="pt-4">
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
        </TabsContent>
      </Tabs>
    </div>
  )
}
