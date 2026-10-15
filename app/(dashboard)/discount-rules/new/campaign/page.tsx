// Round 80b - Discount rules > New > Seasonal campaign (server)
//
// Loads products (+ each product's PRIMARY category for the picker filter),
// categories and active stores, then renders the campaign form.
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { requireRole } from '@/lib/auth/guard'
import { createClient } from '@/lib/supabase/server'
import { selectAll } from '@/lib/fetch-all'
import { NewCampaignForm } from '../new-campaign-form'

export const dynamic = 'force-dynamic'

export default async function NewCampaignPage() {
  await requireRole(['owner', 'admin'] as const)
  const supabase = await createClient()
  const [productsRes, categoriesRes, primaryRes, warehousesRes] = await Promise.all([
    selectAll((from, to) =>
      supabase
        .from('products')
        .select('id, name, sku')
        .eq('is_active', true)
        .order('name', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
    ),
    supabase.from('categories').select('id, name').order('name', { ascending: true }),
    selectAll((from, to) =>
      supabase
        .from('product_categories')
        .select('product_id, category_id')
        .eq('is_primary', true)
        .order('product_id', { ascending: true })
        .order('category_id', { ascending: true })
        .range(from, to),
    ),
    supabase
      .from('warehouses')
      .select('id, name')
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .order('name', { ascending: true }),
  ])
  if (productsRes.error) throw productsRes.error
  if (categoriesRes.error) throw categoriesRes.error
  if (primaryRes.error) throw primaryRes.error
  if (warehousesRes.error) throw warehousesRes.error

  const primaryByProduct = new Map<string, string>()
  for (const row of primaryRes.data ?? []) {
    primaryByProduct.set(row.product_id as string, row.category_id as string)
  }

  const products = (productsRes.data ?? []).map((p) => ({
    id: p.id as string,
    name: p.name as string,
    sku: p.sku as string,
    primaryCategoryId: primaryByProduct.get(p.id as string) ?? null,
  }))
  const categories = (categoriesRes.data ?? []).map((c) => ({
    id: c.id as string,
    name: c.name as string,
  }))
  const warehouses = (warehousesRes.data ?? []).map((w) => ({
    id: w.id as string,
    name: (w.name as string).replace(/^\s*\d+\s*[-–—]\s*/, '').trim(),
  }))

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/discount-rules/new"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to rule kinds
        </Link>
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          🎃 New seasonal campaign
        </h1>
        <p className="text-sm text-muted-foreground">
          One discount % on several products for a season (e.g. Halloween).
          Creates one promotion per product; the online store shows them in a
          themed box until the end date.
        </p>
      </div>
      <NewCampaignForm products={products} categories={categories} warehouses={warehouses} />
    </div>
  )
}
