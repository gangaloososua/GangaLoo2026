# GangaLoo — Handoff Addendum (2026-06-18: storefront stock caps + Spanish mojibake repair)

_Appended to the prior handoffs. Same owner (**Bernhard Perkins**, non-technical), same workflow: work **one step at a time**, plain language, **DB before dependent code**, deliver **whole files + a PowerShell move script** (owner prefers complete files, not line edits; he copies them in via the newest-match picker), then publish `npx tsc --noEmit` → `git add` (explicit paths) → `git commit` → `git push` (**commit before push**; a pre-commit hook runs tsc). Everything below is committed, pushed, and live._

> This continues the 2026-06-17 part-2 session (transfers guard+scan, cancel restock, online out-of-stock block). The four items there are unchanged; this addendum adds the **cart/grid quantity caps** and a **storefront Spanish mojibake repair** that came after.

---

## A. What shipped this session

| Commit | What |
| --- | --- |
| `e553dda` | **Cart: cap quantity at available stock** (cart.ts maxQty + product page add + cart page stepper) |
| `2e859b0` | **Storefront: fix Spanish mojibake** (accents + emoji) in checkout-view, product-view, cart-view |
| `1548133` | **Storefront grid: cap quick-add at stock** (store-page grid `+`) **+ fix mojibake** in store-page |

No DB / migrations this session — all client-side. (The out-of-stock DB guard `round-74a` from the 2026-06-17 session is the server authority; these are UX caps on top of it.)

---

## B. Why this came up
The 2026-06-17 work added a SERVER block: `place_storefront_order` rejects an order whose lines exceed stock (`out_of_stock: <id>`), and the checkout shows a friendly "review your cart" message. That guarantees you can't oversell. BUT the customer could still BUILD an impossible cart (e.g. set qty 3 on a 1-in-stock item) and only hit the wall at "Confirmar pedido." Owner wanted the quantity capped earlier, with a clear "only N in stock" note so it doesn't feel like a broken button.

## C. The cart stock-cap model (commit `e553dda`)
The fix threads each item's available stock into the cart as **`maxQty`**, captured WHEN the item is added. (It can go stale if stock changes later — that's fine, the server block is the real authority; this is UX only.)

- `lib/store/cart.ts` — `CartItem` gained optional **`maxQty?: number`**. Added a module helper `clampMax(item, qty)` = `min(qty, maxQty>0 ? maxQty : qty)`. Both **`add`** and **`setQty`** now clamp to it. **Backward-safe:** items saved in localStorage before `maxQty` existed have no cap (default to their own qty), so old carts never break.
- `app/(shop)/tienda/[warehouse]/[producto]/product-view.tsx` — the detail-page add now passes `maxQty: product.stock`.
- `app/(shop)/tienda/[warehouse]/carrito/cart-view.tsx` — the quantity stepper: the **`+` is disabled at the cap** (`atMax(item)` helper) and shows a small note **"Solo N disponible(s)" / "Only N in stock"** (pluralized) when at max.

