// Storefront catalog layer for the public online shop.
//
// Reads only the SAFE public views (store_*), never the raw tables, so customer
// browsers never touch costs, commissions, or inventory value:
//   store_products, store_product_categories, store_categories,
//   store_product_settings, store_inventory, store_warehouses,
//   store_attributes, store_attribute_values, store_product_attribute_values

import { createClient } from '@/lib/supabase/server'

// --- ID batching ------------------------------------------------------------
// PostgREST sends `.in('col', ids)` as a URL query, and a URL has a finite
// length. Once the visible-product list grew past a few hundred ids, a single
// `.in(..., ids)` request silently returned empty (no error thrown) -> every
// product read as out-of-stock -> the whole grid went blank. To stay safe at
// any catalogue size we split id lists into batches and merge the results.
//
// 200 ids/batch keeps each request comfortably small (each id is a 36-char
// UUID). Batches run concurrently, so this is no slower in practice.
const ID_BATCH = 200

function chunkIds(ids: string[], size: number = ID_BATCH): string[][] {
  if (ids.length <= size) return ids.length ? [ids] : []
  const out: string[][] = []
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size))
  return out
}

// Run `query(batch)` for each chunk of `ids` and concatenate the rows. The
// callback receives one batch of ids and returns a Supabase query (a thenable
// that resolves to { data, error }). Throws if any batch errors, matching the
// original single-request behaviour.
async function fetchByIds<Row>(
  ids: string[],
  query: (batch: string[]) => PromiseLike<{ data: Row[] | null; error: unknown }>,
): Promise<Row[]> {
  const batches = chunkIds(ids)
  if (batches.length === 0) return []
  const results = await Promise.all(batches.map((batch) => query(batch)))
  const rows: Row[] = []
  for (const res of results) {
    if (res.error) throw res.error
    if (res.data) rows.push(...res.data)
  }
  return rows
}
// ---------------------------------------------------------------------------

export type StoreWarehouse = {
  id: string
  name: string // cleaned display name, e.g. "Maranatha"
  rawName: string // original, e.g. "1-Maranatha"
  slug: string // e.g. "maranatha"
  whatsapp?: string | null
  phone?: string | null
  address?: string | null
  city?: string | null
  mapsUrl?: string | null
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
  attributeValueIds: string[] // active attribute value ids assigned to this product
  stock: number // qty on hand in THIS warehouse
  dealSlot?: 'daily' | 'weekly' | null // featured deal slot, if any
  dealEndsAt?: string | null // when this product's deal ends (ISO), if any
}

export type StoreCategory = { id: string; name: string }

// Attribute filter facets surfaced to the storefront. Only attributes/values
// that actually appear among the shown products are included.
export type StoreAttributeValueFacet = { id: string; value: string; slug: string }
export type StoreAttributeFacet = {
  id: string
  name: string
  slug: string
  values: StoreAttributeValueFacet[]
}

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
  attributes: StoreAttributeFacet[]
  dailyDeal: StoreDeal | null
  weeklyDeal: StoreDeal | null
  isGuest?: boolean
  guestMarkupPct?: number
  isClubMember?: boolean
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
  return raw.replace(/^\s*\d+\s*[-\u2013\u2014]\s*/, '').trim()
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
    .select('id, name, whatsapp, phone, address, city, maps_url')
    .eq('is_active', true)
  if (error) throw error
  return (data ?? [])
    .map((w) => ({
      id: w.id,
      name: cleanName(w.name),
      rawName: w.name,
      slug: slugify(cleanName(w.name)),
      whatsapp: w.whatsapp ?? null,
      phone: w.phone ?? null,
      address: w.address ?? null,
      city: w.city ?? null,
      mapsUrl: w.maps_url ?? null,
    }))
    .sort((a, b) => a.rawName.localeCompare(b.rawName))
}

