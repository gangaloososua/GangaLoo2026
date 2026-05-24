import { resolveStoreWarehouse } from '@/lib/store/catalog'
import { createClient } from '@/lib/supabase/server'
import { AccountView } from './account-view'

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
  if (user) {
    const { data } = await supabase.rpc('get_my_customer_profile')
    profile = (data as ProfileShape) ?? null
  }

  return (
    <AccountView
      warehouseSlug={warehouse}
      warehouseName={wh?.name ?? ''}
      loggedIn={!!user}
      profile={profile}
    />
  )
}
