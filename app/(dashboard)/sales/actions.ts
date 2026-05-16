'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type ActionResult = { ok: true } | { ok: false; error: string }

// ---------------------------------------------------------------------------
// Cancel a sale
// ---------------------------------------------------------------------------
// Allowed from: draft, confirmed, partially_paid.
// Disallowed from: paid (must refund first), refunded, cancelled.
//
// We do NOT reverse stock here because:
//   - draft sales never wrote stock movements in the first place
//   - confirmed/partially_paid sales: cancelling without refunding is an
//     edge case the operator opts into knowingly. They can refund instead
//     if they want stock returned.
//
// Commissions: untouched. If they were paid, they stay paid; if pending,
// they stay pending. Operator can void manually in a future commissions UI.
// ---------------------------------------------------------------------------

export async function cancelSale(saleId: string, reason: string): Promise<ActionResult> {
  const supabase = await createClient()

  // Fetch current status to enforce the rule app-side.
  const { data: sale, error: fetchErr } = await supabase
    .from('sales')
    .select('id, status, invoice_number')
    .eq('id', saleId)
    .maybeSingle()

  if (fetchErr) return { ok: false, error: fetchErr.message }
  if (!sale) return { ok: false, error: 'Sale not found.' }

  const allowed = ['draft', 'confirmed', 'partially_paid']
  if (!allowed.includes(sale.status)) {
    return {
      ok: false,
      error: `Can't cancel a sale in status '${sale.status}'. Refund it first if needed.`,
    }
  }

  const trimmedReason = reason.trim()
  const note = trimmedReason ? `Cancelled: ${trimmedReason}` : 'Cancelled'

  const { error: updateErr } = await supabase
    .from('sales')
    .update({
      status: 'cancelled',
      // Stash the reason in delivery_notes as a quick-and-dirty audit until
      // we have a proper audit_log surfacing UI. The schema has audit_log
      // available but we'd need a richer write here.
      delivery_notes: note,
    })
    .eq('id', saleId)

  if (updateErr) return { ok: false, error: updateErr.message }

  revalidatePath(`/sales/${saleId}`)
  revalidatePath('/sales')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Refund a sale
// ---------------------------------------------------------------------------
// Allowed from: confirmed, paid, partially_paid.
//
// Effects:
//   1. status → 'refunded', refunded_at = now(), refund_reason set
//   2. For each sale_lot_consumption row, insert a stock_movements row with
//      kind = 'return_in' and qty_delta = +qty_consumed. This is the audit
//      record of stock returning regardless of the restock option.
//   3. If restockLots = true, also add qty_consumed back to
//      inventory_lots.qty_remaining for each consumed lot.
//   4. Void ALL sale_commissions for this sale, including ones already
//      paid out (creates a clawback debt per Q2 decision).
//
// We don't reverse payments. Customer refund money flow is recorded
// separately as a future negative-payment / refund-payment when 9.5 ships.
// ---------------------------------------------------------------------------

export async function refundSale(
  saleId: string,
  reason: string,
  restockLots: boolean,
): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: sale, error: fetchErr } = await supabase
    .from('sales')
    .select('id, status')
    .eq('id', saleId)
    .maybeSingle()
  if (fetchErr) return { ok: false, error: fetchErr.message }
  if (!sale) return { ok: false, error: 'Sale not found.' }

  const allowed = ['confirmed', 'paid', 'partially_paid']
  if (!allowed.includes(sale.status)) {
    return {
      ok: false,
      error: `Can't refund a sale in status '${sale.status}'.`,
    }
  }

  const trimmedReason = reason.trim()
  if (!trimmedReason) {
    return { ok: false, error: 'Refund reason is required.' }
  }

  // Pull lot consumption rows to generate reversal stock movements.
  // We go via sale_items because sale_lot_consumption has no direct FK to sales.
  const { data: items, error: itemsErr } = await supabase
    .from('sale_items')
    .select(`
      id,
      product_id,
      consumption:sale_lot_consumption (
        id, lot_id, qty_consumed, unit_cost_dop,
        lot:lot_id ( id, warehouse_id, qty_remaining )
      )
    `)
    .eq('sale_id', saleId)

  if (itemsErr) return { ok: false, error: itemsErr.message }

  // Flatten consumption rows + collect lot ids we need to update if restocking.
  type Consumption = {
    sale_item_id: string
    product_id: string
    lot_id: string
    warehouse_id: string
    qty_consumed: number
    unit_cost_dop: number
    current_remaining: number
  }
  const consumptions: Consumption[] = []
  for (const it of (items ?? []) as any[]) {
    for (const c of (it.consumption ?? []) as any[]) {
      if (!c.lot) continue
      consumptions.push({
        sale_item_id: it.id,
        product_id: it.product_id,
        lot_id: c.lot_id,
        warehouse_id: c.lot.warehouse_id,
        qty_consumed: Number(c.qty_consumed),
        unit_cost_dop: Number(c.unit_cost_dop),
        current_remaining: Number(c.lot.qty_remaining),
      })
    }
  }

  // 1. Flip the sale status.
  const { error: saleUpdateErr } = await supabase
    .from('sales')
    .update({
      status: 'refunded',
      refunded_at: new Date().toISOString(),
      refund_reason: trimmedReason,
    })
    .eq('id', saleId)
  if (saleUpdateErr) return { ok: false, error: saleUpdateErr.message }

  // 2. Insert stock_movements (return_in) — audit trail of stock coming back.
  if (consumptions.length > 0) {
    const movementRows = consumptions.map((c) => ({
      product_id: c.product_id,
      warehouse_id: c.warehouse_id,
      lot_id: c.lot_id,
      kind: 'return_in',
      qty_delta: c.qty_consumed,
      unit_cost_dop: c.unit_cost_dop,
      sale_item_id: c.sale_item_id,
      adjustment_reason: `Refund: ${trimmedReason}`,
    }))
    const { error: movErr } = await supabase
      .from('stock_movements')
      .insert(movementRows)
    if (movErr) return { ok: false, error: `Stock movement write failed: ${movErr.message}` }
  }

  // 3. If restocking, bump inventory_lots.qty_remaining for each consumed lot.
  if (restockLots && consumptions.length > 0) {
    // Multiple consumption rows could share a lot — aggregate first.
    const lotBumps = new Map<string, number>()
    for (const c of consumptions) {
      lotBumps.set(c.lot_id, (lotBumps.get(c.lot_id) ?? 0) + c.qty_consumed)
    }
    for (const c of consumptions) {
      const lotId = c.lot_id
      if (!lotBumps.has(lotId)) continue
      const bump = lotBumps.get(lotId)!
      lotBumps.delete(lotId) // only apply once per lot
      const newRemaining = c.current_remaining + bump
      const { error: lotErr } = await supabase
        .from('inventory_lots')
        .update({ qty_remaining: newRemaining })
        .eq('id', lotId)
      if (lotErr) {
        return {
          ok: false,
          error: `Sale refunded and stock movements written, but lot restock failed: ${lotErr.message}. Run the lot adjustment manually.`,
        }
      }
    }
  }

  // 4. Void all commissions for this sale (including paid ones — per Q2).
  // We need sale_item ids first since sale_commissions has no direct FK to sales.
  const saleItemIds = ((items ?? []) as any[]).map((it) => it.id)
  if (saleItemIds.length > 0) {
    const { error: commErr } = await supabase
      .from('sale_commissions')
      .update({ status: 'void' })
      .in('sale_item_id', saleItemIds)
    if (commErr) {
      return {
        ok: false,
        error: `Sale refunded and stock handled, but commission void failed: ${commErr.message}.`,
      }
    }
  }

  revalidatePath(`/sales/${saleId}`)
  revalidatePath('/sales')
  return { ok: true }
}
