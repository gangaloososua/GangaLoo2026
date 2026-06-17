// lib/pos-sale-notify.ts
//
// Sends the owner a "🛒 Venta en caja" WhatsApp alert after a register (caja)
// sale is confirmed. Mirrors the pos-encargo-bridge pattern: it runs AFTER the
// sale is already saved and is fully NON-BLOCKING — wrapped in try/catch so a
// WhatsApp/network/lookup failure can never affect or fail the sale.
//
// The seller name is passed in from the caller (requireAdminCaller's profile),
// since a register sale's seller is always the logged-in caller. The store
// name, authoritative total, and product names are read back via the regular
// server client (as the caller), so we never touch the service-role profile
// grant issue.

import { createClient } from '@/lib/supabase/server'
import { notifyRegisterSale } from '@/lib/notify'

const fmtDOP = (cents: number) =>
  'RD$ ' +
  (cents / 100).toLocaleString('es-DO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

export async function maybeNotifyRegisterSale(args: {
  saleId: string
  invoice: string
  sellerName: string
  sourceWarehouseId: string
  items: { product_id: string; qty: number }[]
}): Promise<void> {
  try {
    const supabase = await createClient()

    // Store name
    let storeName = ''
    {
      const { data } = await supabase
        .from('warehouses')
        .select('name')
        .eq('id', args.sourceWarehouseId)
        .maybeSingle()
      storeName = (data?.name as string | undefined) ?? ''
    }

    // Authoritative total (read back from the saved sale, not the cart)
    let totalCents = 0
    {
      const { data } = await supabase
        .from('sales')
        .select('total_cents')
        .eq('id', args.saleId)
        .maybeSingle()
      totalCents = Number(data?.total_cents ?? 0)
    }

    // Product names
    const ids = Array.from(new Set(args.items.map((i) => i.product_id)))
    const nameById = new Map<string, string>()
    if (ids.length > 0) {
      const { data } = await supabase.from('products').select('id, name').in('id', ids)
      for (const p of (data ?? []) as { id: string; name: string }[]) {
        nameById.set(p.id, p.name)
      }
    }
    const items = args.items.map((i) => ({
      qty: i.qty,
      name: nameById.get(i.product_id) ?? 'Producto',
    }))

    await notifyRegisterSale({
      invoice: args.invoice,
      sellerName: args.sellerName,
      storeName,
      totalLabel: fmtDOP(totalCents),
      items,
    })
  } catch (e) {
    console.error('[pos-sale-notify] failed', e) // never block a sale
  }
}
