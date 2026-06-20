# HANDOFF Addendum — 2026-06-20

## Storefront blank-grid bug (large catalogue) — fixed

**Symptom.** All stores showed "No hay productos" / 0 products in the grid, while
the `/tienda` landing page's deal carousels still worked normally. Started after
a bulk product import on 2026-06-19 ~05:07 that added 422 products, pushing the
visible-product count past ~700.

**Root cause.** `lib/store/catalog.ts` fetched stock (and other per-product data)
by passing the **entire** visible-product id list to `.in('product_id', ids)` in a
single PostgREST request. Past a few hundred UUIDs that request silently returned
empty (no error thrown) → every product read as out-of-stock → the grid's
`p.stock > 0` filter hid everything, across all stores at once.

Everything else was healthy and was verified during diagnosis: raw tables, the
`store_*` views, public/anon read permissions (anon saw all 764 products),
prices, images, stock (`store_inventory` returned 162 units at Montellano), and
the product↔stock id join all checked out. The Netlify deploy was green and the
browser console showed no error. The landing page (`listStoreWarehousesWithDeals`)
used a different, small-list path, which is why it kept working while the full
grid (`fetchStoreCatalog`) did not.

**Immediate unblock.** Hidden the photo-less imported products
(`visible_in_store = false where coalesce(primary_image_url,'') = ''`), which
dropped the visible list back under the limit so the grid loaded again.

**Permanent fix.** Added a `fetchByIds` helper to `catalog.ts` — splits id lists
into batches of 200, runs them concurrently, merges the rows, throws on any batch
error. Routed all 10 `.in(...)` id lookups through it: per-store settings, stock
(`store_inventory`), promotions, primary category links, attribute assignments,
attribute values, attribute metadata, and the two lookups in the landing-deals
path. All other logic (pricing, guest markup, club/sale price, promotions,
featured deals, category sort, attribute facets) is unchanged. Type-checks clean
under strict mode. Commit `517e88f`.

**Verified.** In production with 743 products visible (the exact condition that
blanked the grid that morning) the store loaded correctly. The catalogue can now
handle any size without blanking.

**Operational notes.**
- Photo-less products are intentionally hidden from the storefront (the grid/feed
  skip products with no image). The 422 imported products were set
  `visible_in_store = false` until each has a photo. To bring one back: add an
  image, then toggle "visible in store" on. No catalogue-size limit to worry about
  anymore.
- The Supabase SQL Editor runs each "Run" as its own session, so a `begin;` block
  followed by a *separate* `commit;` Run does **not** commit (the first run rolls
  back on its own). For one-off data changes, run a plain `UPDATE` (it auto-saves);
  confirm with a follow-up `SELECT count(*)` rather than trusting the
  "Success. No rows returned" message.

## Purchase-order edits (same session)
- Product on a paid-but-not-received PO can be changed safely with a single
  `update purchase_order_items set product_id = ... where id = <line_id> and
  product_id = <old_id>;` — the `and product_id` guard prevents touching the wrong
  row. Done for: 4x4→5x5 frontal (Purchase 50a0f8d0) and Ondulado→Lacio 20"
  (Purchase 5cc788c7). Inventory unaffected because neither was received.
- Short shipment (ordered 2, received 1): the received unit is already valued
  correctly in its `inventory_lots` row; the supplier refund is recorded as a
  manual positive entry in Accounting (same money account + category as the
  original `purchase_order_payments` row, currency = the account's currency),
  with a note on the PO. There is no built-in supplier-refund feature.
