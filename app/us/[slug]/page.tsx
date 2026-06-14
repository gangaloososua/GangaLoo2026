// app/us/[slug]/page.tsx
// US shop Phase 2 — single product page (server). Reads via the safe RPC.

import { notFound } from 'next/navigation'
import { fetchUsStoreProduct } from '@/lib/us-store'
import { UsProductView } from './us-product-view'

export const dynamic = 'force-dynamic'

export default async function UsProductPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const product = await fetchUsStoreProduct(slug)
  if (!product) notFound()
  return <UsProductView product={product} />
}