// For the /tienda landing page: every active store with its live FEATURED
// deals (daily/weekly promotions). Reads only safe store_* views. Deal price =
// percent off the normal store price, capped at 30% (matches checkout).
// Round 62: store_promotions now exposes ALL active promotions, so this
// landing carousel filters to FEATURED ones (deal_slot set) to stay unchanged.
export async function listStoreWarehousesWithDeals(): Promise<StoreWithDeals[]> {
  const supabase = await createClient()
  const stores = await listStoreWarehouses()
  if (stores.length === 0) return []

  // All active online deal promotions across stores. FEATURED only here.
  const { data: promos } = await supabase
    .from('store_promotions')
    .select('product_id, warehouse_id, deal_slot, delta_percent, priority')

  const featured = (promos ?? []).filter(
    (p) => p.deal_slot === 'daily' || p.deal_slot === 'weekly',
  )

  // Resolve the product details + per-store normal prices we need.
  const productIds = [...new Set(featured.map((p) => p.product_id))]
  const nameById = new Map<string, { name: string; slug: string; base: number; img: string | null }>()
  if (productIds.length > 0) {
    const prods = await fetchByIds<{
      id: string
      name: string
      slug: string
      price_cents: number
      primary_image_url: string | null
    }>(productIds, (batch) =>
      supabase
        .from('store_products')
        .select('id, name, slug, price_cents, primary_image_url')
        .in('id', batch)
        .eq('is_active', true)
        .eq('visible_in_store', true),
    )
    for (const p of prods) {
      nameById.set(p.id, { name: p.name, slug: p.slug, base: p.price_cents, img: p.primary_image_url })
    }
  }

  return Promise.all(
    stores.map(async (store) => {
      const relevant = featured.filter(
        (p) => p.warehouse_id == null || p.warehouse_id === store.id,
      )
      if (relevant.length === 0) return { ...store, deals: [] }

      // Per-store price overrides for the deal products in this store.
      const ids = [...new Set(relevant.map((r) => r.product_id))]
      const settings = await fetchByIds<{
        product_id: string
        is_visible: boolean
        price_override_cents: number | null
      }>(ids, (batch) =>
        supabase
          .from('store_product_settings')
          .select('product_id, is_visible, price_override_cents')
          .eq('warehouse_id', store.id)
          .in('product_id', batch),
      )
      const settingByProduct = new Map(
        settings.map((s) => [s.product_id, s]),
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
    .select('id, name, whatsapp, phone, address, city, maps_url')
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
    whatsapp: match.whatsapp ?? null,
    phone: match.phone ?? null,
    address: match.address ?? null,
    city: match.city ?? null,
    mapsUrl: match.maps_url ?? null,
  }
}

export async function fetchStoreCatalog(
  warehouse: StoreWarehouse,
): Promise<StoreCatalog> {
  const supabase = await createClient()

  const { data: products, error } = await supabase
    .from('store_products')
    .select('id, sku, name, slug, price_cents, primary_image_url, club_price_cents, sale_price_cents')
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
      attributes: [],
      dailyDeal: null,
      weeklyDeal: null,
    }
  }

  const ids = products.map((p) => p.id)

  // WAVE 1 - every lookup that only needs the product ids runs concurrently
  // (was previously one-after-another). Same data, far less waiting per switch.
  // Each lookup is now batched (fetchByIds) so a large product list can never
  // overflow a single request and silently return empty.
  const [whSettings, stockRows, dealRows, primaryLinks, pavRows] =
    await Promise.all([
      fetchByIds<{
        product_id: string
        is_visible: boolean
        price_override_cents: number | null
      }>(ids, (batch) =>
        supabase
          .from('store_product_settings')
          .select('product_id, is_visible, price_override_cents')
          .eq('warehouse_id', warehouse.id)
          .in('product_id', batch),
      ),
      fetchByIds<{ product_id: string; qty_on_hand: number }>(ids, (batch) =>
        supabase
          .from('store_inventory')
          .select('product_id, qty_on_hand')
          .eq('warehouse_id', warehouse.id)
          .in('product_id', batch),
      ),
      // Active, in-window promotions for this store. Round 62: store_promotions
      // now exposes ALL active promotions (not only featured daily/weekly ones);
      // warehouse_id is null for "all stores" or a specific store id. A plain
      // promotion (deal_slot null) lowers the price but is NOT a featured deal.
      fetchByIds<{
        product_id: string
        warehouse_id: string | null
        deal_slot: 'daily' | 'weekly' | null
        delta_percent: number | null
        ends_at: string | null
        priority: number | null
      }>(ids, (batch) =>
        supabase
          .from('store_promotions')
          .select('product_id, warehouse_id, deal_slot, delta_percent, ends_at, priority')
          .or(`warehouse_id.is.null,warehouse_id.eq.${warehouse.id}`)
          .in('product_id', batch),
      ),
      fetchByIds<{ product_id: string; category_id: string }>(ids, (batch) =>
        supabase
          .from('store_product_categories')
          .select('product_id, category_id')
          .in('product_id', batch)
          .eq('is_primary', true),
      ),
      // Attribute assignments for these products (Stage 4 store views).
      fetchByIds<{ product_id: string; attribute_value_id: string }>(ids, (batch) =>
        supabase
          .from('store_product_attribute_values')
          .select('product_id, attribute_value_id')
          .in('product_id', batch),
      ),
    ])

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

  const stockByProduct = new Map<string, number>()
  for (const r of stockRows ?? []) {
    stockByProduct.set(r.product_id, Number(r.qty_on_hand) || 0)
  }

  // Round 62: split the promotion concept into PRICE vs FEATURED.
  //  - promoPctByProduct: the top promotion's percent for ANY active promotion
  //    (plain or featured) -> lowers the displayed price, matching checkout
  //    and the product page.
  //  - dealByProduct: ONLY featured (daily/weekly) promotions -> drives the
  //    homepage countdown carousel + the grid's deal sections.
  // Both pick the highest-priority row per product.
  const promoPctByProduct = new Map<string, { percent: number; priority: number }>()
  const dealByProduct = new Map<
    string,
    { slot: 'daily' | 'weekly'; percent: number; endsAt: string | null; priority: number }
  >()
  for (const d of dealRows ?? []) {
    if (d.delta_percent == null) continue
    const priority = Number(d.priority) || 0
    const percent = Number(d.delta_percent) || 0

    const prevAny = promoPctByProduct.get(d.product_id)
    if (!prevAny || priority > prevAny.priority) {
      promoPctByProduct.set(d.product_id, { percent, priority })
    }

    if (d.deal_slot === 'daily' || d.deal_slot === 'weekly') {
      const prev = dealByProduct.get(d.product_id)
      if (!prev || priority > prev.priority) {
        dealByProduct.set(d.product_id, {
          slot: d.deal_slot,
          percent,
          endsAt: d.ends_at,
          priority,
        })
      }
    }
  }

  // Collect the ids the second wave depends on.
  const catIds = [...new Set((primaryLinks ?? []).map((r) => r.category_id))]

  const valueIdsByProduct = new Map<string, string[]>()
  const allValueIds = new Set<string>()
  for (const r of pavRows ?? []) {
    if (!valueIdsByProduct.has(r.product_id)) valueIdsByProduct.set(r.product_id, [])
    valueIdsByProduct.get(r.product_id)!.push(r.attribute_value_id)
    allValueIds.add(r.attribute_value_id)
  }

  // WAVE 2 - category names (needs catIds) and attribute values (needs value
  // ids) are independent of each other, so fetch them together too. Empty id
  // lists return no rows (no extra cost, no error). Both batched.
  const [cats, avRows] = await Promise.all([
    fetchByIds<{
      id: string
      name: string
      parent_id: string | null
      display_order: number | null
    }>(catIds, (batch) =>
      supabase
        .from('store_categories')
        .select('id, name, parent_id, display_order')
        .in('id', batch),
    ),
    fetchByIds<{
      id: string
      attribute_id: string
      value: string
      slug: string
      display_order: number
    }>([...allValueIds], (batch) =>
      supabase
        .from('store_attribute_values')
        .select('id, attribute_id, value, slug, display_order')
        .in('id', batch)
        .eq('is_active', true),
    ),
  ])

  // Round 63: carry each category's admin order (display_order) and parent so
  // the storefront can sort categories the SAME way they're arranged in admin
  // (instead of alphabetical). Names still drive display; order/parent are
  // used only for sorting below.
  const catInfoById = new Map<
    string,
    { name: string; parentId: string | null; order: number }
  >()
  for (const c of cats ?? [])
    catInfoById.set(c.id, {
      name: c.name,
      parentId: (c as { parent_id?: string | null }).parent_id ?? null,
      order: Number((c as { display_order?: number }).display_order ?? 0) || 0,
    })
  const catNameById = new Map<string, string>()
  for (const [id, info] of catInfoById) catNameById.set(id, info.name)
  const catByProduct = new Map<string, { id: string; name: string }>()
  for (const l of primaryLinks ?? []) {
    const name = catNameById.get(l.category_id)
    if (name) catByProduct.set(l.product_id, { id: l.category_id, name })
  }

  const valueMeta = new Map<
    string,
    { id: string; attribute_id: string; value: string; slug: string; display_order: number }
  >()
  const attrMeta = new Map<
    string,
    { id: string; name: string; slug: string; display_order: number }
  >()
  for (const v of avRows ?? []) valueMeta.set(v.id, v)

  // WAVE 3 - attribute metadata (needs the attribute ids from wave 2).
  const attrIds = [...new Set((avRows ?? []).map((v) => v.attribute_id))]
  if (attrIds.length > 0) {
    const aRows = await fetchByIds<{
      id: string
      name: string
      slug: string
      display_order: number
    }>(attrIds, (batch) =>
      supabase
        .from('store_attributes')
        .select('id, name, slug, display_order')
        .in('id', batch)
        .eq('is_active', true),
    )
    for (const a of aRows) attrMeta.set(a.id, a)
  }

  // Guest markup: visitors who are NOT logged in see prices marked up by the
  // store's guest_markup % (logged-in clients see normal prices). Applied here
  // so the product grid matches the checkout quote and the charge (both of which
  // apply the same markup server-side).
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
  // Guests: marked-up price, rounded UP to the next RD$25 (2500 cents).
  // Members: exact price (markupFrac is 0 and no rounding).
  const mk = (c: number) => {
    const v = c * (1 + markupFrac)
    return isGuest ? Math.ceil(v / 2500) * 2500 : Math.round(v)
  }

  // Club member: a logged-in customer with the Club toggle on pays the product's
  // club price (when one is set). Detected via a safe RPC (no direct profile read).
  // Matches the online charge (place_storefront_order) and the register.
  let isClubMember = false
  if (!isGuest) {
    try {
      const { data: m } = await supabase.rpc('get_my_is_club_member')
      isClubMember = m === true
    } catch {
      isClubMember = false
    }
  }

  const rows: StoreProduct[] = []
  for (const p of products) {
    const setting = settingByProduct.get(p.id)
    if (setting && setting.is_visible === false) continue // hidden in this store

    const base = p.price_cents
    const override = setting?.price_override_cents ?? null
    // The non-member NORMAL price in this store: per-store override if set, else base.
    const listNormal = override != null ? override : base
    // Club members pay the product's club price when one is set; everyone else pays
    // the list normal. (Loyalty still applies on top at checkout, as before.)
    const clubPrice =
      (p as { club_price_cents?: number | null }).club_price_cents ?? null
    const hasClub =
      isClubMember && clubPrice != null && clubPrice > 0 && clubPrice < listNormal
    let memberNormal = hasClub ? (clubPrice as number) : listNormal
    // Direct sale price (round-58c): logged-in shoppers start from the lower
    // of {current member/normal price, sale price}. Guests never get it.
    const salePrice =
      (p as { sale_price_cents?: number | null }).sale_price_cents ?? null
    if (!isGuest && salePrice != null && salePrice > 0 && salePrice < memberNormal) {
      memberNormal = salePrice
    }
    // Round 62: the PRICE-lowering promotion percent for this product (ANY active
    // promotion, plain or featured). Same 30% max-discount cap as in-person and
    // the checkout functions.
    const promo = promoPctByProduct.get(p.id)
    const promoPrice = promo
      ? Math.round(memberNormal * Math.max(0.7, 1 - promo.percent / 100))
      : null
    // FEATURED deal info (daily/weekly only) -> drives the carousel/sections.
    const deal = dealByProduct.get(p.id)
    // The "was" price to compare against and strike through:
    //  - club member with a club price: the list normal (so the club saving shows)
    //  - on a promotion: the member normal price (so % off is honest)
    //  - on a plain override offer: the base list price
    const compareAt = hasClub ? listNormal : promoPrice != null ? memberNormal : base
    const eff = promoPrice != null ? promoPrice : memberNormal
    const isOffer = eff < compareAt

    // Keep only value ids whose value (and its attribute) are active/known, so
    // a product is never matched by a value that isn't an offered facet.
    const attributeValueIds = (valueIdsByProduct.get(p.id) ?? []).filter(
      (vid) => {
        const v = valueMeta.get(vid)
        return !!v && attrMeta.has(v.attribute_id)
      },
    )

    rows.push({
      id: p.id,
      sku: p.sku,
      name: p.name,
      slug: p.slug,
      basePriceCents: mk(compareAt),
      priceCents: mk(eff),
      isOffer,
      offerPercent: isOffer ? Math.round((1 - eff / compareAt) * 100) : 0,
      imageUrl: p.primary_image_url,
      category: catByProduct.get(p.id) ?? null,
      attributeValueIds,
      stock: stockByProduct.get(p.id) ?? 0,
      // Featured slot/countdown ONLY for daily/weekly promotions. A plain
      // promotion has lowered the price above but is not a featured deal.
      dealSlot: deal?.slot ?? null,
      dealEndsAt: deal?.endsAt ?? null,
    })
  }

  rows.sort(
    (a, b) =>
      (b.stock > 0 ? 1 : 0) - (a.stock > 0 ? 1 : 0) ||
      a.name.localeCompare(b.name),
  )

  // Generic offers (price-override or plain promotion) -- NOT featured deals,
  // which get their own carousel sections so they don't appear twice.
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
  // Round 63: sort by the admin order. A sub-category sorts right after its
  // parent: rank = [parent's display_order, this category's display_order].
  // A main has no parent, so its parent-rank is its own order. Name breaks ties.
  const sortRank = (id: string): [number, number, string] => {
    const info = catInfoById.get(id)
    if (!info) return [Number.MAX_SAFE_INTEGER, 0, '']
    const parentOrder = info.parentId
      ? catInfoById.get(info.parentId)?.order ?? info.order
      : info.order
    const selfOrder = info.parentId ? info.order : -1 // mains before their subs
    return [parentOrder, selfOrder, info.name]
  }
  const categories: StoreCategory[] = [...catMap.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => {
      const [pa, sa, na] = sortRank(a.id)
      const [pb, sb, nb] = sortRank(b.id)
      return pa - pb || sa - sb || na.localeCompare(nb)
    })

  // Build attribute filter facets from the SHOWN rows only - so the filter only
  // offers attributes/values that actually exist among visible products. Order
  // attributes and values by their display_order (then name/value as tiebreak).
  const facetMap = new Map<
    string,
    {
      id: string
      name: string
      slug: string
      display_order: number
      values: Map<string, { id: string; value: string; slug: string; display_order: number }>
    }
  >()
  for (const r of rows) {
    for (const vid of r.attributeValueIds) {
      const v = valueMeta.get(vid)
      if (!v) continue
      const a = attrMeta.get(v.attribute_id)
      if (!a) continue
      if (!facetMap.has(a.id)) {
        facetMap.set(a.id, {
          id: a.id,
          name: a.name,
          slug: a.slug,
          display_order: a.display_order,
          values: new Map(),
        })
      }
      facetMap
        .get(a.id)!
        .values.set(v.id, { id: v.id, value: v.value, slug: v.slug, display_order: v.display_order })
    }
  }
  const attributes: StoreAttributeFacet[] = [...facetMap.values()]
    .sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name))
    .map((f) => ({
      id: f.id,
      name: f.name,
      slug: f.slug,
      values: [...f.values.values()]
        .sort((x, y) => x.display_order - y.display_order || x.value.localeCompare(y.value))
        .map((v) => ({ id: v.id, value: v.value, slug: v.slug })),
    }))

  return { warehouse, products: rows, offers, categories, attributes, dailyDeal, weeklyDeal, isGuest, guestMarkupPct, isClubMember }
}
