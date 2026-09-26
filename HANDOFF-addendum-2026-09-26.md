# GangaLoo — Handoff addendum (session 2026-09-26: Bundle discount rules / Combos)

_Same owner (Bernhard Perkins, non-technical), same workflow (one step at a time; SQL in Supabase SQL Editor first, then a record copy in `db/migrations/`; code delivered as files → copied in with the newest-download picker → `npx tsc --noEmit` → `git add` → `git commit` → `git push`). Everything below is committed, pushed, live on Netlify, and tested by the owner._

## AB. Bundle discount rules ("Combos") — NEW, live everywhere except the gaps listed at the end

A **bundle** = specific products bought together for **one set total price** (e.g. 1 wig + 1 phone = RD$13,000). New `discount_rules.kind = 'bundle'`.

### Owner decisions (2026-09-26) — these are the rules, keep them
- **Bundle price is FINAL**: bundled units get no other discount (club tier, club price, promotion, sale price, bulk, customer override). Units NOT used in a bundle still get normal discounts.
- **Repeats** per complete set (2 wigs + 2 phones = 2 bundles).
- **Not limited by the 30% cap.**
- If the bundle price would **not** be cheaper than what the customer already pays for those units, the bundle is **skipped** (customer never pays more).
- **Online guests** (not logged in) pay **bundle price + guest markup**, rounded **up to RD$25** (same rounding as guest product prices). Logged-in customers / Club members pay the exact bundle price.
- Optional per-store scope (`scope_warehouse_id`; blank = all stores) and optional start/end dates.

### First live bundle
"Peluca + Celular": 1× Ondulado 13x4 180% 30" Negro Aliafee + 1× Fuffi i7 Pro Max 8GB 256GB Negro, RD$13,000, Maranatha only, 25 Sept → 5 Oct 2026, with picture.

---

### Database (all run live, records in `db/migrations/`)

