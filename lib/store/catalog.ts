// Storefront catalog layer for the public online shop.
//
// Reads only the SAFE public views (store_*), never the raw tables, so customer
// browsers never touch costs, commissions, or inventory value:
//   store_products, store_product_categories, store_categories,
//   store_product_settings, store_inventory, store_warehouses

import { createClient } from '@/lib/supabase/server'

export type StoreWarehouse = {
  id: string
  name: string // cleaned display name, e.g. "Maranatha"
  rawName: string // original, e.g. "1-Maranatha"
  slug: string // e.g. "maranatha"
}

export type StoreProduct = {
  id: string
  sku: string
  name: string
  slug: string
  basePriceCents: number
  priceCents: number // effective price in this store (deal > override > base)
  isOffer: boolean
  offerPercent: number // 0 when not an offer
  imageUrl: string | null
  category: { id: string; name: string } | null
  stock: number // qty on hand in THIS warehouse
  dealSlot?: 'daily' | 'weekly' | null // featured deal slot, if any
  dealEndsAt?: string | null // when this product's deal ends (ISO), if any
}

export type StoreCategory = { id: string; name: string }

export type StoreDeal = {
  slot: 'daily' | 'weekly'
  endsAt: string | null // section countdown target (soonest among its products)
  products: StoreProduct[]
}

export type StoreCatalog = {
  warehouse: StoreWarehouse
  products: StoreProduct[]
  offers: StoreProduct[]
  categories: StoreCategory[]
  dailyDeal: StoreDeal | null
  weeklyDeal: StoreDeal | null
}

export type StoreLandingDeal = {
  productId: string
  name: string
  slug: string
  imageUrl: string | null
  normalCents: number
  dealCents: number
  percent: number
}

export type StoreWithDeals = StoreWarehouse & {
  deals: StoreLandingDeal[]
}

function cleanName(raw: string): string {
  return raw.replace(/^\s*\d+\s*[-–—]\s*/, '').trim()
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export async function listStoreWarehouses(): Promise<StoreWarehouse[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('store_warehouses')
    .select('id, name')
    .eq('is_active', true)
  if (error) throw error
  return (data ?? [])
    .map((w) => ({
      id: w.id,
      name: cleanName(w.name),
      rawName: w.name,
      slug: slugify(cleanName(w.name)),
    }))
    .sort((a, b) => a.rawName.localeCompare(b.rawName))
}

// For the /tienda landing page: every active store with its live featured
// deals (daily/weekly promotions). Reads only safe store_* views. Deal price =
// percent off the normal store price, capped at 30% (matches checkout).
export async function listStoreWarehousesWithDeals(): Promise<StoreWithDeals[]> {
  const supabase = await createClient()
  const stores = await listStoreWarehouses()
  if (stores.length === 0) return []

  // All active online deal promotions across stores.
  const { data: promos } = await supabase
    .from('store_promotions')
    .select('product_id, warehouse_id, delta_percent, priority')

  // Resolve the product details + per-store normal prices we need.
  const productIds = [...new Set((promos ?? []).map((p) => p.product_id))]
  const nameById = new Map<string, { name: string; slug: string; base: number; img: string | null }>()
  if (productIds.length > 0) {
    const { data: prods } = await supabase
      .from('store_products')
      .select('id, name, slug, price_cents, primary_image_url')
      .in('id', productIds)
      .eq('is_active', true)
      .eq('visible_in_store', true)
    for (const p of prods ?? []) {
      nameById.set(p.id, { name: p.name, slug: p.slug, base: p.price_cents, img: p.primary_image_url })
    }
  }

  return Promise.all(
    stores.map(async (store) => {
      const relevant = (promos ?? []).filter(
        (p) => p.warehouse_id == null || p.warehouse_id === store.id,
      )
      if (relevant.length === 0) return { ...store, deals: [] }

      // Per-store price overrides for the deal products in this store.
      const ids = [...new Set(relevant.map((r) => r.product_id))]
      const { data: settings } = await supabase
        .from('store_product_settings')
        .select('product_id, is_visible, price_override_cents')
        .eq('warehouse_id', store.id)
        .in('product_id', ids)
      const settingByProduct = new Map(
        (settings ?? []).map((s) => [s.product_id, s]),
      )

      const seen = new Set<string>()
      const deals: StoreLandingDeal[] = []
      // Highest priority first so the best deal wins per product.
      const sorted = [...relevant].sort(
        (a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0),
      )
      for (const r of sorted) {
        if (seen.has(r.product_id)) continue
        const prod = nameById.get(r.product_id)
        if (!prod) continue
        const setting = settingByProduct.get(r.product_id)
        if (setting && setting.is_visible === false) continue
        const normal = setting?.price_override_cents ?? prod.base
        const pct = Number(r.delta_percent) || 0
        const dealCents = Math.round(normal * Math.max(0.7, 1 - pct / 100))
        if (dealCents >= normal) continue
        seen.add(r.product_id)
        deals.push({
          productId: r.product_id,
          name: prod.name,
          slug: prod.slug,
          imageUrl: prod.img,
          normalCents: normal,
          dealCents,
          percent: Math.round((1 - dealCents / normal) * 100),
        })
      }
      return { ...store, deals: deals.slice(0, 4) }
    }),
  )
}

export async function resolveStoreWarehouse(
  slug: string,
): Promise<StoreWarehouse | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('store_warehouses')
    .select('id, name')
    .eq('is_active', true)
  if (error) throw error

  const wanted = slugify(slug)
  const list = data ?? []
  const match =
    list.find((w) => slugify(cleanName(w.name)) === wanted) ??
    list.find((w) => slugify(w.name).includes(wanted))
  if (!match) return null

  return {
    id: match.id,
    name: cleanName(match.name),
    rawName: match.name,
    slug: wanted,
  }
}

