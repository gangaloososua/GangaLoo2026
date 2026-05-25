// Public storefront for ONE warehouse, reached at /tienda/<slug>
//   e.g. /tienda/maranatha   /tienda/montellano
// No auth: this is a public page. It resolves the warehouse from the slug,
// loads that warehouse's catalog, and renders the client store UI.

import { notFound } from 'next/navigation'
import {
  resolveStoreWarehouse,
  fetchStoreCatalog,
  listStoreWarehouses,
} from '@/lib/store/catalog'
import { StorePage } from './store-page'

export const dynamic = 'force-dynamic'

export default async function WarehouseStorePage({
  params,
}: {
  params: Promise<{ warehouse: string }>
}) {
  const { warehouse: slug } = await params
  const warehouse = await resolveStoreWarehouse(slug)
  if (!warehouse) notFound()

  const [catalog, stores] = await Promise.all([
    fetchStoreCatalog(warehouse),
    listStoreWarehouses(),
  ])
  return <StorePage catalog={catalog} stores={stores} />
}
