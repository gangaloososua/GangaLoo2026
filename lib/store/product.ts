// Loads ONE product for a warehouse store from the SAFE public views (store_*),
// so customer browsers never touch costs/commissions. Effective price mirrors
// the grid (lib/store/catalog.ts): guest markup, club price, direct sale price,
// and featured deal -- so the product page agrees with the grid, cart, and the
// checkout quote/charge. Stock in that warehouse, image gallery, primary
// category, and a description if present.

import { createClient } from '@/lib/supabase/server'
import type { StoreWarehouse } from './catalog'

export type StoreProductImage = { url: string; alt: string | null }

// One attribute (e.g. "Color") and the product's value(s) for it (e.g. "Negro").
export type StoreProductAttributeGroup = { name: string; values: string[] }

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
  attributes: StoreProductAttributeGroup[]
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

  // --- Pricing pipeline (mirrors lib/store/catalog.ts) -------------------
  // Guest vs logged-in. Guests get a markup and NO direct sale price.
  const {
    data: { user: authedUser },
  } = await supabase.auth.getUser()
  const isGuest = !authedUser

  let guestMarkupPct = 0
  if (isGuest) {
    try {
      const { data: cfg } = await supabase.rpc('get_store_public_config')
      const raw = (cfg as { guest_markup?: unknown } | null)?.guest_markup
      guestMarkupPct = Math.max(0, Number(raw ?? 0)) || 0
    } catch {
      guestMarkupPct = 0
    }
  }
  const markupFrac = guestMarkupPct / 100
  // Guests: marked-up, rounded UP to the next RD$25. Logged-in: exact.
  const mk = (c: number) => {
    const v = c * (1 + markupFrac)
    return isGuest ? Math.ceil(v / 2500) * 2500 : Math.round(v)
  }

  // Club member (logged-in only), via the safe RPC (no direct profile read).
  let isClubMember = false
  if (!isGuest) {
    try {
      const { data: m } = await supabase.rpc('get_my_is_club_member')
      isClubMember = m === true
    } catch {
      isClubMember = false
    }
  }

  const base = product.price_cents as number
  const override = (setting?.price_override_cents ?? null) as number | null
  const listNormal = override != null ? override : base

  const clubPrice =
    (product as { club_price_cents?: number | null }).club_price_cents ?? null
  const salePrice =
    (product as { sale_price_cents?: number | null }).sale_price_cents ?? null

  // Starting price before deals:
  //  - guest: list normal (no sale price)
  //  - logged-in non-member: lower of {list normal, sale price}
  //  - member: lower of {club price, sale price}
  let memberNormal = listNormal
  if (isClubMember && clubPrice != null && clubPrice > 0 && clubPrice < memberNormal) {
    memberNormal = clubPrice
  }
  if (!isGuest && salePrice != null && salePrice > 0 && salePrice < memberNormal) {
    memberNormal = salePrice
  }

  // Featured deal (daily/weekly) for this store, percent off, capped 30%.
  let dealPct = 0
  try {
    const { data: dealRows } = await supabase
      .from('store_promotions')
      .select('delta_percent, priority, warehouse_id')
      .eq('product_id', product.id)
      .or(`warehouse_id.is.null,warehouse_id.eq.${warehouse.id}`)
    let bestPriority = -1
    for (const d of dealRows ?? []) {
      if (d.delta_percent == null) continue
      const pr = Number(d.priority) || 0
      if (pr > bestPriority) {
        bestPriority = pr
        dealPct = Number(d.delta_percent) || 0
      }
    }
  } catch {
    dealPct = 0
  }

  const eff =
    dealPct > 0
      ? Math.round(memberNormal * Math.max(0.7, 1 - dealPct / 100))
      : memberNormal

  // "Was" price to strike through: the list normal when the customer is
  // getting any kind of break (club / sale / deal), else the base.
  const compareAt = eff < listNormal ? listNormal : base
  const isOffer = eff < compareAt
  // -----------------------------------------------------------------------

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

  let videoUrl: string | null = null
  try {
    const { data: vid } = await supabase.rpc('get_store_product_video', {
      p_id: product.id,
    })
    if (typeof vid === 'string' && vid.trim().length > 0) videoUrl = vid.trim()
  } catch {
    /* ignore -- video is optional */
  }

  // Attributes shown as specs on the product page. Group active values under
  // their attribute name, both ordered by display_order.
  const attributes: StoreProductAttributeGroup[] = []
  {
    const { data: pav } = await supabase
      .from('store_product_attribute_values')
      .select('attribute_value_id')
      .eq('product_id', product.id)
    const valueIds = [...new Set((pav ?? []).map((r) => r.attribute_value_id as string))]
    if (valueIds.length > 0) {
      const { data: vals } = await supabase
        .from('store_attribute_values')
        .select('id, attribute_id, value, display_order, is_active')
        .in('id', valueIds)
        .eq('is_active', true)
      const attrIds = [...new Set((vals ?? []).map((v) => v.attribute_id as string))]
      const { data: attrs } = attrIds.length
        ? await supabase
            .from('store_attributes')
            .select('id, name, display_order, is_active')
            .in('id', attrIds)
            .eq('is_active', true)
        : { data: [] as Record<string, unknown>[] }
      const attrMeta = new Map<string, { name: string; order: number }>()
      for (const a of attrs ?? []) {
        attrMeta.set(a.id as string, { name: a.name as string, order: (a.display_order as number) ?? 0 })
      }
      const grouped = new Map<string, { name: string; order: number; values: { text: string; order: number }[] }>()
      for (const v of vals ?? []) {
        const meta = attrMeta.get(v.attribute_id as string)
        if (!meta) continue
        if (!grouped.has(v.attribute_id as string)) {
          grouped.set(v.attribute_id as string, { name: meta.name, order: meta.order, values: [] })
        }
        grouped.get(v.attribute_id as string)!.values.push({ text: v.value as string, order: (v.display_order as number) ?? 0 })
      }
      const ordered = [...grouped.values()].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
      for (const g of ordered) {
        const values = g.values.sort((a, b) => a.order - b.order || a.text.localeCompare(b.text)).map((x) => x.text)
        attributes.push({ name: g.name, values })
      }
    }
  }

  return {
    id: product.id as string,
    sku: product.sku as string,
    name: product.name as string,
    slug: product.slug as string,
    basePriceCents: mk(compareAt),
    priceCents: mk(eff),
    isOffer,
    offerPercent: isOffer ? Math.round((1 - eff / compareAt) * 100) : 0,
    description: pickDescription(product as Record<string, unknown>),
    videoUrl,
    category,
    stock,
    images,
    attributes,
  }
}
