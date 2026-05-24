// Storefront catalog layer for the public online shop.
//
// Each warehouse is its OWN store. A product appears in a store when it is
// active + visible_in_store globally AND not explicitly hidden for that
// warehouse (product_warehouse_settings.is_visible). Price is the warehouse
// override if one exists, otherwise the base price — an override that is LOWER
// than the base price is treated as an "offer" for that store.
//
// Reads only existing tables/views:
//   products, product_categories, categories,
//   product_warehouse_settings, v_inventory_current, warehouses

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
  priceCents: number // effective price in this store (override if any)
  isOffer: boolean
  offerPercent: number // 0 when not an offer
  imageUrl: string | null
  category: { id: string; name: string } | null
  stock: number // qty on hand in THIS warehouse
}

export type StoreCategory = { id: string; name: string }

export type StoreCatalog = {
  warehouse: StoreWarehouse
  products: StoreProduct[]
  offers: StoreProduct[]
  categories: StoreCategory[]
}

function cleanName(raw: string): string {
  // Strip a leading "1-" / "2 - " style prefix used in admin names.
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

export async function resolveStoreWarehouse(
  slug: string,
): Promise<StoreWarehouse | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('warehouses')
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
    .from('products')
    .select('id, sku, name, slug, price_cents, primary_image_url')
    .eq('is_active', true)
    .eq('visible_in_store', true)
    .order('name', { ascending: true })
  if (error) throw error
  if (!products || products.length === 0) {
    return { warehouse, products: [], offers: [], categories: [] }
  }

  const ids = products.map((p) => p.id)

  const { data: whSettings } = await supabase
    .from('product_warehouse_settings')
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
    .from('v_inventory_current')
    .select('product_id, qty_on_hand')
    .eq('warehouse_id', warehouse.id)
    .in('product_id', ids)
  const stockByProduct = new Map<string, number>()
  for (const r of stockRows ?? []) {
    stockByProduct.set(r.product_id, Number(r.qty_on_hand) || 0)
  }

  const { data: primaryLinks } = await supabase
    .from('product_categories')
    .select('product_id, category_id')
    .in('product_id', ids)
    .eq('is_primary', true)
  const catIds = [...new Set((primaryLinks ?? []).map((r) => r.category_id))]
  const catNameById = new Map<string, string>()
  if (catIds.length > 0) {
    const { data: cats } = await supabase
      .from('categories')
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
    const eff = override != null ? override : base
    const isOffer = override != null && override < base

    rows.push({
      id: p.id,
      sku: p.sku,
      name: p.name,
      slug: p.slug,
      basePriceCents: base,
      priceCents: eff,
      isOffer,
      offerPercent: isOffer ? Math.round((1 - eff / base) * 100) : 0,
      imageUrl: p.primary_image_url,
      category: catByProduct.get(p.id) ?? null,
      stock: stockByProduct.get(p.id) ?? 0,
    })
  }

  rows.sort(
    (a, b) =>
      (b.stock > 0 ? 1 : 0) - (a.stock > 0 ? 1 : 0) ||
      a.name.localeCompare(b.name),
  )

  const offers = rows.filter((r) => r.isOffer)

  const catMap = new Map<string, string>()
  for (const r of rows) if (r.category) catMap.set(r.category.id, r.category.name)
  const categories: StoreCategory[] = [...catMap.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return { warehouse, products: rows, offers, categories }
}
