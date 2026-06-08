# Handoff — Coupon Codes Feature

_Last updated: 2026-06-08. Covers rounds 42–43._

## What this feature does

Lets the shop issue **coupon codes** that take a discount off the merchandise
subtotal. A coupon can be a **percentage** (e.g. 15%) or a **fixed RD$ amount**,
and works across all three places an order is created: the **POS till**, the
**admin online-orders** screen, and the **public storefront**. Coupons are
created and managed from the admin **Discount rules** screen. There is also a
**QR-flyer flow**: a printed QR carries a code into the storefront and pre-fills
it at checkout.

Everything is validated **server-side** — the discount the customer sees is the
discount that is charged. The client value is never trusted.

---

## Design decisions (locked)

- A coupon is a new `coupon` kind inside the existing `discount_rules` table,
  alongside `bulk`, `club_tier`, `promotion`, `customer_override`,
  `logistics_surcharge`.
- Admin picks **either** a percentage (`delta_percent`, 0 < x ≤ 100) **or** a
  fixed RD$ amount (`delta_cents`, stored as a positive magnitude). Exactly one.
- Discount comes off the **merchandise subtotal** (after line/member discounts),
  **never off shipping**.
- Optional **store scope** (`scope_source_warehouse_id`; null = all stores) and
  optional **channel scope** (`scope_channel`: `pos` / `online`; null = both).
- Date window uses the existing `starts_at` / `ends_at`.
- Code uniqueness is enforced per (lower(code), store, channel) **among active
  coupons** via a partial unique index.
- Validation rule: **most-specific match wins** (store + channel > one-of >
  all), then oldest `created_at`.
- A manual order discount and a coupon can coexist (they sum, clamped so the
  total discount never exceeds the subtotal).
- Coupons never auto-apply per line — they apply only when a code is entered.

---

## Database objects

Migrations live in `db/migrations/` and were each applied in the Supabase SQL
Editor. Run order matters (the enum value must be committed before the functions
that reference it).

| File | What it does |
| --- | --- |
| `round-42-coupon-codes-01-schema.sql` | Adds the `coupon` enum value; adds columns `code`, `max_redemptions`, `scope_channel`; extends the `discount_rules` shape check; adds a guard on `max_redemptions`; adds the unique active-code partial index. |
| `round-42-coupon-codes-02-validate.sql` | `validate_coupon(p_code, p_source_warehouse_id, p_channel, p_base_cents, p_at)` — the single source of truth for whether a code applies and how much it takes off. |
| `round-42-coupon-codes-03-pos-rpc.sql` | `confirm_pos_sale` accepts `coupon_code` (channel `pos`). |
| `round-42-coupon-codes-04-online-rpc.sql` | `create_online_order` accepts `coupon_code` (channel `online`). |
| `round-42-coupon-codes-05-storefront-rpc.sql` | `place_storefront_order` accepts `coupon_code` (channel `online`). Invalid codes are **ignored, not fatal**; the order still goes through. Sets `sales.discount_cents` and writes an audit row. |
| `round-43-coupon-codes-06-quote-preview.sql` | `get_storefront_quote` previews the coupon discount (read-only) so the storefront can show it before the order is confirmed. |

### The validator: `validate_coupon`

Signature:

```
public.validate_coupon(
  p_code               text,
  p_source_warehouse_id uuid,        -- the store; null means "all stores"
  p_channel            sale_source,  -- 'pos' or 'online'
  p_base_cents         int,          -- subtotal to discount against
  p_at                 timestamptz default now()
) RETURNS TABLE(rule_id, name, delta_percent, delta_cents, discount_cents, reason)
```

`reason` is `ok` | `empty_code` | `invalid`. STABLE, SECURITY DEFINER, granted to
`authenticated` and `anon`. Every create-order path and the quote preview call
this with the same base, so they always agree.

### Relevant `discount_rules` columns

Existing: `id, kind, name, is_active, starts_at, ends_at, scope_*` (product,
category, warehouse, club_tier, customer, source_warehouse, fulfillment),
`threshold_qty, delta_percent, delta_cents, priority, created_at/by, updated_at,
deal_slot`. Added in round 42: **`code`**, **`max_redemptions`**,
**`scope_channel`**.

---

## Code by area

### Admin — create & manage coupons
- `app/(dashboard)/discount-rules/actions.ts` — `createCouponRule`.
- `app/(dashboard)/discount-rules/new/new-coupon-form.tsx` — the create form.
- `app/(dashboard)/discount-rules/new/coupon/page.tsx` — the page.
- `app/(dashboard)/discount-rules/new/page.tsx` — adds the "Coupon" chooser card.
- `app/(dashboard)/discount-rules/list-table.tsx` — coupon label + code/channel/store summary.
- `lib/discount-rules.ts` — `coupon` added to the `DiscountRuleKind` union, plus `code` / `scopeChannel` read fields.
- `lib/discount-rules-resolver.ts` — `coupon` added to `KIND_SORT_KEY`; coupons explicitly never auto-apply per line.

