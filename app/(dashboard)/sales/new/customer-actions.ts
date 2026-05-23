'use server'

import { createClient } from '@/lib/supabase/server'
import { requireAdminCaller } from '@/lib/auth/guard'
import type { CustomerPickerItem } from '@/lib/sales'

export type QuickCustomerResult =
  | { ok: true; customer: CustomerPickerItem }
  | { ok: false; error: string }

// Quick-add a customer from the POS. Calls the SECURITY DEFINER RPC so a
// seller/distributor (not just owner/admin) can create one mid-order. Returns
// the new customer shaped as a CustomerPickerItem so the cart can select it
// immediately.
export async function createCustomerQuick(input: {
  full_name: string
  phone?: string | null
  email?: string | null
}): Promise<QuickCustomerResult> {
  await requireAdminCaller()

  const name = input.full_name?.trim()
  if (!name) return { ok: false, error: 'Name is required.' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('create_customer_quick', {
    p_full_name: name,
    p_phone: input.phone?.trim() || null,
    p_email: input.email?.trim() || null,
  })
  if (error) return { ok: false, error: error.message }

  const c = data as {
    id: string
    full_name: string
    email: string | null
    phone: string | null
    club_tier: string | null
  } | null
  if (!c?.id) return { ok: false, error: 'Unexpected response creating customer.' }

  return {
    ok: true,
    customer: {
      id: c.id,
      full_name: c.full_name,
      email: c.email,
      club_tier: c.club_tier,
    },
  }
}
