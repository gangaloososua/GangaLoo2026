// Round 15.7 — new online order page
//
// Server component. Fetches all picker data in parallel, then
// hands off to the client form. Reuses the picker fetchers from
// @/lib/sales since online orders share customer/seller/warehouse/
// money_account semantics with POS sales.

import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { requireRole } from '@/lib/auth/guard'
import {
  listCustomersForPicker,
  listSellers,
  getCurrentSeller,
  listWarehousesForFilter,
  listMoneyAccounts,
  listCategoriesForSale,
} from '@/lib/sales'
import { listDiscountRules } from '@/lib/discount-rules'
import { fetchDeliveryFees } from '@/lib/store-config'
import { NewOnlineOrderForm } from './new-online-order-form'

export const dynamic = 'force-dynamic'

export default async function NewOnlineOrderPage() {
  await requireRole(['owner', 'admin'] as const)

  const [customers, sellers, currentSeller, warehouses, moneyAccounts, activeDiscountRules, deliveryFees, categories] =
    await Promise.all([
      listCustomersForPicker(),
      listSellers(),
      getCurrentSeller(),
      listWarehousesForFilter(),
      listMoneyAccounts(),
      listDiscountRules({ activeOnly: true }),
      fetchDeliveryFees(),
      listCategoriesForSale(),
    ])

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/online-orders"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to online orders
        </Link>
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          New online order
        </h1>
        <p className="text-sm text-muted-foreground">
          Set the meta, add products, fill in delivery details, then confirm.
        </p>
      </div>
      <NewOnlineOrderForm
        customers={customers}
        sellers={sellers}
        defaultSellerId={currentSeller?.id ?? null}
        warehouses={warehouses}
        moneyAccounts={moneyAccounts}
        activeDiscountRules={activeDiscountRules}
        deliveryFees={deliveryFees}
        categories={categories}
      />
    </div>
  )
}
