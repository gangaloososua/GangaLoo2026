# Feature Plan — Product Attributes & Store Filters

_Drafted 26 May 2026. Updated 26 May 2026 (session 3): **Stage 1 SHIPPED.** Read fully before writing code._

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

## CRITICAL CONTEXT (read-only schema check, session 2; re-confirmed session 3)
- Attribute scaffolding now EXISTS (Stage 1, session 3). See "Stage 1 — DONE" below.
- **The store is a SEPARATE set of tables from admin products.** Confirmed tables:
  admin side → `products`, `product_categories`, `product_images`,
  `product_warehouse_settings`, `product_locations`, `v_product_warehouse_price`.
  store side → `store_products`, `store_product_categories`, `store_product_images`,
  `store_product_settings`.
  => There is an **admin→store publish/sync bridge**. Attributes must travel across it
  to reach the storefront. This is why "store filter" is a later, separate stage from
  "assign attributes in admin". DO NOT assume admin data is automatically visible in store.
  **Before Stage 4, first thing: find and read the sync/publish code** (search for where
  `store_products` rows get written from `products`) so Stage 4 is designed correctly.
  (Not needed for Stages 2–3, which are admin-only.)

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

## STAGE 2 — Admin: manage attributes  ⟵ NEXT
A screen (likely under a settings/catalog area — check where categories are managed for
the pattern) to CRUD attributes and their values, so the owner can add "a new color"
themselves without a developer. Reuse existing category-management UI patterns if present.
First moves: find the categories-management screen, copy its structure; build CRUD for
`attributes` then `attribute_values`; expose the `single_value_only` toggle per attribute.
Server actions write to the Stage 1 tables (RLS already enforces staff-only). Typecheck +
commit + push as usual. Zero store risk.

## STAGE 3 — Admin: assign attributes on a product
A new tab on the product page — **same pattern as the Movements tab shipped session 2**
(see `app/(dashboard)/products/_form/` and how tabs wire into `product-form.tsx`, with
data fetched in `[id]/page.tsx` and passed as a prop). Tab lets the owner tick which
values (Black, 26", etc.) a product has. **Respects `single_value_only`** (enforce in the
tab UI + server action). Server action saves into `product_attribute_values`.
NOTE: product page is one big `<form>` — a new editable tab must NOT nest a `<form>`.
Follow how the other editable tabs (categories, warehouses) submit.
**Confirm per-attribute single/multi defaults with owner before/at this stage.**

## STAGE 4 — Store bridge (sync attributes admin→store)
Carry assigned attributes across the admin→store publish step. **READ THE SYNC CODE FIRST**
(search where `store_products` is written from `products`). Likely a
`store_product_attribute_values` table mirroring the admin link table, populated on publish.
Design depends entirely on how the existing sync works.

## STAGE 5 — Store filter UI
Surface attributes as customer-facing filters on the store listing page. Filter products
by selected values (e.g. Color = Black). Match the store's existing category-filter pattern
if one exists. Performance: the `idx_pav_value` reverse index (Stage 1) is for this.

---

## Next-session opening moves (Stage 2)
1. Find the existing categories-management admin screen; read its structure + server actions.
2. Build attributes CRUD (then attribute_values CRUD), reusing that pattern.
3. Surface the `single_value_only` toggle. Typecheck, commit, push. Checkpoint.
(Stage 1 recon already done — tables/RLS/conventions all recorded above.)
