// Loads ONE product for a warehouse store from the SAFE public views (store_*),
// so customer browsers never touch costs/commissions. Effective price (warehouse
// override if any), stock in that warehouse, image gallery, primary category,
// and a description if present.

import { createClient } from '@/lib/supabase/server'
import type { StoreWarehouse } from './catalog'

export type StoreProductImage = { url: string; alt: string | null }

export type StoreProductDetail = {
  id: string
  sku: string
  name: string
  slug: string
  basePriceCents: number
  priceCents: number
  isOffer: boolean
  offerPercent: number
  description: string | null
  videoUrl: string | null
  category: { id: string; name: string } | null
  stock: number
  images: StoreProductImage[]
}

function pickDescription(row: Record<string, unknown>): string | null {
  const keys = [
    'description',
    'descripcion',
    'long_description',
    'details',
    'body',
    'notes',
  ]
  for (const k of keys) {
    const v = row[k]
    if (typeof v === 'string' && v.trim().length > 0) return v.trim()
  }
  return null
}

export async function fetchStoreProduct(
  warehouse: StoreWarehouse,
  productSlug: string,
): Promise<StoreProductDetail | null> {
  const supabase = await createClient()

  const { data: product, error } = await supabase
    .from('store_products')
    .select('*')
    .eq('slug', productSlug)
    .eq('is_active', true)
    .eq('visible_in_store', true)
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!product) return null

  const { data: setting } = await supabase
    .from('store_product_settings')
    .select('is_visible, price_override_cents')
    .eq('product_id', product.id)
    .eq('warehouse_id', warehouse.id)
    .maybeSingle()
  if (setting && setting.is_visible === false) return null

  const base = product.price_cents as number
  const override = (setting?.price_override_cents ?? null) as number | null
  const eff = override != null ? override : base
  const isOffer = override != null && override < base

  const { data: stockRow } = await supabase
    .from('store_inventory')
    .select('qty_on_hand')
    .eq('product_id', product.id)
    .eq('warehouse_id', warehouse.id)
    .maybeSingle()
  const stock = Number(stockRow?.qty_on_hand ?? 0) || 0

  const { data: imgRows } = await supabase
    .from('store_product_images')
    .select('url, alt_text, display_order')
    .eq('product_id', product.id)
    .order('display_order', { ascending: true })
  let images: StoreProductImage[] = (imgRows ?? []).map((r) => ({
    url: r.url as string,
    alt: (r.alt_text as string | null) ?? null,
  }))
  if (images.length === 0 && product.primary_image_url) {
    images = [
      { url: product.primary_image_url as string, alt: product.name as string },
    ]
  }

  let category: { id: string; name: string } | null = null
  const { data: pcl } = await supabase
    .from('store_product_categories')
    .select('category_id')
    .eq('product_id', product.id)
    .eq('is_primary', true)
    .limit(1)
    .maybeSingle()
  if (pcl?.category_id) {
    const { data: cat } = await supabase
      .from('store_categories')
      .select('id, name')
      .eq('id', pcl.category_id)
      .maybeSingle()
    if (cat) category = { id: cat.id as string, name: cat.name as string }
  }

  // Video link (read-only, safe function). Non-blocking: on any hiccup we just
  // show no video. Reads from products via a SECURITY DEFINER fn that only
  // returns the URL for active+visible products.
  let videoUrl: string | null = null
  try {
    const { data: vid } = await supabase.rpc('get_store_product_video', {
      p_id: product.id,
    })
    if (typeof vid === 'string' && vid.trim().length > 0) videoUrl = vid.trim()
  } catch {
    /* ignore — video is optional */
  }

  return {
    id: product.id as string,
    sku: product.sku as string,
    name: product.name as string,
    slug: product.slug as string,
    basePriceCents: base,
    priceCents: eff,
    isOffer,
    offerPercent: isOffer ? Math.round((1 - eff / base) * 100) : 0,
    description: pickDescription(product as Record<string, unknown>),
    videoUrl,
    category,
    stock,
    images,
  }
}
