import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { requireOwner } from '@/lib/auth/guard'
import {
  listSuppliersForPicker,
  listCouriersForPicker,
  listProductsGroupedByCategory,
} from '@/lib/purchases'
import {
  listWarehousesForFilter,
  listMoneyAccounts,
} from '@/lib/sales'
import { listAccountCategories } from '@/lib/transactions'
import { NewPurchaseForm } from './new-purchase-form'
export const dynamic = 'force-dynamic'
export default async function NewPurchasePage() {
  await requireOwner()
  const [
    suppliers,
    couriers,
    productGroups,
    warehouses,
    moneyAccounts,
    categories,
  ] = await Promise.all([
    listSuppliersForPicker(),
    listCouriersForPicker(),
    listProductsGroupedByCategory(),
    listWarehousesForFilter(),
    listMoneyAccounts(),
    listAccountCategories(),
  ])
  const expenseCategories = categories.filter((c) => c.type === 'expense')
  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/purchases"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to purchases
        </Link>
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New purchase order</h1>
        <p className="text-sm text-muted-foreground">
          Header, line items, and optional supplier and transport payments in one shot.
        </p>
      </div>
      <NewPurchaseForm
        suppliers={suppliers}
        couriers={couriers}
        productGroups={productGroups}
        warehouses={warehouses}
        moneyAccounts={moneyAccounts}
        categories={expenseCategories}
      />
    </div>
  )
}
