// Round 19 — Discount rules > New > Bulk (server)
// Round 20.1 — also load each product's PRIMARY category, so the
//              searchable ProductPicker can offer its category filter.
// Round 61  — also load the store (warehouse) list, so the bulk form
//              can offer an optional per-store scope.
//
// Renders the bulk-rule form (one level up at
// /discount-rules/new/new-bulk-form.tsx). Fetches the product list,
// the category list (for category-scope rules), the product ->
// primary-category map (for the picker's filter), and the warehouse
// list (for the optional store scope).
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { requireRole } from '@/lib/auth/guard'
import { createClient } from '@/lib/supabase/server'
import { NewBulkRuleForm } from '../new-bulk-form'
export const dynamic = 'force-dynamic'
export default async function NewBulkRulePage() {
  await requireRole(['owner', 'admin'] as const)
  const supabase = await createClient()
  const [productsRes, categoriesRes, primaryRes, warehousesRes] =
    await Promise.all([
      supabase
        .from('products')
        .select('id, name, sku')
        .eq('is_active', true)
        .order('name', { ascending: true }),
      supabase
        .from('categories')
        .select('id, name')
        .order('name', { ascending: true }),
      supabase
        .from('product_categories')
        .select('product_id, category_id')
        .eq('is_primary', true),
      supabase
        .from('warehouses')
        .select('id, name')
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
    name: w.name as string,
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
          New bulk / quantity discount
        </h1>
        <p className="text-sm text-muted-foreground">
          A discount that applies once the customer buys at or above a set
          quantity of a chosen product or category.
        </p>
      </div>
      <NewBulkRuleForm
        products={products}
        categories={categories}
        warehouses={warehouses}
      />
    </div>
  )
}
