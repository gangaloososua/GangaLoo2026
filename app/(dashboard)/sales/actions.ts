'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  searchProductsForSale,
  type ProductSearchResult,
} from '@/lib/sales'
import { requireOwner, requireAdminCaller } from '@/lib/auth/guard'
import { maybeCreateEncargoFromSale } from '@/lib/pos-encargo-bridge'
import { maybeNotifyRegisterSale } from '@/lib/pos-sale-notify'

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
  await requireOwner()
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
  await requireOwner()
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

// ---------------------------------------------------------------------------
// Record a payment against a sale
// ---------------------------------------------------------------------------
// Inserts a sale_payments row, then recomputes sales.paid_cents and
// derives the new status from the sum of all payments vs total_cents.
//
// Allowed from: confirmed, paid, partially_paid.
// Rejected from: draft (need to confirm first), cancelled, refunded.
//
// Overpayment is allowed — status stays 'paid' and the PaymentsPanel
// surfaces an "Overpaid" line. This matches real-world POS where a
// customer hands over 2500 to pay 2475 and the extra 25 is just there
// in the till.
// ---------------------------------------------------------------------------

export type RecordPaymentInput = {
  saleId: string
  method: 'cash' | 'card' | 'transfer' | 'paypal' | 'stripe' | 'credit' | 'mixed'
  amountCents: number
  moneyAccountId: string
  paidAt: string // ISO datetime or YYYY-MM-DD (Postgres coerces)
  reference?: string
}

export async function recordPayment(input: RecordPaymentInput): Promise<ActionResult> {
  await requireOwner()
  const supabase = await createClient()

  // Basic validation
  if (!input.saleId) return { ok: false, error: 'Sale id is required.' }
  if (!input.moneyAccountId) return { ok: false, error: 'Pick a money account.' }
  if (!Number.isFinite(input.amountCents) || input.amountCents <= 0) {
    return { ok: false, error: 'Amount must be greater than zero.' }
  }
  if (!input.paidAt) return { ok: false, error: 'Payment date is required.' }

  // Check the sale's current status.
  const { data: sale, error: fetchErr } = await supabase
    .from('sales')
    .select('id, status, total_cents, paid_cents, paid_at')
    .eq('id', input.saleId)
    .maybeSingle()
  if (fetchErr) return { ok: false, error: fetchErr.message }
  if (!sale) return { ok: false, error: 'Sale not found.' }

  const allowed = ['confirmed', 'paid', 'partially_paid']
  if (!allowed.includes(sale.status)) {
    return {
      ok: false,
      error: `Can't add a payment to a sale in status '${sale.status}'.`,
    }
  }

  // Route a single-invoice payment through the shared, ledger-posting engine
  // (receive_payment) as a one-item allocation. This creates a payment_receipts
  // row, posts to the ledger via post_sale_payment_to_ledger (account credited,
  // income booked under Shop Sales), and recomputes the invoice status - the
  // same proven path Recibir Pago uses. Replaces the old direct insert that
  // marked the invoice paid but never posted to the account ledger.
  const { error: rpcErr } = await supabase.rpc('receive_payment', {
    p_money_account_id: input.moneyAccountId,
    p_method: input.method,
    p_received_at: input.paidAt,
    p_reference: input.reference?.trim() || null,
    p_allocations: [
      { sale_id: input.saleId, amount_cents: Math.round(input.amountCents) },
    ],
  })
  if (rpcErr) return { ok: false, error: rpcErr.message }

  revalidatePath(`/sales/${input.saleId}`)
  revalidatePath('/sales')
  revalidatePath('/money-accounts')
  return { ok: true }
}

// ============================================================
// 9.7 — product search wrapper (client-callable)
// ============================================================

export type SearchProductsResult =
  | { ok: true; results: ProductSearchResult[] }
  | { ok: false; error: string }

export async function searchProductsForSaleAction(input: {
  query: string
  warehouseId: string
  categoryId?: string | null
}): Promise<SearchProductsResult> {
  await requireAdminCaller()
  // Caller is responsible for ensuring auth — every page in (dashboard)
  // is already gated. We still don't take a sale-write action here, so
  // even an unauthenticated call would only leak read-side info.
  try {
    if (!input.warehouseId) {
      return { ok: false, error: 'Source warehouse is required.' }
    }
    const results = await searchProductsForSale({
      query: input.query,
      warehouseId: input.warehouseId,
      categoryId: input.categoryId ?? null,
    })
    return { ok: true, results }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Search failed.'
    return { ok: false, error: msg }
  }
}

