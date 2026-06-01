'use server'

// app/(dashboard)/service-orders/actions.ts
// Server actions for "service orders" (personal-shopper / encargos).
//
// These do simple CRUD on the locked-down service_orders table. The table has
// RLS on with no policies, so we reach it through the service-role client
// (createAdminClient). Every action is gated by requireOwner() first, so only
// owner/admin can ever invoke them. Money is stored in CENTS.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOwner } from '@/lib/auth/guard'
import {
  PLATFORMS,
  STAGES,
  type ServiceItem,
  type ServiceOrder,
  type ServicePayment,
  type ServicePlatform,
  type ServiceStage,
} from '@/lib/service-orders'

export type ActionResult = { ok: true } | { ok: false; error: string }
export type CreateResult = { ok: true; id: string } | { ok: false; error: string }

const PLATFORM_LABEL: Record<ServicePlatform, string> = {
  amazon: 'Amazon',
  temu: 'Temu',
  shein: 'Shein',
  aliexpress: 'AliExpress',
  other: 'otra tienda',
}

type AdminClient = ReturnType<typeof createAdminClient>

async function loadOrder(supabase: AdminClient, id: string): Promise<ServiceOrder | null> {
  const { data, error } = await supabase
    .from('service_orders')
    .select('*')
    .eq('id', id)
    .single()
  if (error || !data) return null
  return data as ServiceOrder
}

function cleanItems(
  raw: { name: string; qty: number; priceCents: number }[],
): ServiceItem[] {
  return (raw || [])
    .filter((it) => it && it.name && it.name.trim() && Number(it.qty) > 0)
    .map((it) => ({
      name: it.name.trim(),
      qty: Math.max(0, Math.round(Number(it.qty) || 0)),
      price_cents: Math.max(0, Math.round(Number(it.priceCents) || 0)),
    }))
}

function tl(label: string) {
  return { label, ts: Date.now() }
}

// ---------------------------------------------------------------------------
// saveServiceOrder — create (no id) or edit (with id)
// ---------------------------------------------------------------------------
export type SaveServiceOrderInput = {
  id?: string
  clientName: string
  clientPhone: string
  platform: string
  sourceRef: string
  items: { name: string; qty: number; priceCents: number }[]
  description: string
  amountCents: number
  sourceShippingCents: number
  deliveryFeeCents: number
  gangalooFeeCents: number
  financingCents: number
  internalNotes: string
  depositCents?: number // create-only: if > 0, starts at "ordered"
}

export async function saveServiceOrder(
  input: SaveServiceOrderInput,
): Promise<CreateResult> {
  await requireOwner()

  const clientName = (input.clientName || '').trim()
  const clientPhone = (input.clientPhone || '').trim()
  if (!clientName) return { ok: false, error: 'El nombre del cliente es obligatorio.' }
  if (!clientPhone) return { ok: false, error: 'El WhatsApp del cliente es obligatorio.' }

  const platform = (PLATFORMS as string[]).includes(input.platform)
    ? (input.platform as ServicePlatform)
    : 'other'
  const items = cleanItems(input.items)

  const base = {
    client_name: clientName,
    client_phone: clientPhone,
    platform,
    source_ref: (input.sourceRef || '').trim() || null,
    items,
    description: (input.description || '').trim() || null,
    amount_cents: Math.max(0, Math.round(input.amountCents || 0)),
    source_shipping_cents: Math.max(0, Math.round(input.sourceShippingCents || 0)),
    delivery_fee_cents: Math.max(0, Math.round(input.deliveryFeeCents || 0)),
    gangaloo_fee_cents: Math.max(0, Math.round(input.gangalooFeeCents || 0)),
    financing_cents: Math.max(0, Math.round(input.financingCents || 0)),
    internal_notes: (input.internalNotes || '').trim() || null,
  }

  const supabase = createAdminClient()

  // EDIT
  if (input.id) {
    const existing = await loadOrder(supabase, input.id)
    if (!existing) return { ok: false, error: 'No se encontró el pedido.' }
    const timeline = [...(existing.timeline || []), tl('Pedido editado')]
    const { error } = await supabase
      .from('service_orders')
      .update({ ...base, timeline })
      .eq('id', input.id)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/service-orders')
    return { ok: true, id: input.id }
  }

  // CREATE
  const deposit = Math.max(0, Math.round(input.depositCents || 0))
  const payments: ServicePayment[] = []
  let stage: ServiceStage = 'invoice'
  const timeline = [tl('Factura creada')]
  if (deposit > 0) {
    payments.push({
      id: 'p' + Date.now(),
      kind: 'deposit',
      amount_cents: deposit,
      ts: Date.now(),
      note: 'inicial',
    })
    stage = 'ordered'
    timeline.push(tl(`Depósito recibido · pedido en ${PLATFORM_LABEL[platform]}`))
  }

  const { data, error } = await supabase
    .from('service_orders')
    .insert({ ...base, payments, stage, timeline })
    .select('id')
    .single()
  if (error || !data) return { ok: false, error: error?.message || 'No se pudo crear.' }

  revalidatePath('/service-orders')
  return { ok: true, id: (data as { id: string }).id }
}

