// Checkout page for a warehouse store. Reached at /tienda/<warehouse>/checkout
// Collects the customer's details and fulfillment choice and reviews the order.
// A logged-in customer's name/phone/email are pre-filled, and place_storefront_order
// attaches the order to their account (by auth.uid()).

import { notFound } from 'next/navigation'
import { resolveStoreWarehouse } from '@/lib/store/catalog'
import { createClient } from '@/lib/supabase/server'
import { CheckoutView } from './checkout-view'

export const dynamic = 'force-dynamic'

type ProfileShape = {
  full_name?: string | null
  email?: string | null
  phone?: string | null
} | null

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ warehouse: string }>
}) {
  const { warehouse: slug } = await params
  const warehouse = await resolveStoreWarehouse(slug)
  if (!warehouse) notFound()

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
    <CheckoutView
      warehouseSlug={warehouse.slug}
      warehouseName={warehouse.name}
      initialName={profile?.full_name ?? ''}
      initialPhone={profile?.phone ?? ''}
      initialEmail={profile?.email ?? ''}
    />
  )
}
