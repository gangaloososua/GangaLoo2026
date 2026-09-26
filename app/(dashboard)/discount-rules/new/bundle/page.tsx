// Round 85 — Discount rules > New > Bundle (server)
//
// Loads products (with regular price, for the form's savings preview),
// categories + each product's PRIMARY category (for the picker filter),
// and the store list (optional per-store scope).
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { requireRole } from '@/lib/auth/guard'
import { createClient } from '@/lib/supabase/server'
import { NewBundleRuleForm } from '../new-bundle-form'
export const dynamic = 'force-dynamic'
export default async function NewBundleRulePage() {
  await requireRole(['owner', 'admin'] as const)
  const supabase = await createClient()
  const [productsRes, categoriesRes, primaryRes, warehousesRes] =
    await Promise.all([
      supabase
        .from('products')
        .select('id, name, sku, price_cents')
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
  const priceById: Record<string, number> = {}
  for (const p of productsRes.data ?? []) {
    priceById[p.id as string] = Number(p.price_cents ?? 0)
  }
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
        <h1 className="text-2xl font-semibold tracking-tight">New bundle</h1>
        <p className="text-sm text-muted-foreground">
          A set total price for specific products bought together.
        </p>
      </div>
      <NewBundleRuleForm
        products={products}
        categories={categories}
        warehouses={warehouses}
        priceById={priceById}
      />
    </div>
  )
}
