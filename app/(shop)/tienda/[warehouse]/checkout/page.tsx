// Checkout page for a warehouse store. Reached at /tienda/<warehouse>/checkout
// Collects the customer's details, fulfillment choice (pickup here / pickup at
// another store / delivery) and payment method, and reviews the order.
// A logged-in customer's name/phone/email are pre-filled, and place_storefront_order
// attaches the order to their account (by auth.uid()).
//
// Delivery/pickup fees + bank-transfer details come from the public-config RPC
// (get_store_public_config), which is SECURITY DEFINER so anonymous customers
// can read those specific values without RLS-blocked access to store_config.
// The authoritative fee is recomputed server-side inside place_storefront_order.

import { notFound } from 'next/navigation'
import {
  resolveStoreWarehouse,
  listStoreWarehouses,
  type StoreWarehouse,
} from '@/lib/store/catalog'
import { fetchStorePublicConfig } from '@/lib/store-config'
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

  const { deliveryFees, bankInfo } = await fetchStorePublicConfig()
  const allStores: StoreWarehouse[] = await listStoreWarehouses()

  return (
    <CheckoutView
      warehouseId={warehouse.id}
      warehouseSlug={warehouse.slug}
      warehouseName={warehouse.name}
      stores={allStores}
      deliveryFees={deliveryFees}
      bankInfo={bankInfo}
      initialName={profile?.full_name ?? ''}
      initialPhone={profile?.phone ?? ''}
      initialEmail={profile?.email ?? ''}
    />
  )
}
