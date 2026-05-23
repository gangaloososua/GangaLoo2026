import { createClient } from '@/lib/supabase/server'

// ---------------------------------------------------------------------------
// Edit-unpaid-sale: load helper for the product editor screen.
// ---------------------------------------------------------------------------
// The editor screen (sales/[id]/edit-products) is a POS-like cart pre-loaded
// with a sale's CURRENT line items. It is only valid for a confirmed, UNPAID
// sale (no money moved, nothing posted to the ledger, no commissions paid) -
// the same hard gate the edit_unpaid_sale RPC enforces server-side. This
// loader mirrors that gate so the page can redirect early, and shapes the
// data the cart needs:
//   - the sale's source warehouse (stock is pulled from / returned to it)
//   - the customer + club tier (so auto-discount rules resolve like new-sale)
//   - each line's product display + saved unit price + saved discount
//   - each product's CURRENT stock-on-hand in the source warehouse, so the
//     cart can show the same "short by X" low-stock warning as the till
//   - each product's PRIMARY category id, needed by the discount resolver
//     (e.g. when the user zeroes a discount to restore the auto rule)
// ---------------------------------------------------------------------------

export type EditableSaleLine = {
  product_id: string
  sku: string
  name: string
  primary_image_url: string | null
  commission_percent: number
  unit_price_cents: number
  qty: number
  saved_discount_cents: number
  primary_category_id: string | null
  qty_on_hand: number
}

export type UnpaidSaleForEdit = {
  sale_id: string
  invoice_number: string | null
  source_warehouse_id: string
  customer_id: string | null
  customer_club_tier: string | null
  sale_discount_cents: number
  lines: EditableSaleLine[]
}

export type EditableSaleResult =
  | { editable: true; sale: UnpaidSaleForEdit }
  | { editable: false; reason: string }

export async function getUnpaidSaleForEdit(
  saleId: string,
): Promise<EditableSaleResult> {
  const supabase = await createClient()

  // 1. Sale header + the gate (confirmed & unpaid only). Mirrors the RPC's
  //    own check so we can redirect before rendering the cart.
  const { data: sale, error: saleErr } = await supabase
    .from('sales')
    .select(
      'id, invoice_number, status, paid_cents, source_warehouse_id, customer_id, discount_cents',
    )
    .eq('id', saleId)
    .maybeSingle()
  if (saleErr) throw new Error(`getUnpaidSaleForEdit: ${saleErr.message}`)
  if (!sale) return { editable: false, reason: 'Sale not found.' }

  if (sale.status !== 'confirmed' || Number(sale.paid_cents) !== 0) {
    return {
      editable: false,
      reason:
        'Only a confirmed, unpaid sale can have its products edited. Once a ' +
        'payment exists, use refund + re-ring instead.',
    }
  }
  if (!sale.source_warehouse_id) {
    return {
      editable: false,
      reason:
        'This sale has no source warehouse, so its stock cannot be ' +
        're-computed. Edit is unavailable.',
    }
  }
  const sourceWarehouseId = sale.source_warehouse_id as string

  // 2. Customer club tier (for auto-discount resolution; null for walk-in).
  let customerClubTier: string | null = null
  if (sale.customer_id) {
    const { data: cust } = await supabase
      .from('profiles')
      .select('club_tier')
      .eq('id', sale.customer_id)
      .maybeSingle()
    customerClubTier = (cust?.club_tier as string | null) ?? null
  }

  // 3. Current line items + product display fields.
  const { data: items, error: itemsErr } = await supabase
    .from('sale_items')
    .select(
      `
      product_id,
      qty,
      unit_price_cents,
      discount_cents,
      product:product_id (
        id, sku, name, primary_image_url, commission_percent
      )
    `,
    )
    .eq('sale_id', saleId)
  if (itemsErr) throw new Error(`getUnpaidSaleForEdit: ${itemsErr.message}`)

  const rows = (items ?? []) as any[]
  const productIds = rows.map((r) => r.product_id as string)

  // 4. Current stock (source wh) + primary category, in parallel.
  //    Mirrors searchProductsForSale's stock + category lookups so a
  //    pre-loaded line behaves exactly like a freshly-searched one.
  const [stockRes, catRes] = await Promise.all([
    productIds.length
      ? supabase
          .from('v_inventory_current')
          .select('product_id, qty_on_hand')
          .eq('warehouse_id', sourceWarehouseId)
          .in('product_id', productIds)
      : Promise.resolve({ data: [], error: null } as any),
    productIds.length
      ? supabase
          .from('product_categories')
          .select('product_id, category_id')
          .eq('is_primary', true)
          .in('product_id', productIds)
      : Promise.resolve({ data: [], error: null } as any),
  ])
  if (stockRes.error)
    throw new Error(`getUnpaidSaleForEdit: ${stockRes.error.message}`)
  if (catRes.error)
    throw new Error(`getUnpaidSaleForEdit: ${catRes.error.message}`)

  const stockMap: Record<string, number> = {}
  for (const s of stockRes.data ?? []) {
    stockMap[s.product_id as string] = Number(s.qty_on_hand) || 0
  }
  const categoryMap: Record<string, string> = {}
  for (const c of catRes.data ?? []) {
    categoryMap[c.product_id as string] = c.category_id as string
  }

  const lines: EditableSaleLine[] = rows.map((r) => ({
    product_id: r.product_id as string,
    sku: (r.product?.sku as string) ?? '',
    name: (r.product?.name as string) ?? '(unknown product)',
    primary_image_url: (r.product?.primary_image_url as string | null) ?? null,
    commission_percent: Number(r.product?.commission_percent) || 0,
    unit_price_cents: Number(r.unit_price_cents) || 0,
    qty: Number(r.qty) || 0,
    saved_discount_cents: Number(r.discount_cents) || 0,
    primary_category_id: categoryMap[r.product_id as string] ?? null,
    qty_on_hand: stockMap[r.product_id as string] ?? 0,
  }))

  return {
    editable: true,
    sale: {
      sale_id: sale.id as string,
      invoice_number: (sale.invoice_number as string | null) ?? null,
      source_warehouse_id: sourceWarehouseId,
      customer_id: (sale.customer_id as string | null) ?? null,
      customer_club_tier: customerClubTier,
      sale_discount_cents: Number(sale.discount_cents) || 0,
      lines,
    },
  }
}
