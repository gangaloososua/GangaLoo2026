# Feature Plan — Product Attributes & Store Filters

_Drafted 26 May 2026. Updated 26 May 2026 (session 3): **Stages 1 & 2 SHIPPED.** Read fully before writing code._

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

## Next-session opening moves (Stage 3 — assign attributes on a product)
1. Re-read the Movements-tab work (session 2) as the template: `products/_form/movements-tab.tsx`,
   how it's wired in `products/_form/product-form.tsx`, and how data is fetched in
   `products/[id]/page.tsx` and passed as a prop. The new Attributes tab follows this exactly.
2. Build an editable "Attributes" tab: list each active attribute and its values; let the
   owner tick which values this product has. **Enforce `single_value_only`** in the tab UI
   (radio-style / single-select when the flag is on; multi-select when off) AND in the save
   server action (defensive). Save into `product_attribute_values`.
3. CRITICAL: the product page is ONE `<form>` — the tab must NOT nest a `<form>`. Follow how
   the categories/warehouses editable tabs submit.
4. **Confirm per-attribute single/multi defaults with the owner** (e.g. Color = single) — this
   is the stage where the flag finally matters in the UI.
5. Typecheck, localhost test, commit, push. Checkpoint. (Stages 4–5 = store; read sync first.)

(Stages 1 & 2 recon + build done — schema, RLS, conventions, admin CRUD screen all shipped.)
