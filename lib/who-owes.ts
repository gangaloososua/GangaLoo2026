// Reports - "Who owes me" data layer.
//
// Thin wrapper around the read-only who_owes_me() RPC. One row per person with
// two non-overlapping columns: what they owe as a customer, and what they owe
// as a seller holding Walk-in pay-later cash. All money in CENTS.

import { createClient } from '@/lib/supabase/server'

export type WhoOwesRow = {
  profile_id: string | null
  name: string
  owes_as_customer_cents: number
  owes_as_seller_cents: number
  total_cents: number
}

export type WhoOwesMe = {
  total_owed_cents: number
  customer_owed_cents: number
  seller_owed_cents: number
  people_count: number
  rows: WhoOwesRow[]
}

export async function fetchWhoOwesMe(): Promise<WhoOwesMe> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('who_owes_me')
  if (error) throw new Error(`fetchWhoOwesMe: ${error.message}`)
  return data as WhoOwesMe
}
