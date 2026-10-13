// lib/transfer-request-notify.ts
//
// Sends the owner a "📦 Solicitud de traslado" WhatsApp alert when a
// distributor (or anyone) REQUESTS a stock transfer. Mirrors pos-sale-notify:
// it runs AFTER the request is already saved and is fully NON-BLOCKING -
// wrapped in try/catch so a WhatsApp/network/lookup failure can never affect
// or fail the request.
//
// Everything is read back from the saved transfer via the regular server
// client (as the caller). A distributor can already read their own requests
// (listTransfersForDistributor), so no service-role access is needed.
//
// Kept self-contained (its own small CallMeBot send) so lib/notify.ts and the
// existing sale/order alerts are not touched.

import { createClient } from '@/lib/supabase/server'

async function sendOwnerWhatsApp(text: string): Promise<void> {
  const phone = process.env.CALLMEBOT_OWNER_PHONE
  const apikey = process.env.CALLMEBOT_OWNER_KEY
  if (!phone || !apikey) return // not configured -> skip quietly
  try {
    await fetch(
      `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}` +
        `&apikey=${encodeURIComponent(apikey)}&text=${encodeURIComponent(text)}`,
      { method: 'GET', cache: 'no-store' },
    )
  } catch (e) {
    console.error('[transfer-request-notify] WhatsApp send failed', e) // swallow on purpose
  }
}

export async function maybeNotifyTransferRequest(transferId: string): Promise<void> {
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('stock_transfers')
      .select(
        `
        id, notes,
        from_wh:from_warehouse_id ( name ),
        to_wh:to_warehouse_id ( name ),
        requester:requested_by ( full_name ),
        req_items:stock_transfer_requested_items (
          qty,
          product:product_id ( name )
        )
      `,
      )
      .eq('id', transferId)
      .maybeSingle()

    const row = (data ?? {}) as any
    const fromName: string = row.from_wh?.name ?? '-'
    const toName: string = row.to_wh?.name ?? '-'
    const who: string = row.requester?.full_name ?? 'Distribuidor'
    const items = (Array.isArray(row.req_items) ? row.req_items : []) as any[]

    const lines = [
      '📦 Solicitud de traslado',
      `Solicitado por: ${who}`,
      `De: ${fromName}`,
      `Para: ${toName}`,
    ]
    if (items.length > 0) {
      lines.push('', 'Artículos:')
      for (const it of items) {
        lines.push(`• ${Number(it.qty) || 0} × ${it.product?.name ?? 'Producto'}`)
      }
    }
    if (row.notes) lines.push('', `Nota: ${row.notes}`)
    lines.push('', '👉 Revisa Transfers para aprobar o rechazar.')

    await sendOwnerWhatsApp(lines.join('\n'))
  } catch (e) {
    console.error('[transfer-request-notify] failed', e) // never block a request
  }
}
