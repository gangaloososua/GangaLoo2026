// app/(dashboard)/us-products/[id]/edit/page.tsx
//
// Edit a US product (admin). Phase 1. Owner-only.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { requireOwner } from '@/lib/auth/guard'
import { getUsProductById } from '@/lib/us-products'
import { UsProductForm, type UsProductInitial } from '../../us-product-form'

export const dynamic = 'force-dynamic'

export default async function EditUsProductPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireOwner()
  const { id } = await params

  const p = await getUsProductById(id)
  if (!p) notFound()

  const initial: UsProductInitial = {
    id: p.id,
    name: p.name,
    sku: p.sku,
    description: p.description,
    supplierCostUsd: p.supplierCostUsd,
    supplierShippingUsd: p.supplierShippingUsd,
    markupPercent: p.markupPercent,
    priceOverrideUsd: p.priceOverrideUsd,
    supplierUrl: p.supplierUrl,
    primaryImageUrl: p.primaryImageUrl,
    category: p.category,
    isActive: p.isActive,
    visibleInStore: p.visibleInStore,
  }

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/us-products"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to US products
        </Link>
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Edit US product
        </h1>
      </div>
      <UsProductForm initial={initial} />
    </div>
  )
}
