import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { requireOwner } from '@/lib/auth/guard'
import { createClient } from '@/lib/supabase/server'
import { fetchDeliveryFees } from '@/lib/store-config'
import { DeliveryFeesForm } from './delivery-fees-form'

export const dynamic = 'force-dynamic'

export default async function DeliveryFeesSettingsPage() {
  await requireOwner()
  const fees = await fetchDeliveryFees()

  const supabase = await createClient()
  const { data: warehouseRows } = await supabase
    .from('warehouses')
    .select('id, name')
    .eq('is_active', true)
    .order('display_order', { ascending: true })
    .order('name', { ascending: true })

  const warehouses = (warehouseRows ?? []).map((w) => ({
    id: w.id as string,
    name: w.name as string,
  }))

  return (
    <div className="space-y-4 max-w-3xl">
      <Link
        href="/settings"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to settings
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Delivery &amp; Pickup Fees
        </h1>
        <p className="text-sm text-muted-foreground">
          Set the delivery fee for local and national orders, list which
          cities count as local, and set pickup fees for collecting an order
          at a different warehouse than it was ordered from. These fill the
          shipping fee automatically at checkout; the seller can still
          override it on any order.
        </p>
      </div>
      <DeliveryFeesForm fees={fees} warehouses={warehouses} />
    </div>
  )
}