### POS till
- `app/(dashboard)/sales/actions.ts` — `coupon_code` on `ConfirmPosInput`; `previewCoupon` server action; friendly invalid-code error.
- `app/(dashboard)/sales/new/new-sale-form.tsx` — coupon box, live preview, totals line.

### Admin online orders
- `app/(dashboard)/online-orders/actions.ts` — `couponCode` in input + payload.
- `app/(dashboard)/online-orders/new/new-online-order-form.tsx` — coupon box, live preview (imports `previewCoupon` from the sales actions), totals line.

### Public storefront
- `app/(shop)/tienda/[warehouse]/checkout/actions.ts` — `couponCode` flows into `placeOnlineOrder`; `getOrderQuote` sends the code and returns the previewed discount.
- `app/(shop)/tienda/[warehouse]/checkout/checkout-view.tsx` — coupon box (pre-filled from a scanned flyer), debounced live preview line in *Resumen del pedido*, coupon line on the confirmation screen.

### QR-flyer capture
- `lib/store/flyer-coupon.ts` — client-side localStorage helper. Key `gl_flyer_coupon`, 14-day TTL. `saveFlyerCoupon` / `readFlyerCoupon` / `clearFlyerCoupon`.
- `app/(shop)/coupon-capture.tsx` — reads `?coupon=CODE` on any storefront page, saves it, strips it from the URL.
- `app/(shop)/layout.tsx` — mounts `<CouponCapture />` alongside `<InstallPrompt />`.

---

## The money path (why the charge is always correct)

`place_storefront_order` bakes the coupon into `sales.discount_cents`, so the
draft's `total_cents` (= subtotal − discount + shipping) is already reduced.
For card/PayPal, `startStripeCheckout` and `startPaypalCheckout` re-read the
**authoritative amount server-side** via `get_online_order_for_payment(saleId)`
*after* the draft exists — so the amount charged is the discounted total, never a
client-supplied or pre-coupon number. The PayPal return route captures that same
amount. No payment-route changes were needed for coupons.

---

## How to run a flyer campaign

1. In admin → Discount rules → **Coupon**, create the code (e.g. `VERANO15`),
   set percentage or RD$, choose **online** channel, set a store scope if you
   want it limited (or leave all-stores), set an end date.
2. Make a QR pointing at:
   `https://gangaloo.club/tienda?coupon=VERANO15`
   (One code per QR. New promo = new coupon + new QR.)
3. Print the flyer. **Also print the code in plain text** (e.g. "Use code
   VERANO15") so people who type the address by hand, or shop in person, can use
   it. Keep a quiet white margin around the QR so it scans reliably.

When a customer scans: the code is saved for 14 days, pre-filled at checkout,
shown as a discount line in *Resumen del pedido*, applied on the confirmed
order, and then cleared.

The current live coupon: **`ONLINE15`** — 15%, online, **Maranatha only** (by
design), valid through 2026-07-31. Its QR is the `gangaloo-ONLINE15-qr.svg` /
`.png` files.

---

## Dormant / future

- **`max_redemptions`** column and guard exist but are **not enforced** yet
  (null = unlimited). Turning on a usage cap is a code change only — count
  `sale_discount_applications` by `discount_rule_id` — no new migration needed.

## Known tradeoffs

- **Live storefront preview = a public code-validity surface.** Because the
  storefront can now preview a discount, the page can in effect tell whether a
  code is valid. This is acceptable for codes printed on public flyers; if you
  ever issue secret/high-value codes, consider rate-limiting the quote endpoint.
- **PWA caching.** The storefront is a PWA with a service worker. After a deploy,
  an old version can linger — close and reopen the installed app, or hard-refresh
  in the browser, to pick up changes.
- **Store/channel scope is silent.** A coupon scoped to one store simply doesn't
  apply at another (no error shown). That's intended, but worth remembering when
  testing — always test at the coupon's store/channel.

## Testing checklist

- `validate_coupon('<code>', '<store-uuid>', 'online', <subtotal_cents>)` returns
  `ok` and the expected `discount_cents`.
- Storefront: scan flyer → add an in-scope item → checkout shows the green
  `Cupón (CODE) −RD$…` line and the reduced Total → confirmed order carries the
  discount → card/PayPal charges the reduced amount.
- POS and admin online-orders: enter the code → preview shows the discount →
  saved sale records it.

## Commit history

The authoritative record is `git log --oneline` on `master`. The feature shipped
as a sequence of small, typecheck-clean commits with messages of the form:
`db: …` for migrations and `pos:` / `admin:` / `storefront:` for code. The most
recent are `storefront: capture flyer/QR ?coupon= and pre-fill checkout`,
`db: get_storefront_quote previews coupon discount`, and
`storefront: live coupon discount preview in order summary`.
