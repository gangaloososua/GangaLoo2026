import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import {
  listCustomersForPicker,
  listSellers,
  getCurrentSeller,
  listWarehousesForFilter,
} from '@/lib/sales'
import { NewSaleForm } from './new-sale-form'

export const dynamic = 'force-dynamic'

export default async function NewSalePage() {
  const [customers, sellers, currentSeller, warehouses] = await Promise.all([
    listCustomersForPicker(),
    listSellers(),
    getCurrentSeller(),
    listWarehousesForFilter(),
  ])

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/sales"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to sales
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New POS sale</h1>
        <p className="text-sm text-muted-foreground">
          Set the meta, then add products, take payment, and confirm.
        </p>
      </div>

      <NewSaleForm
        customers={customers}
        sellers={sellers}
        defaultSellerId={currentSeller?.id ?? null}
        warehouses={warehouses}
      />
    </div>
  )
}
