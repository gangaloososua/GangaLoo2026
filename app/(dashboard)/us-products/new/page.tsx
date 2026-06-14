// app/(dashboard)/us-products/new/page.tsx
//
// New US product (admin). Phase 1. Owner-only.

import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { requireOwner } from '@/lib/auth/guard'
import { UsProductForm } from '../us-product-form'

export const dynamic = 'force-dynamic'

export default async function NewUsProductPage() {
  await requireOwner()
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
          New US product
        </h1>
        <p className="text-sm text-muted-foreground">
          Add a dropship product for the US shop. The selling price is computed
          from supplier cost + shipping + markup (or a manual override).
        </p>
      </div>
      <UsProductForm />
    </div>
  )
}
