# Feature Plan — Product Attributes & Store Filters

_Drafted 26 May 2026. Updated 26 May 2026 (session 3): **ALL 5 STAGES SHIPPED — FEATURE COMPLETE.** Kept for reference + the one follow-up (bilingual attributes) noted at the bottom._

## Goal (in the owner's words)
Products are currently organized by categories, including a category per color.
The owner wants a proper **attribute system** — Color, Length, Texture, etc. — each
attribute having its own set of values, assignable per product, and ultimately
**filterable in the store** (e.g. a customer filters by color).

## Decisions already made with the owner
- **Full attribute system** (not just color) — build the general thing.
- **Keep categories as-is.** Do NOT migrate color out of categories. The owner will
  prune some subcategories manually. Attributes are a NEW PARALLEL layer; categories
  keep their current job. (We can retire color-categories later, once attributes are
  proven — but that is explicitly out of scope and not promised.)
- Multiple-values-per-attribute: **RESOLVED AT DB LEVEL, owner UI default still TBC.**
  The Stage 1 schema (M:N link table + `attributes.single_value_only` flag) physically
  supports BOTH single and multiple values; single-value is enforced in the APP (Stage 3),
  not the DB. So the owner's choice is now just a per-attribute flag value, never a schema
  change. Flag defaults to `false` (multi). **Confirm with owner before Stage 3** what the
  sensible defaults are per attribute (e.g. Color = single_value_only true). The only thing
  the owner could ask for that WOULD need new DDL is hard DB-level single-value enforcement
  with no flag — strictly more restrictive, additive later, not a rebuild.

## CRITICAL CONTEXT — CORRECTED in session 3 (the original assumption was WRONG)
- Attribute scaffolding EXISTS (Stage 1). Admin management + per-product assign EXIST
  (Stages 2–3). Store views EXIST (Stage 4). See stage sections below.
- **The original plan assumed an admin→store "sync/publish bridge" copying rows into store_*
  TABLES. THAT IS WRONG.** Reading `db/migrations/round-29b-storefront-public-views.sql`
  (session 3) showed the storefront reads **VIEWS** named `store_*`, defined directly over the
  admin base tables, exposing only customer-safe columns. There is **no copy step and nothing
  to publish** — admin data reaches the store the instant it's written, through the views.
  Security model: views run with owner rights (security_invoker off); the public gets `SELECT`
  on the VIEWS only (never base tables), so sensitive columns (cost, commission) stay hidden.
  The store layer (`lib/store/catalog.ts`) queries these views directly via the Supabase client
  and filters `is_active`/`visible_in_store` ITSELF in the query.
  => This made **Stage 4 tiny** (three parallel attribute views — DONE). And it makes
  **Stage 5** a pure front-end/query job against those views — no new backend.
- Store views now include (session 3): `store_attributes`, `store_attribute_values`,
  `store_product_attribute_values` — alongside the existing store_products / store_categories /
  store_product_categories / etc.

## Honest sizing
This is the BIG version — a real multi-part feature, several sessions. Build in stages,
test each before moving on. Stages 1–3 touch only admin and are zero-risk to the live
storefront. Stages 4–5 touch the store.

---

## STAGE 1 — Data foundation ✅ DONE (session 3, commit 2c2684b)
Migration file: `db/migrations/2026-05-26_attributes_stage1.sql`. Applied by hand in
Supabase SQL editor, verified (3 tables, RLS on, 1 policy each), committed + pushed.

Tables created (final, as-built):
- `attributes` — id uuid pk (default `uuid_generate_v4()`), name text, slug text
  **unique (global)**, display_order int default 0, is_active bool default true,
  **single_value_only bool default false**, created_at/updated_at timestamptz default now().
- `attribute_values` — id uuid pk, attribute_id uuid fk→attributes **on delete cascade**,
  value text, slug text, display_order, is_active, created_at/updated_at.
  **unique (attribute_id, slug)** (slug scoped per attribute, mirrors categories(parent_id,slug)).
  Index `idx_attribute_values_attribute (attribute_id, display_order)` for ordered listing.
- `product_attribute_values` — product_id uuid fk→products **on delete cascade**,
  attribute_value_id uuid fk→attribute_values **on delete cascade**,
  pk (product_id, attribute_value_id). Reverse index `idx_pav_value (attribute_value_id)`
  for "all products that are Black" (matters for Stage 5 store filter).
- RLS: one `*_staff_all` ALL policy per table, `{authenticated}`, `role <> 'customer'`,
  same USING/WITH CHECK — copied verbatim from `product_categories_staff_all`.

Conventions verified against live schema before building (no guessing): entity tables use
`uuid_generate_v4()` (NOT gen_random_uuid), timestamptz default now(), is_active default
true, display_order default 0, NOT-NULL slugs with scoped uniqueness. `categories` has **no
updated_at trigger** (checked) → new tables intentionally have none either; consistent.

**Carry-forward design note:** all three FKs are `on delete cascade` — this was OUR design
choice, NOT copied from product_categories (its on-delete actions were not read). Sensible
for child/link rows + is_active gives soft-delete. Worth an explicit owner/Perkins nod, but
nothing depends on it until products/attributes actually get deleted.

