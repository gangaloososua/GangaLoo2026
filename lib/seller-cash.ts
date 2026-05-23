// Round 26a — seller cash reconcile data layer.
//
// Reads the 'held' rows from seller_cash_collections (cash a seller has
// collected in the field but not yet handed in), joins invoice + seller name,
// and groups them per seller with a running total. Owner/admin only in
// practice — the RLS select policy lets them see every row; a seller would
// only ever see their own, but this screen is nav-gated to owner/admin.
//
// Money is in CENTS throughout.

import { createClient } from '@/lib/supabase/server'

export type HeldCollection = {
  id: string
  sale_id: string
  invoice_number: string | null
  amount_cents: number
  note: string | null
  collected_at: string
}

export type SellerHeldGroup = {
  seller_id: string
  seller_name: string
  total_cents: number
  collections: HeldCollection[]
}

export async function listHeldSellerCash(): Promise<SellerHeldGroup[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('seller_cash_collections')
    .select(
      `
      id,
      sale_id,
      amount_cents,
      note,
      collected_at,
      seller:seller_id ( id, full_name ),
      sale:sale_id ( invoice_number )
    `,
    )
    .eq('status', 'held')
    .order('collected_at', { ascending: true })

  if (error) throw new Error(`listHeldSellerCash: ${error.message}`)

  const groups = new Map<string, SellerHeldGroup>()
  for (const row of (data ?? []) as any[]) {
    const sellerId = row.seller?.id ?? row.seller_id ?? 'unknown'
    const sellerName = row.seller?.full_name ?? '—'
    let g = groups.get(sellerId)
    if (!g) {
      g = { seller_id: sellerId, seller_name: sellerName, total_cents: 0, collections: [] }
      groups.set(sellerId, g)
    }
    const amount = Number(row.amount_cents) || 0
    g.total_cents += amount
    g.collections.push({
      id: row.id,
      sale_id: row.sale_id,
      invoice_number: row.sale?.invoice_number ?? null,
      amount_cents: amount,
      note: row.note ?? null,
      collected_at: row.collected_at,
    })
  }

  // Most cash held first; ties broken by name.
  return Array.from(groups.values()).sort(
    (a, b) => b.total_cents - a.total_cents || a.seller_name.localeCompare(b.seller_name),
  )
}
