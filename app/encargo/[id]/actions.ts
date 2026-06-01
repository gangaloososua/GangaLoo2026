'use server'

// app/encargo/[id]/actions.ts
// PUBLIC submit action for the customer-facing encargo page. No login required.
// It calls the guarded SECURITY DEFINER RPC submit_service_order_response, which
// enforces that a response can only be given once and only while the order is
// arrived/notified. Then it pings the owner on WhatsApp (best-effort).

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { formatDOP } from '@/lib/format'
import { notifyServiceOrderResponse } from '@/lib/notify'

export type PublicTotals = {
  subtotal_cents: number
  source_shipping_cents: number
  gangaloo_fee_cents: number
  financing_cents: number
  delivery_fee_cents: number
  delivery_charge_cents: number
  paid_cents: number
  total_cents: number
  balance_cents: number
}

export type PublicItem = { name: string; qty: number; price_cents: number }

export type PublicOrder = {
  id: string
  client_name: string
  platform: string
  source_ref: string | null
  items: PublicItem[] | null
  description: string | null
  stage: string
  fulfilment: 'pickup' | 'delivery' | null
  delivery_date: string | null
  delivery_address: string | null
  delivery_fee_cents: number
  totals: PublicTotals
}

export type SubmitInput = {
  id: string
  fulfilment: 'pickup' | 'delivery'
  deliveryDate?: string | null
  deliveryAddress?: string | null
  deliveryNote?: string | null
  lat?: number | null
  lng?: number | null
}

export type SubmitResult = { ok: true; order: PublicOrder } | { ok: false; error: string }

function friendly(msg: string): string {
  const m = (msg || '').toLowerCase()
  if (m.includes('not open')) return 'Este pedido ya no está disponible para responder. Si crees que es un error, escríbenos.'
  if (m.includes('not found')) return 'No encontramos este pedido.'
  if (m.includes('requires a date')) return 'Para entrega a domicilio necesitamos la fecha y la dirección.'
  if (m.includes('invalid fulfilment')) return 'Opción inválida.'
  return 'No se pudo guardar tu respuesta. Inténtalo de nuevo en un momento.'
}

export async function submitResponse(input: SubmitInput): Promise<SubmitResult> {
  if (!input.id) return { ok: false, error: 'Falta el identificador del pedido.' }
  if (input.fulfilment !== 'pickup' && input.fulfilment !== 'delivery')
    return { ok: false, error: 'Elige recoger o entrega.' }
  if (input.fulfilment === 'delivery') {
    if (!input.deliveryDate || !(input.deliveryAddress || '').trim())
      return { ok: false, error: 'Para entrega necesitamos la fecha y la dirección.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('submit_service_order_response', {
    p_id: input.id,
    p_fulfilment: input.fulfilment,
    p_delivery_date: input.fulfilment === 'delivery' ? input.deliveryDate : null,
    p_delivery_address: input.fulfilment === 'delivery' ? input.deliveryAddress : null,
    p_delivery_note: input.fulfilment === 'delivery' ? input.deliveryNote || null : null,
    p_lat: input.fulfilment === 'delivery' ? input.lat ?? null : null,
    p_lng: input.fulfilment === 'delivery' ? input.lng ?? null : null,
  })

  if (error || !data) return { ok: false, error: friendly(error?.message || '') }

  const order = data as PublicOrder

  // Owner alert — best-effort, never blocks the customer's confirmation.
  try {
    await notifyServiceOrderResponse({
      clientName: order.client_name,
      platform: order.platform,
      fulfilment: input.fulfilment,
      balanceLabel: formatDOP(order.totals?.balance_cents ?? 0),
      date: input.fulfilment === 'delivery' ? input.deliveryDate || null : null,
      address: input.fulfilment === 'delivery' ? input.deliveryAddress || null : null,
    })
  } catch {
    // swallow — notification failures must not affect the response
  }

  // Let the admin list reflect the new "Respondió" state on next view.
  revalidatePath('/service-orders')

  return { ok: true, order }
}