export async function fetchStoreCatalog(
  warehouse: StoreWarehouse,
): Promise<StoreCatalog> {
  const supabase = await createClient()

  const { data: products, error } = await supabase
    .from('store_products')
    .select('id, sku, name, slug, price_cents, primary_image_url')
    .eq('is_active', true)
    .eq('visible_in_store', true)
    .order('name', { ascending: true })
  if (error) throw error
  if (!products || products.length === 0) {
    return {
      warehouse,
      products: [],
      offers: [],
      categories: [],
      dailyDeal: null,
      weeklyDeal: null,
    }
  }

  const ids = products.map((p) => p.id)

  const { data: whSettings } = await supabase
    .from('store_product_settings')
    .select('product_id, is_visible, price_override_cents')
    .eq('warehouse_id', warehouse.id)
    .in('product_id', ids)
  const settingByProduct = new Map<
    string,
    { is_visible: boolean; price_override_cents: number | null }
  >()
  for (const s of whSettings ?? []) {
    settingByProduct.set(s.product_id, {
      is_visible: s.is_visible,
      price_override_cents: s.price_override_cents,
    })
  }

  const { data: stockRows } = await supabase
    .from('store_inventory')
    .select('product_id, qty_on_hand')
    .eq('warehouse_id', warehouse.id)
    .in('product_id', ids)
  const stockByProduct = new Map<string, number>()
  for (const r of stockRows ?? []) {
    stockByProduct.set(r.product_id, Number(r.qty_on_hand) || 0)
  }

  // Active, non-expired online deal promotions (daily/weekly) for this store.
  // store_promotions exposes only featured promotions in their live window;
  // warehouse_id is null for "all stores" or a specific store id.
  const { data: dealRows } = await supabase
    .from('store_promotions')
    .select('product_id, warehouse_id, deal_slot, delta_percent, ends_at, priority')
    .or(`warehouse_id.is.null,warehouse_id.eq.${warehouse.id}`)
    .in('product_id', ids)
  const dealByProduct = new Map<
    string,
    { slot: 'daily' | 'weekly'; percent: number; endsAt: string | null; priority: number }
  >()
  for (const d of dealRows ?? []) {
    if (d.delta_percent == null) continue
    if (d.deal_slot !== 'daily' && d.deal_slot !== 'weekly') continue
    const prev = dealByProduct.get(d.product_id)
    const priority = Number(d.priority) || 0
    if (!prev || priority > prev.priority) {
      dealByProduct.set(d.product_id, {
        slot: d.deal_slot,
        percent: Number(d.delta_percent) || 0,
        endsAt: d.ends_at,
        priority,
      })
    }
  }

  const { data: primaryLinks } = await supabase
    .from('store_product_categories')
    .select('product_id, category_id')
    .in('product_id', ids)
    .eq('is_primary', true)
  const catIds = [...new Set((primaryLinks ?? []).map((r) => r.category_id))]
  const catNameById = new Map<string, string>()
  if (catIds.length > 0) {
    const { data: cats } = await supabase
      .from('store_categories')
      .select('id, name')
      .in('id', catIds)
    for (const c of cats ?? []) catNameById.set(c.id, c.name)
  }
  const catByProduct = new Map<string, { id: string; name: string }>()
  for (const l of primaryLinks ?? []) {
    const name = catNameById.get(l.category_id)
    if (name) catByProduct.set(l.product_id, { id: l.category_id, name })
  }

  const rows: StoreProduct[] = []
  for (const p of products) {
    const setting = settingByProduct.get(p.id)
    if (setting && setting.is_visible === false) continue // hidden in this store

    const base = p.price_cents
    const override = setting?.price_override_cents ?? null
    // The product's NORMAL price in this store: the per-store override if one
    // is set, otherwise the base price.
    const storeNormal = override != null ? override : base
    const deal = dealByProduct.get(p.id)
    // A featured deal's price: percent off the normal store price, with the
    // same 30% maximum discount cap as the in-person promotion rules.
    const dealPrice = deal
      ? Math.round(storeNormal * Math.max(0.7, 1 - deal.percent / 100))
      : null
    // The "was" price to compare against and strike through:
    //  - on a featured deal: the normal store price (so % off is honest)
    //  - on a plain override offer: the base list price
    const compareAt = deal ? storeNormal : base
    const eff = deal && dealPrice != null ? dealPrice : storeNormal
    const isOffer = eff < compareAt

    rows.push({
      id: p.id,
      sku: p.sku,
      name: p.name,
      slug: p.slug,
      basePriceCents: compareAt,
      priceCents: eff,
      isOffer,
      offerPercent: isOffer ? Math.round((1 - eff / compareAt) * 100) : 0,
      imageUrl: p.primary_image_url,
      category: catByProduct.get(p.id) ?? null,
      stock: stockByProduct.get(p.id) ?? 0,
      dealSlot: deal?.slot ?? null,
      dealEndsAt: deal?.endsAt ?? null,
    })
  }

  rows.sort(
    (a, b) =>
      (b.stock > 0 ? 1 : 0) - (a.stock > 0 ? 1 : 0) ||
      a.name.localeCompare(b.name),
  )

  // Generic price-override offers (NOT featured deals -- those get their own
  // sections so they don't appear twice).
  const offers = rows.filter((r) => r.isOffer && !r.dealSlot)

  // Featured daily / weekly deals. Section countdown = soonest end among its
  // products. Higher-priority (and in-stock) products first.
  function buildDeal(slot: 'daily' | 'weekly'): StoreDeal | null {
    const items = rows.filter((r) => r.dealSlot === slot)
    if (items.length === 0) return null
    const ends = items
      .map((r) => r.dealEndsAt)
      .filter((e): e is string => !!e)
      .sort()
    return { slot, endsAt: ends[0] ?? null, products: items }
  }
  const dailyDeal = buildDeal('daily')
  const weeklyDeal = buildDeal('weekly')

  const catMap = new Map<string, string>()
  for (const r of rows) if (r.category) catMap.set(r.category.id, r.category.name)
  const categories: StoreCategory[] = [...catMap.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return { warehouse, products: rows, offers, categories, dailyDeal, weeklyDeal }
}
