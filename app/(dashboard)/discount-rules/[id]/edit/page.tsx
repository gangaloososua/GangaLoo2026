// Discount rules > [id] > Edit (server)
//
// Loads one promotion rule plus the same product/category/warehouse data the
// New > Promotion page loads, then renders the pre-filled edit form.
// Only promotion rules are editable here; anything else 404s.
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { requireRole } from '@/lib/auth/guard'
import { createClient } from '@/lib/supabase/server'
import { getDiscountRuleById } from '@/lib/discount-rules'
import {
  EditPromotionRuleForm,
  type EditPromotionInitial,
} from '../../edit/edit-promotion-form'

export const dynamic = 'force-dynamic'

export default async function EditDiscountRulePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireRole(['owner', 'admin'] as const)
  const { id } = await params

  const rule = await getDiscountRuleById(id)
  if (!rule || rule.kind !== 'promotion') notFound()

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

  const initial: EditPromotionInitial = {
    ruleId: rule.id,
    name: rule.name,
    productId: rule.scopeProductId ?? '',
    percent: rule.deltaPercent ?? 0,
    warehouseId: rule.scopeWarehouseId,
    dealSlot: rule.dealSlot,
    startsAt: rule.startsAt,
    endsAt: rule.endsAt,
    priority: rule.priority,
  }

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/discount-rules"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to discount rules
        </Link>
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Edit promotion (daily / weekly deal)
        </h1>
        <p className="text-sm text-muted-foreground">
          Change the product, discount, store, or dates and save. This reuses
          the same rule instead of creating a new one.
        </p>
      </div>
      <EditPromotionRuleForm
        products={products}
        categories={categories}
        warehouses={warehouses}
        initial={initial}
      />
    </div>
  )
}
