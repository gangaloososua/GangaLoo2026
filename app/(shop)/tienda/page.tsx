// Landing / "choose your store" page at /tienda.
// Server component: fetches active stores with their live deals (safe views),
// then renders the interactive bilingual view.

import { listStoreWarehousesWithDeals } from '@/lib/store/catalog'
import { StoreLandingView } from './landing-view'

export const dynamic = 'force-dynamic'

export default async function StoreLandingPage() {
  const stores = await listStoreWarehousesWithDeals()
  return <StoreLandingView stores={stores} />
}
