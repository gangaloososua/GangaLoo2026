import { resolveStoreWarehouse } from '@/lib/store/catalog'
import { createClient } from '@/lib/supabase/server'
import { AccountView, type AccountOrder, type CustomerTier } from './account-view'

export const dynamic = 'force-dynamic'

type ProfileShape = {
  full_name?: string | null
  email?: string | null
  phone?: string | null
  role?: string | null
} | null

export default async function Page({
  params,
}: {
  params: Promise<{ warehouse: string }>
}) {
  const { warehouse } = await params
  const wh = await resolveStoreWarehouse(warehouse)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let profile: ProfileShape = null
  let orders: AccountOrder[] = []
  let tier: CustomerTier | null = null
  if (user) {
    const { data } = await supabase.rpc('get_my_customer_profile')
    profile = (data as ProfileShape) ?? null
    const { data: ord } = await supabase.rpc('get_my_orders')
    orders = (ord as AccountOrder[]) ?? []
    const { data: t } = await supabase.rpc('get_my_customer_tier')
    tier = (t as CustomerTier) ?? null
  }

  return (
    <AccountView
      warehouseSlug={warehouse}
      warehouseName={wh?.name ?? ''}
      loggedIn={!!user}
      profile={profile}
      orders={orders}
      tier={tier}
    />
  )
}