// ============================================================
// 26a — log seller cash collected (Option-1 tracker)
// ============================================================
// Seller-callable: records that the seller is HOLDING cash for one of their
// own orders. Touches nothing in the books (no ledger, no paid status) — the
// owner books the real payment later via hand-in. Gated with
// requireAdminCaller (permits sellers); the RPC re-checks the caller is the
// order's seller.

export type LogCashResult = { ok: true } | { ok: false; error: string }

export async function logCashCollected(input: {
  saleId: string
  amountCents: number
  note?: string | null
}): Promise<LogCashResult> {
  await requireAdminCaller()
  if (!input.saleId) return { ok: false, error: 'Sale id is required.' }
  if (!Number.isFinite(input.amountCents) || input.amountCents <= 0) {
    return { ok: false, error: 'Amount must be greater than zero.' }
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc('log_seller_cash_collection', {
    p_sale_id: input.saleId,
    p_amount_cents: Math.round(input.amountCents),
    p_note: input.note?.trim() || null,
  })
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/sales/${input.saleId}`)
  return { ok: true }
}

// ============================================================
// 9.8 — POS confirm
// ============================================================

export type ConfirmPosPayment = {
  method: 'cash' | 'card' | 'transfer' | 'paypal' | 'stripe' | 'credit' | 'mixed'
  amount_cents: number
  money_account_id: string
  reference?: string | null
  paid_at?: string | null // ISO; omit for now()
}

export type ConfirmPosDiscountApplication = {
  rule_id: string
  rule_kind: string
  percent: number | null
  amount_cents: number
  cap_hit: boolean
}

export type ConfirmPosItem = {
  product_id: string
  qty: number
  unit_price_cents: number
  discount_cents: number
  // 16.6: per-rule discount breakdown (auto-discount audit).
  // Optional — when omitted, the RPC treats a non-zero discount_cents
  // as a manual override (is_manual=true audit row).
  discount_breakdown?: ConfirmPosDiscountApplication[]
}

export type ConfirmPosInput = {
  customer_id: string | null
  seller_id: string
  source_warehouse_id: string
  fulfillment_warehouse_id: string
  fulfillment_method: 'in_store' | 'pickup' | 'delivery'
  discount_cents: number
  // Round 42: optional coupon code. The RPC re-validates it server-side
  // (validate_coupon for channel 'pos') and computes the real amount off the
  // merchandise subtotal — the client value is never trusted.
  coupon_code?: string | null
  items: ConfirmPosItem[]
  payments: ConfirmPosPayment[]
}

export type ConfirmPosResult =
  | { ok: true; sale_id: string; invoice_number: string }
  | { ok: false; error: string }

// Loyalty: fetch a customer's current tier (name + discount %) for the POS till.
// Replaces the old manual club_tier. Returns 0% for walk-ins / staff / no tier.
export async function getCustomerTier(
  customerId: string,
): Promise<{ tierName: string; discountPct: number }> {
  await requireAdminCaller()
  if (!customerId) return { tierName: '', discountPct: 0 }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_customer_tier', {
    p_customer_id: customerId,
  })
  if (error || !data) return { tierName: '', discountPct: 0 }
  const r = data as { tier_name?: string; discount_pct?: number }
  return { tierName: r.tier_name ?? '', discountPct: Number(r.discount_pct ?? 0) }
}

// Round 42: live coupon preview for the till. Calls validate_coupon and
// returns the matched rule's percent/amount so the form can show (and
// recompute) the discount as the cart changes. This is PREVIEW ONLY — the
// authoritative check + amount happen inside confirm_pos_sale at submit.
export type PreviewCouponResult =
  | { ok: true; valid: false }
  | {
      ok: true
      valid: true
      rule_id: string
      name: string
      percent: number | null
      amount_cents: number | null
    }
  | { ok: false; error: string }

export async function previewCoupon(input: {
  code: string
  sourceWarehouseId: string
  channel: 'pos' | 'online'
  baseCents: number
}): Promise<PreviewCouponResult> {
  await requireAdminCaller()
  const code = input.code.trim()
  if (!code) return { ok: true, valid: false }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('validate_coupon', {
    p_code: code,
    p_source_warehouse_id: input.sourceWarehouseId || null,
    p_channel: input.channel,
    p_base_cents: Math.max(0, Math.round(input.baseCents)),
  })
  if (error) return { ok: false, error: error.message }

  // validate_coupon is set-returning -> rpc gives an array of one row.
  const row = (Array.isArray(data) ? data[0] : data) as
    | {
        rule_id: string | null
        name: string | null
        delta_percent: number | string | null
        delta_cents: number | null
        reason: string
      }
    | undefined
  if (!row || row.reason !== 'ok' || !row.rule_id) {
    return { ok: true, valid: false }
  }
  return {
    ok: true,
    valid: true,
    rule_id: row.rule_id,
    name: row.name ?? '',
    percent: row.delta_percent == null ? null : Number(row.delta_percent),
    amount_cents: row.delta_cents == null ? null : Number(row.delta_cents),
  }
}

export async function confirmPosSale(
  input: ConfirmPosInput
): Promise<ConfirmPosResult> {
  const caller = await requireAdminCaller()
  // Light client-side validation so we surface a clean error before the
  // round-trip. The rpc validates again; this is just nicer UX.
  if (!input.seller_id) return { ok: false, error: 'Seller is required.' }
  if (!input.source_warehouse_id)
    return { ok: false, error: 'Source warehouse is required.' }
  if (!input.fulfillment_warehouse_id)
    return { ok: false, error: 'Fulfillment warehouse is required.' }
  if (input.items.length < 1)
    return { ok: false, error: 'Add at least one item to the cart.' }
  // Round 25o: payment is optional - sellers create unpaid orders. The form gates payment for owner/admin; the RPC is the authority.

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('confirm_pos_sale', {
    p_payload: input,
  })

  if (error) {
    // Postgres "raise exception" text comes through as error.message.
    // Strip leading "no_lots_for_product:" prefix to a friendlier line.
    const raw = error.message || 'Failed to confirm sale.'
    const friendly = raw.startsWith('no_lots_for_product:')
      ? 'One of the products has no inventory lots in the selected warehouse. ' +
        'Receive stock for it first, or pick a different source warehouse.'
      : raw.startsWith('invalid_coupon:')
      ? "That coupon code isn't valid for this sale — it may be expired, " +
        'for a different store, or mistyped. Remove it or check the code.'
      : raw
    return { ok: false, error: friendly }
  }

  // rpc returns jsonb: { sale_id, invoice_number }
  const row = data as { sale_id?: string; invoice_number?: string } | null
  if (!row || !row.sale_id || !row.invoice_number) {
    return { ok: false, error: 'Unexpected response from confirm_pos_sale.' }
  }

  revalidatePath('/sales')

  // Step 4 — POS → Encargo bridge.
  // If this sale included a SERVICE item (a product with is_inventory=false,
  // e.g. "Pedido de Temu/Amazon"), auto-create a linked encargo so the owner
  // can run it through the delivery/pickup flow. NON-BLOCKING: never throws,
  // never affects the sale result. A walk-in (no customer) is skipped inside.
  await maybeCreateEncargoFromSale(input, row.sale_id)

  // Owner WhatsApp alert for this register sale. NON-BLOCKING (the helper
  // wraps everything in try/catch), runs after the sale is already saved, so
  // a WhatsApp/lookup failure can never affect the sale. The seller name comes
  // from the logged-in caller (a register sale's seller is always the caller).
  await maybeNotifyRegisterSale({
    saleId: row.sale_id,
    invoice: row.invoice_number,
    sellerName: caller.full_name || caller.email || 'Vendedor',
    sourceWarehouseId: input.source_warehouse_id,
    items: input.items.map((i) => ({ product_id: i.product_id, qty: i.qty })),
  })

  return {
    ok: true,
    sale_id: row.sale_id,
    invoice_number: row.invoice_number,
  }
}