// ---------------------------------------------------------------------------
// recordPayment
// ---------------------------------------------------------------------------
export type RecordPaymentInput = {
  id: string
  kind: 'deposit' | 'final' | 'other'
  amountCents: number
  note: string
}

export async function recordPayment(input: RecordPaymentInput): Promise<ActionResult> {
  await requireOwner()
  if (!input.id) return { ok: false, error: 'Falta el id del pedido.' }
  const amount = Math.round(input.amountCents || 0)
  if (!Number.isFinite(amount) || amount <= 0)
    return { ok: false, error: 'El monto debe ser mayor que cero.' }
  const kind = (['deposit', 'final', 'other'] as const).includes(input.kind)
    ? input.kind
    : 'other'

  const supabase = createAdminClient()
  const o = await loadOrder(supabase, input.id)
  if (!o) return { ok: false, error: 'No se encontró el pedido.' }

  const payments: ServicePayment[] = [
    ...(o.payments || []),
    { id: 'p' + Date.now(), kind, amount_cents: amount, ts: Date.now(), note: (input.note || '').trim() },
  ]
  const timeline = [...(o.timeline || []), tl(`Pago ${kind}: registrado`)]

  let stage = o.stage
  if (o.stage === 'invoice' && kind === 'deposit') {
    stage = 'ordered'
    timeline.push(tl(`Pedido realizado en ${PLATFORM_LABEL[o.platform]}`))
  }

  const { error } = await supabase
    .from('service_orders')
    .update({ payments, timeline, stage })
    .eq('id', input.id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/service-orders')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// removePayment
// ---------------------------------------------------------------------------
export async function removePayment(id: string, paymentId: string): Promise<ActionResult> {
  await requireOwner()
  if (!id || !paymentId) return { ok: false, error: 'Faltan datos.' }

  const supabase = createAdminClient()
  const o = await loadOrder(supabase, id)
  if (!o) return { ok: false, error: 'No se encontró el pedido.' }

  const payments = (o.payments || []).filter((p) => p.id !== paymentId)
  const timeline = [...(o.timeline || []), tl('Pago eliminado')]

  const { error } = await supabase
    .from('service_orders')
    .update({ payments, timeline })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/service-orders')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// advanceStage — move to a specific stage with a timeline note
// ---------------------------------------------------------------------------
export async function advanceStage(
  id: string,
  toStage: ServiceStage,
  label: string,
): Promise<ActionResult> {
  await requireOwner()
  if (!id) return { ok: false, error: 'Falta el id del pedido.' }
  if (!STAGES.includes(toStage)) return { ok: false, error: 'Etapa inválida.' }

  const supabase = createAdminClient()
  const o = await loadOrder(supabase, id)
  if (!o) return { ok: false, error: 'No se encontró el pedido.' }

  const timeline = [...(o.timeline || []), tl(label || `Etapa: ${toStage}`)]
  const { error } = await supabase
    .from('service_orders')
    .update({ stage: toStage, timeline })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/service-orders')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// completeOrder — optionally record a final payment, then mark completed
// ---------------------------------------------------------------------------
export async function completeOrder(
  id: string,
  finalPaymentCents?: number,
): Promise<ActionResult> {
  await requireOwner()
  if (!id) return { ok: false, error: 'Falta el id del pedido.' }

  const supabase = createAdminClient()
  const o = await loadOrder(supabase, id)
  if (!o) return { ok: false, error: 'No se encontró el pedido.' }

  const payments: ServicePayment[] = [...(o.payments || [])]
  const final = Math.round(finalPaymentCents || 0)
  if (Number.isFinite(final) && final > 0) {
    payments.push({
      id: 'p' + Date.now(),
      kind: 'final',
      amount_cents: final,
      ts: Date.now(),
      note: 'entrega',
    })
  }
  const timeline = [...(o.timeline || []), tl('Completado')]

  const { error } = await supabase
    .from('service_orders')
    .update({ payments, timeline, stage: 'completed' })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/service-orders')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// deleteServiceOrder
// ---------------------------------------------------------------------------
export async function deleteServiceOrder(id: string): Promise<ActionResult> {
  await requireOwner()
  if (!id) return { ok: false, error: 'Falta el id del pedido.' }

  const supabase = createAdminClient()
  const { error } = await supabase.from('service_orders').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/service-orders')
  return { ok: true }
}
