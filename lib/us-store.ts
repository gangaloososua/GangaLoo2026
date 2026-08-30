// lib/us-store.ts
//
// US shop Phase 2 — PUBLIC storefront read layer.
// Reads US products through the SAFE SECURITY DEFINER functions
// (get_us_store_products / get_us_store_product), which compute the USD price
// inside the database and never expose cost or markup. Safe to call from the
// public /us pages (anon).
//
// Deliberately simple vs the DR store (lib/store/product.ts): no warehouse,
// no stock, no club/guest/deal pricing. US price is just override-or-markup,
// already resolved by the DB function.
//
// video_url + attributes are only ever populated on the single-product read
// (get_us_store_product); the grid function (get_us_store_products) doesn't
// select them, so they'll be undefined on grid rows — mapRow handles that.
import { createClient } from '@/lib/supabase/server'

export type UsStoreAttribute = {
  name: string
  values: string[]
}

export type UsStoreProduct = {
  id: string
  name: string
  slug: string
  description: string | null
  imageUrl: string | null
  priceUsd: number
  videoUrl: string | null
  attributes: UsStoreAttribute[]
}

type RawUsStoreRow = {
  id: string
  name: string
  slug: string
  description: string | null
  primary_image_url: string | null
  us_price_usd: number | string | null
  video_url?: string | null
  attributes?: UsStoreAttribute[] | null
}

function mapRow(r: RawUsStoreRow): UsStoreProduct {
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    description: r.description,
    imageUrl: r.primary_image_url,
    priceUsd:
      r.us_price_usd == null
        ? 0
        : typeof r.us_price_usd === 'string'
          ? Number(r.us_price_usd)
          : r.us_price_usd,
    videoUrl: r.video_url ?? null,
    attributes: r.attributes ?? [],
  }
}

export async function fetchUsStoreProducts(): Promise<UsStoreProduct[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_us_store_products')
  if (error) throw error
  return ((data ?? []) as RawUsStoreRow[]).map(mapRow)
}

export async function fetchUsStoreProduct(
  slug: string,
): Promise<UsStoreProduct | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_us_store_product', {
    p_slug: slug,
  })
  if (error) throw error
  const rows = (data ?? []) as RawUsStoreRow[]
  if (rows.length === 0) return null
  return mapRow(rows[0])
}
