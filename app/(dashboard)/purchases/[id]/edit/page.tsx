import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'

import { requireOwner } from '@/lib/auth/guard'
import {
  getPurchaseOrder,
  getPurchaseOrderItems,
  getTransportSummaryForOrder,
  listSuppliersForPicker,
  listProductsGroupedByCategory,
} from '@/lib/purchases'
import { listWarehousesForFilter } from '@/lib/sales'

import { EditPurchaseForm } from './edit-purchase-form'

export const dynamic = 'force-dynamic'

export default async function EditPurchasePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireOwner()
  const { id } = await params

  const order = await getPurchaseOrder(id)
  if (!order) notFound()

  // Defense in depth — the RPC also rejects these, but a server-side
  // redirect avoids the user spending time editing an order that can't save.
  if (order.status !== 'pending') {
    redirect(`/purchases/${id}`)
  }
  const transport = await getTransportSummaryForOrder(id)
  if (transport.allocation_count > 0) {
    redirect(`/purchases/${id}`)
  }

  const [items, suppliers, productGroups, warehouses] = await Promise.all([
    getPurchaseOrderItems(id),
    listSuppliersForPicker(),
    listProductsGroupedByCategory(),
    listWarehousesForFilter(),
  ])

  return (
    <div className="space-y-4">
      <div>
        <Link
          href={`/purchases/${id}`}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to order
        </Link>
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Edit purchase order
        </h1>
        <p className="text-sm text-muted-foreground">
          Change items, supplier, warehouse, dates and adjustments. Available
          while the order is pending and no transport is allocated.
        </p>
      </div>
      <EditPurchaseForm
        order={order}
        items={items}
        suppliers={suppliers}
        productGroups={productGroups}
        warehouses={warehouses}
      />
    </div>
  )
}
