// ===========================================================================
// POS → Encargo bridge  (Step 4)
// ---------------------------------------------------------------------------
// When a POS sale contains a SERVICE item (a product with is_inventory = false
// — e.g. "Pedido de Temu / Amazon …"), we auto-create a linked "service order"
// (encargo) so the owner can run it through the delivery/pickup lifecycle.
//
// Design rules (all deliberate):
//   • NON-BLOCKING. This is called AFTER the sale has already saved. If anything
//     in here throws, we swallow it and the sale still completes normally — the
//     same safety principle as the WhatsApp owner alerts.
//   • Only fires when a CUSTOMER is attached. A walk-in has no name/phone to
//     build an encargo from, so we skip silently. (The owner can still create
//     one by hand.)
//   • Service items are always rung up ALONE, so we treat the whole sale as one
//     encargo — no cart-splitting.
//   • The POS payment carries over as the encargo's DEPOSIT, so the encargo
//     starts at the "ordered" (Pedido) stage, not back at "invoice".
//   • Links the two records via source_sale_id.
//
// This uses the service-role admin client (bypasses RLS) and is server-only.
// ===========================================================================

import { createAdminClient } from '@/lib/supabase/admin'
import type {
  ConfirmPosInput,
  ConfirmPosItem,
} from '@/app/(dashboard)/sales/actions'
import type {
  ServicePlatform,
  ServiceItem,
  ServicePayment,
  ServiceTimelineEntry,
} from '@/lib/service-orders'

// Guess the platform from a product name. "Pedido de Temu", "Compra Amazon", etc.
// Falls back to 'other' when nothing matches.
function guessPlatform(productName: string): ServicePlatform {
  const n = (productName || '').toLowerCase()
  if (n.includes('temu')) return 'temu'
  if (n.includes('amazon')) return 'amazon'
  if (n.includes('shein')) return 'shein'
  if (n.includes('aliexpress') || n.includes('ali express') || n.includes('ali-express'))
    return 'aliexpress'
  return 'other'
}

type ServiceProductRow = {
  id: string
  name: string
  is_inventory: boolean | null
}

// ---------------------------------------------------------------------------
// maybeCreateEncargoFromSale
// Call this after a POS sale saves. Never throws.
// ---------------------------------------------------------------------------
export async function maybeCreateEncargoFromSale(
  input: ConfirmPosInput,
  saleId: string
): Promise<void> {
  try {
    // 0) Need a customer to build an encargo (name + WhatsApp). Walk-in → skip.
    if (!input.customer_id) return
    if (!input.items || input.items.length === 0) return

    const supabase = createAdminClient()

    // 1) Which of the sold products are SERVICE items (is_inventory = false)?
    const productIds = Array.from(new Set(input.items.map((i) => i.product_id)))
    const { data: prodData, error: prodErr } = await supabase
      .from('products')
      .select('id, name, is_inventory')
      .in('id', productIds)
    if (prodErr || !prodData) return

    const products = prodData as ServiceProductRow[]
    const serviceProductIds = new Set(
      products.filter((p) => p.is_inventory === false).map((p) => p.id)
    )

    // No service line → this was an ordinary inventory sale. Nothing to do.
    if (serviceProductIds.size === 0) return

    // 2) The service line items become the encargo's items.
    const nameById = new Map(products.map((p) => [p.id, p.name]))
    const serviceLines: ConfirmPosItem[] = input.items.filter((i) =>
      serviceProductIds.has(i.product_id)
    )

    const items: ServiceItem[] = serviceLines.map((i) => ({
      name: nameById.get(i.product_id) ?? 'Encargo',
      qty: i.qty,
      price_cents: i.unit_price_cents,
    }))

    // Subtotal = sum of (qty × unit price − line discount), never negative.
    const amountCents = serviceLines.reduce((sum, i) => {
      const line = i.qty * i.unit_price_cents - (i.discount_cents ?? 0)
      return sum + Math.max(0, line)
    }, 0)

    // 3) Platform guessed from the first service product's name.
    const firstName = items[0]?.name ?? ''
    const platform = guessPlatform(firstName)

    // 4) The POS payment(s) carry over as the encargo's deposit.
    const paidCents = (input.payments ?? []).reduce(
      (sum, p) => sum + (p.amount_cents ?? 0),
      0
    )
    const now = Date.now()
    const payments: ServicePayment[] = []
    if (paidCents > 0) {
      payments.push({
        kind: 'deposit',
        amount_cents: paidCents,
        ts: now,
        note: 'Depósito recibido en caja (POS)',
      })
    }

    // 5) Look up the customer's name + WhatsApp from profiles.
    const { data: profData, error: profErr } = await supabase
      .from('profiles')
      .select('full_name, phone')
      .eq('id', input.customer_id)
      .single()
    if (profErr || !profData) return

    const prof = profData as { full_name: string | null; phone: string | null }
    const clientName = (prof.full_name ?? '').trim()
    const clientPhone = (prof.phone ?? '').trim()

    // The encargo table requires a name and phone (NOT NULL). If either is
    // missing we can't message the client, so skip rather than insert junk.
    if (!clientName || !clientPhone) return

    // 6) Stage: if there's a deposit, it's already "ordered" (Pedido);
    //    otherwise it sits at "invoice" until a deposit is taken.
    const stage = paidCents > 0 ? 'ordered' : 'invoice'

    const timeline: ServiceTimelineEntry[] = [
      { label: 'Encargo creado desde una venta en caja', ts: now },
    ]
    if (paidCents > 0) {
      timeline.push({ label: 'Depósito recibido — pedido en proceso', ts: now })
    }

    // 7) Insert the encargo, linked to the sale.
    await supabase.from('service_orders').insert({
      client_name: clientName,
      client_phone: clientPhone,
      platform,
      items,
      amount_cents: items.length > 0 ? 0 : amountCents, // amount_cents only used when items is empty
      payments,
      stage,
      timeline,
      source_sale_id: saleId,
    })
    // Intentionally ignore the insert result — non-blocking.
  } catch {
    // Swallow everything. The sale already succeeded; an encargo hiccup must
    // never surface to the operator or fail the sale.
  }
}
