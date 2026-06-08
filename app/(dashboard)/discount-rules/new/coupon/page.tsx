// Round 42 — Discount rules > New > Coupon (server)
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { requireRole } from '@/lib/auth/guard'
import { createClient } from '@/lib/supabase/server'
import { NewCouponRuleForm } from '../new-coupon-form'

export const dynamic = 'force-dynamic'

export default async function NewCouponRulePage() {
  await requireRole(['owner', 'admin'] as const)
  const supabase = await createClient()

  const warehousesRes = await supabase
    .from('warehouses')
    .select('id, name')
    .eq('is_active', true)
    .order('display_order', { ascending: true })
    .order('name', { ascending: true })
  if (warehousesRes.error) throw warehousesRes.error

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
          New coupon code
        </h1>
        <p className="text-sm text-muted-foreground">
          A code the customer or seller types at checkout for a percentage or
          fixed amount off the whole order. Optionally limit it to one store or
          one channel (online / in-person), and to a date range.
        </p>
      </div>
      <NewCouponRuleForm warehouses={warehouses} />
    </div>
  )
}
