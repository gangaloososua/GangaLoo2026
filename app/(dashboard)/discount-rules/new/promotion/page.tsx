// Round 20 — Discount rules > New > Promotion (server)
//
// Renders the promotion-rule form (one level up at
// /discount-rules/new/new-promotion-form.tsx). Fetches only the
// product list (a promotion is product-scoped: no category, no
// minimum quantity).
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { requireRole } from '@/lib/auth/guard'
import { createClient } from '@/lib/supabase/server'
import { NewPromotionRuleForm } from '../new-promotion-form'
export const dynamic = 'force-dynamic'
export default async function NewPromotionRulePage() {
  await requireRole(['owner', 'admin'] as const)
  const supabase = await createClient()
  const productsRes = await supabase
    .from('products')
    .select('id, name, sku')
    .eq('is_active', true)
    .order('name', { ascending: true })
  if (productsRes.error) throw productsRes.error
  const products = (productsRes.data ?? []).map((p) => ({
    id: p.id as string,
    name: p.name as string,
    sku: p.sku as string,
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
          New promotion (daily / weekly deal)
        </h1>
        <p className="text-sm text-muted-foreground">
          A limited-time % off a single product, for everyone including
          walk-ins, with no minimum quantity. Set the date range to make it a
          daily or weekly deal.
        </p>
      </div>
      <NewPromotionRuleForm products={products} />
    </div>
  )
}
