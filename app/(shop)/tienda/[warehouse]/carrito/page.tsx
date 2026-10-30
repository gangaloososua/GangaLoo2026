// Cart page for a warehouse store. Reached at /tienda/<warehouse>/carrito
// The cart contents live client-side (localStorage); this page just resolves
// the warehouse for context and renders the client cart view.

import { notFound } from 'next/navigation'
import { resolveStoreWarehouse } from '@/lib/store/catalog'
import { CartView } from './cart-view'
import { closureFor } from '@/lib/store/closures'
import { ClosedStoreNotice } from '../../closed-store-notice'

export const dynamic = 'force-dynamic'

export default async function CartPage({
  params,
}: {
  params: Promise<{ warehouse: string }>
}) {
  const { warehouse: slug } = await params
  if (closureFor(slug)) return <ClosedStoreNotice slug={slug.toLowerCase()} />
  const warehouse = await resolveStoreWarehouse(slug)
  if (!warehouse) notFound()
  return <CartView warehouseSlug={warehouse.slug} warehouseName={warehouse.name} />
}
