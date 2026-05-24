// Checkout page for a warehouse store. Reached at /tienda/<warehouse>/checkout
// Collects the customer's details and fulfillment choice and reviews the order.
// (Submitting to your real sales engine is wired in the next step.)

import { notFound } from 'next/navigation'
import { resolveStoreWarehouse } from '@/lib/store/catalog'
import { CheckoutView } from './checkout-view'

export const dynamic = 'force-dynamic'

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ warehouse: string }>
}) {
  const { warehouse: slug } = await params
  const warehouse = await resolveStoreWarehouse(slug)
  if (!warehouse) notFound()
  return (
    <CheckoutView warehouseSlug={warehouse.slug} warehouseName={warehouse.name} />
  )
}
