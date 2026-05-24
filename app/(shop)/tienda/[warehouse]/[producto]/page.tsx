// Single product page within a warehouse store.
// Reached at /tienda/<warehouse>/<product-slug>
//   e.g. /tienda/maranatha/13x4-150-12-rojo-vino-lacio-bawei

import { notFound } from 'next/navigation'
import { resolveStoreWarehouse } from '@/lib/store/catalog'
import { fetchStoreProduct } from '@/lib/store/product'
import { ProductView } from './product-view'

export const dynamic = 'force-dynamic'

export default async function ProductPage({
  params,
}: {
  params: Promise<{ warehouse: string; producto: string }>
}) {
  const { warehouse: slug, producto } = await params

  const warehouse = await resolveStoreWarehouse(slug)
  if (!warehouse) notFound()

  const product = await fetchStoreProduct(warehouse, producto)
  if (!product) notFound()

  return <ProductView warehouse={warehouse} product={product} />
}
