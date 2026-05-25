// Round 37g — find a product by exact SKU, scoped to a warehouse.
//
// Used by scanner-driven flows (register, placement editor, lookup). Returns
// the same ProductSearchResult shape the rest of the POS uses, so a scanned
// code drops straight into a cart or a placement. Reuses the proven
// warehouse-override / warehouse-stock / primary-category enrichment.
import { createClient } from '@/lib/supabase/server'
import type { ProductSearchResult } from '@/lib/sales'

export async function findProductBySku(
  warehouseId: string,
  sku: string,
): Promise<ProductSearchResult | null> {
  if (!warehouseId || !sku) return null
  const supabase = await createClient()

  const { data: products, error } = await supabase
    .from('products')
    .select('id, sku, name, primary_image_url, price_cents, club_price_cents, commission_percent')
    .eq('is_active', true)
    .eq('sku', sku)
    .limit(1)
  if (error) throw error

  const r = (products ?? [])[0]
  if (!r) return null
  const productId = r.id as string

  const [settingsRes, stockRes, catRes] = await Promise.all([
    supabase
      .from('product_warehouse_settings')
      .select('price_override_cents')
      .eq('warehouse_id', warehouseId)
      .eq('product_id', productId)
      .maybeSingle(),
    supabase
      .from('v_inventory_current')
      .select('qty_on_hand')
      .eq('warehouse_id', warehouseId)
      .eq('product_id', productId)
      .maybeSingle(),
    supabase
      .from('product_categories')
      .select('category_id')
      .eq('is_primary', true)
      .eq('product_id', productId)
      .maybeSingle(),
  ])

  const override = settingsRes.data?.price_override_cents
  return {
    id: productId,
    sku: r.sku as string,
    name: r.name as string,
    primary_image_url: (r.primary_image_url as string | null) ?? null,
    base_price_cents: Number(r.price_cents) || 0,
    club_price_cents: r.club_price_cents == null ? null : Number(r.club_price_cents),
    warehouse_price_override_cents: override == null ? null : Number(override),
    commission_percent: Number(r.commission_percent) || 0,
    qty_on_hand: Number(stockRes.data?.qty_on_hand) || 0,
    primary_category_id: (catRes.data?.category_id as string | undefined) ?? null,
  }
}
