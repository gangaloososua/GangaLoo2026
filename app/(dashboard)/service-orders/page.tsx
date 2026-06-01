// app/(dashboard)/service-orders/page.tsx
// Service orders (personal-shopper / encargos) — owner/admin only.

import { requireOwner } from '@/lib/auth/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { type ServiceOrder } from '@/lib/service-orders'
import { ServiceOrdersView } from './service-orders-view'

export const dynamic = 'force-dynamic'

async function fetchServiceOrders(): Promise<ServiceOrder[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('service_orders')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as ServiceOrder[]
}

export default async function ServiceOrdersPage() {
  await requireOwner()
  const orders = await fetchServiceOrders()
  return <ServiceOrdersView orders={orders} />
}
