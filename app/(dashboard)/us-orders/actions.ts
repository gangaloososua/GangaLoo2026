'use server'

// app/(dashboard)/us-orders/actions.ts
// Server actions for the US dropship orders admin (Phase 4). Owner only.
//
// Two client rules (from the money/handoff conventions):
//  - plain table writes on the RLS-locked us_orders -> ADMIN (service-role) client
//  - ledger RPCs (post/reverse income + supplier cost) gate on auth.uid()
//    -> REGULAR server client, never service-role.

import { requireOwner } from '@/lib/auth/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { UsOrderStatus } from '@/lib/us-orders'

type ActionResult = { ok: true } | { ok: false; error: string }

const PATH = '/us-orders'

// --- Stage / fulfilment (admin client) -------------------------------------
export async function advanceUsOrderStage(
  orderId: string,
  status: UsOrderStatus,
  supplierRef?: string,
): Promise<ActionResult> {
  try {
    await requireOwner()
    if (!orderId) return { ok: false, error: 'no order id' }

    const admin = createAdminClient()
    // append a timeline entry alongside the status change
    const { data: cur, error: readErr } = await admin
      .from('us_orders')
      .select('timeline')
      .eq('id', orderId)
      .maybeSingle()
    if (readErr) return { ok: false, error: readErr.message }

    const timeline = Array.isArray((cur as { timeline?: unknown } | null)?.timeline)
      ? ((cur as { timeline: unknown[] }).timeline as unknown[])
      : []
    timeline.push({ label: status, ts: new Date().toISOString() })

    const patch: Record<string, unknown> = { status, timeline }
    if (typeof supplierRef === 'string') {
      const trimmed = supplierRef.trim()
      if (trimmed) patch.supplier_ref = trimmed
    }

    const { error } = await admin.from('us_orders').update(patch).eq('id', orderId)
    if (error) return { ok: false, error: error.message }

    revalidatePath(PATH)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'unknown' }
  }
}

export async function saveUsOrderNotes(
  orderId: string,
  notes: string,
): Promise<ActionResult> {
  try {
    await requireOwner()
    if (!orderId) return { ok: false, error: 'no order id' }
    const admin = createAdminClient()
    const { error } = await admin
      .from('us_orders')
      .update({ internal_notes: notes.trim() || null })
      .eq('id', orderId)
    if (error) return { ok: false, error: error.message }
    revalidatePath(PATH)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'unknown' }
  }
}

export async function deleteUsOrder(orderId: string): Promise<ActionResult> {
  try {
    await requireOwner()
    if (!orderId) return { ok: false, error: 'no order id' }
    const admin = createAdminClient()
    const { error } = await admin.from('us_orders').delete().eq('id', orderId)
    if (error) return { ok: false, error: error.message }
    revalidatePath(PATH)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'unknown' }
  }
}

// --- Ledger postings (regular server client; RPCs gate on auth.uid()) ------
export async function postUsOrderIncome(input: {
  orderId: string
  moneyAccountId: string
  categoryId: string
}): Promise<ActionResult> {
  try {
    await requireOwner()
    if (!input.orderId || !input.moneyAccountId || !input.categoryId) {
      return { ok: false, error: 'missing account or category' }
    }
    const server = await createClient()
    const { data, error } = await server.rpc('post_us_order_income', {
      p_order_id: input.orderId,
      p_money_account_id: input.moneyAccountId,
      p_category_id: input.categoryId,
    })
    if (error) return { ok: false, error: error.message }
    const res = data as { ok?: boolean } | null
    if (!res?.ok) return { ok: false, error: 'post failed' }
    revalidatePath(PATH)
    revalidatePath('/money-accounts')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'unknown' }
  }
}

export async function reverseUsOrderIncome(orderId: string): Promise<ActionResult> {
  try {
    await requireOwner()
    if (!orderId) return { ok: false, error: 'no order id' }
    const server = await createClient()
    const { error } = await server.rpc('reverse_us_order_income', { p_order_id: orderId })
    if (error) return { ok: false, error: error.message }
    revalidatePath(PATH)
    revalidatePath('/money-accounts')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'unknown' }
  }
}

export async function postUsOrderSupplierCost(input: {
  orderId: string
  amountUsd: number
  moneyAccountId: string
  categoryId: string
  note?: string
}): Promise<ActionResult> {
  try {
    await requireOwner()
    if (!input.orderId || !input.moneyAccountId || !input.categoryId) {
      return { ok: false, error: 'missing account or category' }
    }
    if (!(input.amountUsd > 0)) return { ok: false, error: 'amount must be > 0' }
    const server = await createClient()
    const { data, error } = await server.rpc('post_us_order_supplier_cost', {
      p_order_id: input.orderId,
      p_amount_usd: input.amountUsd,
      p_money_account_id: input.moneyAccountId,
      p_category_id: input.categoryId,
      p_note: input.note ?? null,
    })
    if (error) return { ok: false, error: error.message }
    const res = data as { ok?: boolean } | null
    if (!res?.ok) return { ok: false, error: 'post failed' }
    revalidatePath(PATH)
    revalidatePath('/money-accounts')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'unknown' }
  }
}

export async function reverseUsOrderSupplierCost(orderId: string): Promise<ActionResult> {
  try {
    await requireOwner()
    if (!orderId) return { ok: false, error: 'no order id' }
    const server = await createClient()
    const { error } = await server.rpc('reverse_us_order_supplier_cost', { p_order_id: orderId })
    if (error) return { ok: false, error: error.message }
    revalidatePath(PATH)
    revalidatePath('/money-accounts')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'unknown' }
  }
}