### Gap found on test + fixed (commit `1548133`)
Owner tested and could STILL add 3 — because he added from the **product GRID**, a different code path. `store-page.tsx`'s `handleAdd` (the card `+` button) called `cart.add(...)` WITHOUT `maxQty`. Fixed: it now passes `maxQty: p.stock` (the card already knows stock — it drives the "Últimas 1"/"Disponible" badge). **Lesson for future cart work:** there are TWO add paths — the product detail page (`product-view.tsx`) AND the grid card (`store-page.tsx` `handleAdd`). Any cart-item field must be set in BOTH. (`grep -rl 'cart\.add(' app/(shop)` finds them; only those two.)

**Caveat (told to owner):** `maxQty` only attaches to items added AFTER deploy. An item already sitting in the cart from before won't be capped until removed and re-added (or cart cleared). New adds are fine.

## D. Spanish mojibake repair (commits `2e859b0`, `1548133`)
**This is the 3rd+ time accents have broken** (see 2026-06-04 §W and 2026-06-17 §G — `nav.ts` twice). Root cause is NOT the text: a file gets re-saved through a non-UTF-8 (ANSI/CP1252) encoding at some point, which double-encodes the UTF-8 accent bytes (í → `Ã­`, ó → `Ã³`, · → `Â·`, × → `Ã—`, — → `â€"`, → → `â†'`, emoji 🛒 → `ðŸ›'`, etc.).

Found via a scan of `app/(shop)` for `Ã`/`Â`. Hits this session:
- `checkout-view.tsx` — 32 (the big one: Envío, Cupón, Código, Sosúa, país, línea, días, ×, ·, ¡Copiado!, and the WhatsApp message emojis 🛒👤📞📍🔑📦💰🚚💳 + divider rule).
- `product-view.tsx` — 3 (·, —, ¡Copiado!).
- `cart-view.tsx` — 1 (·).
- `store-page.tsx` — 10 (Día, categoría, sesión, obtén, menú, ¡Copiado!, ·, →, —).
- `lib/i18n/*` — **clean** (no hits).

**Repair method (programmatic, reliable):** the inverse of the corruption — re-encode the text as CP1252 to recover the original UTF-8 bytes, then decode as UTF-8. Done whole-file where it round-trips cleanly; **line-by-line** where a file had stray undefined control bytes (`0x8d`/`0x81`) inside mangled emoji (checkout had two — those lines were fixed by stripping the controls then round-tripping, and the pin emoji 📍 + divider `————` set directly). Verified 0 residual markers in all four files; BOM + line endings preserved.

> NOTE on verifying: Linux `grep -P '\xC3|\xC2'` will still "match" CLEAN files afterward because correct accented chars (í=C3 AD, ·=C2 B7) start with those lead bytes — that is NOT mojibake. The real test: the BROKEN pair `Ã<vowel>` / `ð\x9f` count is 0, `tsc` passes, and the live page renders `Envío`/`Cupón`. PowerShell `Select-String 'Ã|Â'` returned nothing on the fixed repo files (it doesn't flag the correct multibyte chars the way grep -P does).

**How to keep it fixed:** the download→copy path preserves bytes correctly. As long as files are COPIED in (not retyped, not round-tripped through PowerShell `Get-Content -Raw`/`WriteAllText`, which on PS 5.1 reads no-BOM UTF-8 as ANSI and re-mangles), they stay clean. **Keep the four storefront files (checkout-view / product-view / cart-view / store-page) as known-good copies** so a 4th break can be re-copied instead of re-fixed.

## E. Conventions reconfirmed
- Whole files + move script; newest-match picker. Watch for `(1)`-suffixed duplicate downloads — picker sorts by LastWriteTime so newest wins; the dupes are harmless and can be deleted.
- During this session Claude assembled/edited files in a scratch dir and DIFFED each against the uploaded original before delivering, to prove only the intended lines changed. Good practice for whole-file deliverables.
- Two storefront cart add paths must stay in sync (§C).
- All work this session committed cleanly (`git status` → working tree clean; `git log` shows `e553dda`, `2e859b0`, `1548133`).

## F. OPEN / WATCH (carried)
- Storefront mojibake is a RECURRING casualty — keep known-good copies, re-save UTF-8 (no BOM). Same for `lib/nav.ts` (broke twice before).
- Cart `maxQty` is per-add and can be stale if stock drops after adding; the server `out_of_stock` block (round-74a) is the backstop.
- Carried from prior addenda (still open): refunds don't auto-return cash (separate Return-money button); points have no clawback on refund/cancel; tier/loyalty config has two overlapping sets to clean up; `club_member_no` not on People `Profile` type; remaining single-phrase product-search boxes (Caja/transfers/online-orders/labels) could use the word-split fix; mobile menu for Club/Mayoreo/Cómo funciona; retire old `gangaloo.netlify.app`; member-number backfill for till-only members; Stripe Issuing fees unverified on `/club/tarifas`; cotizador fees duplicated in two files; US dropship Phase 3 (USD checkout) not built.

_End of 2026-06-18 addendum._