| File | What |
|---|---|
| `round-85a-bundle-rule-kind.sql` | `alter type discount_rule_kind add value 'bundle'` (must run alone — new enum value can't be used in the same transaction). |
| `round-85b-bundle-items-table.sql` | Rebuilt `discount_rules_shape_check` (all old clauses copied verbatim from live + `bundle`: `delta_cents > 0` and `delta_percent is null`). New table `discount_rule_bundle_items (rule_id → discount_rules ON DELETE CASCADE, product_id → products, qty int > 0, PK(rule_id, product_id))` + index on product_id, RLS on. |
| `round-85c-bundle-items-policy.sql` | RLS policy `discount_rule_bundle_items_staff_all` — exact mirror of `discount_rules_staff_all` (authenticated, profile role ≠ customer, ALL). |
| `round-85d-discount-rule-image.sql` | `discount_rules.image_url text` (bundle picture). Files go in public bucket `product-images` under `bundles/<rule_id>/`; existing bucket policies already allow it. |
| `round-85e-storefront-bundle-helper.sql` | `_storefront_bundle_allocations(p_wh, p_lines jsonb, p_markup)` → `(line_idx, rule_id, discount_cents)`. The ONE online bundle calculation, used by both functions below. SECURITY DEFINER, execute revoked from public/anon/authenticated (only called from the definer storefront functions). |
| `round-85f-quote-bundles.sql` | `get_storefront_quote` rebuilt from the **live** body; only change: collects `{idx, product_id, qty, unit_cents = v_unit_mem}` per line, subtracts bundle discount from `subtotal_after`, returns new `bundle_discount_cents`. `member_discount_cents` = before − after − bundle (meaning unchanged). |
| `round-85g-place-order-bundles.sql` | `place_storefront_order` rebuilt from the **live** body (= round-74a); only change: sale_items insert `returning id`, then a bundle pass BEFORE the coupon: adds the share to `sale_items.discount_cents` (`line_total_cents` is a GENERATED column = qty×unit − discount, so it follows) and inserts a `sale_discount_applications` row per bundled line (percent null, amount positive). `v_subtotal` reduced by the bundle total; returns `bundle_discount_cents`. Coupon applies to the bundle-reduced subtotal. |
| `round-85h-store-bundles-view.sql` | Public view `store_bundles` (same pattern as `store_promotions`): live bundles only (active, in window, ≥2 items, all items active + visible_in_store), fields id, name, image_url, warehouse_id, price_cents, ends_at, priority, created_at, items jsonb. `grant select to anon, authenticated`. |

Verified in SQL: helper → customer pays exactly 13,000; quote as guest → 18,500 before, −4,850 bundle, 13,650 after; `place_storefront_order` test inside a self-cancelling `DO` block (raise exception = guaranteed rollback) → subtotal 1,365,000, line totals 900,163 + 464,837 = 1,365,000 to the cent. (That test burned invoice number ONL-0066 — sequence only, no row.)

---

### Code (commits in order)

1. **`f8d47c5`** — DB records 85a–c + `lib/discount-rules.ts` (`'bundle'` kind, `BundleItem`, `bundleItems` loaded for bundle rules, later `imageUrl`), `lib/discount-rules-resolver.ts` (bundle is never a per-line candidate; `KIND_SORT_KEY.bundle = 6`), `discount-rules/list-table.tsx` ("Bundle" label, "1× A + 1× B • Store" summary, "Price … DOP").
2. **`1a3c067`** — New bundle form: `discount-rules/new/bundle/page.tsx`, `new/new-bundle-form.tsx` (2+ products, qty, price, store, dates, live "price check" showing savings vs regular `price_cents`), card on `new/page.tsx`, `createBundleRule` in `discount-rules/actions.ts`. NB: the products table price column is `price_cents` (the register calls it "base price" in code).
3. **`854f2d4`** — Caja register: NEW `lib/bundle-resolver.ts` (`resolveCartDiscounts`: takes bundled units out first, then runs the normal `resolveLineDiscount` on leftover units and merges). `caja/register.tsx`: every cart change goes through `recomputeAll()` (add, qty change, remove, member change); green "Combo: <name>" label under bundled lines. Existing per-line engine untouched.
4. **`71f4f8f`** — Edit bundles: pencil on bundle rows, `[id]/edit/page.tsx` now accepts promotion **or** bundle, `edit/edit-bundle-form.tsx` (separate copy of the new form, same pattern as promotions), `updateBundleRule` (updates row with `.eq('kind','bundle')`, replaces item list; restores old list if the insert fails).
5. **`1a6dfaf`** — Picture: `edit/bundle-image-field.tsx` (edit page uploads immediately; new form previews and uploads right after create), `uploadBundleImage` / `removeBundleImage` in actions (types jpg/png/webp/gif, 4.5 MB; replacing/removing deletes the old file, only ever inside `bundles/`), record 85d.
6. **`db114bb`** — Online store + records 85e–h: `lib/store/catalog.ts` (`StoreBundle`, reads `store_bundles`, guest price = ceil(price × (1+markup)/2500)×2500, shown only if all products visible here and cheaper than regular), `store-page.tsx` (`BundleSection` "Combos" above the daily deal; "Agregar combo" adds every product in its bundle qty), `carrito/cart-view.tsx` (quote call → "Combo −X" + "Total estimado"), `checkout/checkout-view.tsx` + `checkout/actions.ts` (`bundleDiscountCents` from quote and order; "Combo" line; total subtracts it; shown on the order-placed receipt).

---

### Keep in step (important)
- **Register** math = `lib/bundle-resolver.ts`. **Online** math = `_storefront_bundle_allocations` (SQL). Same rules; if one changes, change the other.
- Quote and order both call the same helper — never inline bundle logic into one of them only.
- Guest bundle rounding lives in 2 places: the SQL helper and `catalog.ts` (card display). Must match.
- The dormant SQL `resolve_line_discounts` is per-line and deliberately NOT mirrored (a bundle can't be expressed per line). Noted in both file headers.

### Known gaps / next-up (not started)
- Bundles are **not** applied in: staff **New sale** (`sales/new/new-sale-form.tsx`), staff **New online order** (`online-orders/new/new-online-order-form.tsx`), **Edit products** on an unpaid sale (`sales/[id]/edit-products/edit-products-view.tsx`). These still call only the per-line resolver; to add bundles, switch them to `resolveCartDiscounts` like the register.
- Product detail pages don't mention that a product is part of a combo.
- Split of the bundle discount between lines is by value (remainder to the last line); register and online may split cents slightly differently between lines, totals are identical.

### Gotchas from this session
- **Migration numbers**: the folder was far ahead of the notes (77, 79, 80, 83, 84 all taken). Always check the true highest first:
  `Get-ChildItem db\migrations -Filter 'round-*' | Sort-Object { [int]($_.Name -replace '^round-(\d+).*','$1') }, Name | Select-Object -Last 5 Name`
  Next free: **round-86**.
- **Downloads cleanup**: an old `actions.ts` (July) made the new one download as `actions (1).ts`. The newest-file picker handled it, but clear old copies before each step:
  `Get-ChildItem -Path "$dl\*" -Include 'name1*.ts','name2*.tsx' -File | Remove-Item` (don't combine `-LiteralPath` and `-Path` — PowerShell rejects it).
- **Paths with `[ ]`**: `git add` the parent folder in quotes (e.g. `git add "app/(dashboard)/discount-rules"`) instead of the bracketed file path.
- Long SQL (400+ lines) was delivered as the migration file itself: copy into `db/migrations`, open in Notepad, Ctrl+A/Ctrl+C into the SQL Editor.
- Pre-existing lint warnings (`set-state-in-effect`) in register, store-page, checkout-view and promotion forms were there before; only `tsc` is enforced by the pre-commit hook.
