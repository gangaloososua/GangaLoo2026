// Google Merchant Center product feed — served at /feed.xml
//
// Emits an RSS 2.0 feed in Google's Shopping format (g: namespace), one row
// per active, visible store product. Reuses the SAME guest-facing pricing the
// storefront grid uses (lib/store/catalog.ts → fetchStoreCatalog), so the feed
// price always matches what a logged-out shopper sees on the landing page —
// which is what Google requires (a feed/landing-page price mismatch gets items
// disapproved).
//
// Canonical store for links + price + availability: Maranatha. Google wants one
// link per product; products live under per-warehouse URLs, so we anchor the
// feed to the main store.
//
// No GTIN/MPN in the catalog, so we declare identifier_exists=no and supply a
// brand, which keeps items eligible.

import { resolveStoreWarehouse, fetchStoreCatalog } from '@/lib/store/catalog'

export const dynamic = 'force-dynamic'

const SITE = 'https://gangaloo.club'
const STORE_SLUG = 'maranatha'
const BRAND = 'GangaLoo'

// Escape the five XML special characters for safe text/attribute content.
function xml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// cents (integer DOP cents) → "1234.00 DOP"
function dop(cents: number): string {
  return `${(cents / 100).toFixed(2)} DOP`
}

export async function GET(): Promise<Response> {
  const warehouse = await resolveStoreWarehouse(STORE_SLUG)
  if (!warehouse) {
    return new Response('Store not found', { status: 404 })
  }

  const catalog = await fetchStoreCatalog(warehouse)

  const items: string[] = []
  for (const p of catalog.products) {
    // Google requires a usable image and a positive price; skip anything missing
    // them rather than submit an item that would be disapproved.
    if (!p.imageUrl) continue
    if (!Number.isFinite(p.priceCents) || p.priceCents <= 0) continue

    const link = `${SITE}/tienda/${STORE_SLUG}/${encodeURIComponent(p.slug)}`
    const title = p.name.slice(0, 150)
    const description = (p.category ? `${p.name} — ${p.category.name}` : p.name).slice(0, 5000)
    const availability = p.stock > 0 ? 'in stock' : 'out of stock'

    // Regular vs sale price. When the product is on offer, the higher
    // basePriceCents is the regular <g:price> and the lower effective price is
    // <g:sale_price> — both already guest-marked-up in DOP cents.
    const onSale = p.isOffer && p.basePriceCents > p.priceCents
    const priceTag = onSale
      ? `<g:price>${dop(p.basePriceCents)}</g:price>\n      <g:sale_price>${dop(p.priceCents)}</g:sale_price>`
      : `<g:price>${dop(p.priceCents)}</g:price>`

    items.push(
      `    <item>
      <g:id>${xml(p.sku || p.id)}</g:id>
      <g:title>${xml(title)}</g:title>
      <g:description>${xml(description)}</g:description>
      <g:link>${xml(link)}</g:link>
      <g:image_link>${xml(p.imageUrl)}</g:image_link>
      <g:availability>${availability}</g:availability>
      ${priceTag}
      <g:brand>${xml(BRAND)}</g:brand>
      <g:condition>new</g:condition>
      <g:identifier_exists>no</g:identifier_exists>
    </item>`,
    )
  }

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>GangaLoo</title>
    <link>${SITE}</link>
    <description>GangaLoo - extensiones de cabello de lujo.</description>
${items.join('\n')}
  </channel>
</rss>
`

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      // Let Merchant Center / CDNs cache for an hour; product/price changes
      // show up on the next fetch.
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  })
}
