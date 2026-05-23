'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireAdminCaller } from '@/lib/auth/guard'

export type EditUnpaidSaleItem = {
  product_id: string
  qty: number
  unit_price_cents: number
  discount_cents: number
}

export type EditUnpaidSaleInput = {
  sale_id: string
  items: EditUnpaidSaleItem[]
  discount_cents: number
}

export type EditUnpaidSaleResult = { ok: true } | { ok: false; error: string }

// ---------------------------------------------------------------------------
// editUnpaidSale - product editor for a confirmed, UNPAID sale.
// ---------------------------------------------------------------------------
// Hands the edited cart to the edit_unpaid_sale RPC, which (atomically):
//   - returns the old lines' consumed stock to inventory, clears their stock
//     movements / lot consumption / commissions / discount audit, then
//     deletes the old sale_items
//   - replays confirm_pos_sale's per-item logic for the new items (FIFO
//     consume with allow-but-warn overshoot, COGS, seller commission)
//   - recomputes subtotal / discount / cogs / gross_profit
// The RPC is owner/admin/seller-gated AND hard-gated to status='confirmed'
// AND paid_cents=0, so a paid sale can never be edited in place. We mirror
// the gate in the UI; the RPC is the final authority.
//
// Mirrors confirmPosSale's action shape (requireAdminCaller, light client-
// side validation, friendly no-lots message, then revalidate).
// ---------------------------------------------------------------------------

export async function editUnpaidSale(
  input: EditUnpaidSaleInput,
): Promise<EditUnpaidSaleResult> {
  await requireAdminCaller()

  // Light client-side validation - the RPC validates again; this is just
  // nicer UX before the round-trip.
  if (!input.sale_id) return { ok: false, error: 'Sale id is required.' }
  if (!input.items || input.items.length < 1) {
    return { ok: false, error: 'A sale must keep at least one product.' }
  }
  for (const it of input.items) {
    if (!it.product_id) {
      return { ok: false, error: 'Every line needs a product.' }
    }
    if (!Number.isFinite(it.qty) || it.qty < 1) {
      return { ok: false, error: 'Every quantity must be at least 1.' }
    }
    if (!Number.isFinite(it.unit_price_cents) || it.unit_price_cents < 0) {
      return { ok: false, error: 'Unit price cannot be negative.' }
    }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('edit_unpaid_sale', {
    p_sale_id: input.sale_id,
    p_items: input.items.map((it) => ({
      product_id: it.product_id,
      qty: it.qty,
      unit_price_cents: Math.round(it.unit_price_cents),
      discount_cents: Math.round(it.discount_cents || 0),
    })),
    p_discount_cents: Math.round(input.discount_cents || 0),
  })

  if (error) {
    // Postgres "raise exception" text comes through as error.message.
    const raw = error.message || 'Failed to save the edited sale.'
    const friendly = raw.startsWith('no_lots_for_product:')
      ? 'One of the products has no inventory lots in this sale\u2019s ' +
        'warehouse. Receive stock for it first, then try again.'
      : raw
    return { ok: false, error: friendly }
  }

  revalidatePath(`/sales/${input.sale_id}`)
  revalidatePath('/sales')
  revalidatePath('/money-accounts')
  return { ok: true }
}