## STAGE 2 — Admin: manage attributes ✅ DONE (session 3, commit 6fd7695)
Screen at `app/(dashboard)/attributes/` — built by mirroring the `categories/` screen
almost exactly. Owner-only (`requireOwner()` on page + write actions; `requireAdminCaller()`
on reads). Two-level nested UI: attributes are "main" rows (with a "Single value" badge when
`single_value_only`), their values nest beneath. Drag-to-reorder both levels (dnd-kit, same
as categories). Reused the exact `slugify()` helper; new rows drop at bottom; `updated_at`
set in the action (no DB trigger). Delete is guarded: refuses to delete an attribute that
still has values, refuses to delete a value still assigned to products (cascade is backstop
only). Postgres unique-violation (23505) mapped to a friendly message for the owner.
Files (NEW): `actions.ts`, `page.tsx`, `attributes-table.tsx`, `attribute-dialog.tsx`,
`value-dialog.tsx`, `delete-dialog.tsx`. MODIFIED: `lib/nav.ts` (added "Attributes" item
after Categories, OWNER_ONLY, icon `Tag`, i18n es "Atributos"). Typecheck clean, tested on
localhost (create/edit/reorder/delete + guard all confirmed), committed + pushed. Zero store risk.
**Deliberate deviations from categories (by design):** (1) values can't be re-parented to
another attribute — "Black" belonging to "Color" is fixed; (2) friendly 23505 handling.
**NOTE:** `single_value_only` is STORED here but NOT yet enforced — enforcement is Stage 3
(the assign-on-product UI), since that's the only place a product picks values.

## STAGE 3 — Admin: assign attributes on a product ✅ DONE (session 3, commit 6caab98)
New "Attributes" tab on the product page (between Categories and Images), built on the
editable-tab pattern (NOT the product `<form>` submit — saves via its own action, like
categories-tab). Owner decided: **single value per attribute in production** (e.g. one Color).
The tab respects `single_value_only` generically: renders a single-select dropdown ("— Not
set —" + values) for single-value attributes, and a checkbox list for any multi-value ones
(none in use today, but correct if a flag is flipped later). Save replaces the product's set
in `product_attribute_values` (delete-all-then-insert, like saveProductCategories) and
**enforces single-value server-side** (rejects >1 value from a single-value attribute — never
trusts the client). Empty state points the owner to the Attributes screen.
Files NEW: `app/(dashboard)/products/_form/attributes-tab-actions.ts` (reads:
listActiveAttributesWithValues, getProductAttributeValueIds; write: saveProductAttributes —
all owner/admin gated to match saveProductCategories), `attributes-tab.tsx`. MODIFIED:
`product-form.tsx` (import + 2 props + trigger + content block), `[id]/page.tsx` (2 fetches
in the Promise.all + 2 props). Typecheck clean, localhost-tested (tab loads real attributes,
save persists across reload), committed + pushed. **Zero store risk — all admin so far.**
NOTE: data-read helpers live in the new `_form` file (not lib/products.ts) to keep the change
self-contained; minor deviation from where categories' reads live, flagged here.

## STAGE 4 — Store views ✅ DONE (session 3, commit 9c3dbfd)
**Reframed once we read the code: NOT a sync bridge — just views** (see CORRECTED context
above). Migration `db/migrations/2026-05-26_attributes_stage4_store_views.sql`, applied in
Supabase, verified (3 views, anon+authenticated SELECT granted), data-flow confirmed by a
3-view join returning real rows. Mirrors `round-29b`: three `create or replace view`s exposing
customer-safe columns, `grant select … to anon, authenticated`, `notify pgrst`.
Views: `store_attributes` (id, name, slug, display_order, is_active),
`store_attribute_values` (id, attribute_id, value, slug, display_order, is_active),
`store_product_attribute_values` (product_id, attribute_value_id — mirrors
store_product_categories). NO single_value_only / timestamps exposed. `is_active` exposed as a
COLUMN (consumer filters it, matching catalog.ts), not pre-filtered in the view. Additive,
re-runnable, zero write-path risk.

## STAGE 5 — Store filter UI ✅ DONE (session 3, commits 00071ee data, 102e96e UI)
Customer-facing attribute filters on the store listing (`app/(shop)/tienda/[warehouse]/`).
Built in two parts: **5a** extended `lib/store/catalog.ts` to fetch attribute facets +
per-product value ids from the Stage-4 views (facets built from SHOWN rows only; only
active values); **5b** added the UI in `store-page.tsx`. Filters = multi-select chip rows
under the category bar (one per attribute) AND in the slide-out menu ("both places");
AND across attributes, OR within. Selections sync to the URL as `?attrSlug=valSlug,valSlug`
silently via `window.history.replaceState` (NOT useSearchParams — avoids the Suspense-boundary
requirement, keeps the change in one file) and are read back on load → shareable/bookmarkable.
Reverse filtering backed by Stage-1 `idx_pav_value`. Typecheck clean, localhost-tested
(filter combine, URL share/restore, menu, search-override, Spanish strings), LIVE.

---

## ✅ FEATURE COMPLETE — all 5 stages shipped (session 3)
1 schema (2c2684b) · 2 admin mgmt screen (6fd7695) · 3 per-product assign (6caab98) ·
4 store views (9c3dbfd) · 5 store filter UI (00071ee + 102e96e). Owner can define attributes,
assign them per product (single-value), and customers can filter the store by them.

## Follow-ups (NOT done — deliberately deferred)
- **Bilingual attributes.** Attribute names/values are single plain-text entries (e.g.
  "Pulgadas", "Color"), so they don't translate when a shopper flips ES/EN. This matches
  categories (also not translated), so the store is at least consistent. Proper fix = optional
  `name_en`/`value_en` columns + admin inputs (Stage 2 dialogs) + expose in store views +
  carry through catalog.ts + pick by locale in store-page.tsx — a mini-feature touching all
  layers. Natural home: roadmap item 21 (Spanish UI / es-DO). Owner chose "leave as is for now."
- **Stage-1 CASCADE FKs** are our design choice, owner nod still pending (low priority — admin
  delete guards mean cascade is only a backstop).
