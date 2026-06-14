// app/us/page.tsx
// US shop Phase 2 — public landing/grid. Reads US products via the safe RPC.

import { fetchUsStoreProducts } from '@/lib/us-store'
import { UsShopView } from './us-shop-view'

export const dynamic = 'force-dynamic'

export default async function UsShopPage() {
  const products = await fetchUsStoreProducts()
  return <UsShopView products={products} />
}
