# GangaLoo — Handoff addendum (session 2026-09-26, part 2: Discount Rules page, pre-planned deals, deal commissions)

_Continues `HANDOFF-addendum-2026-09-26.md` (bundles). Same owner and workflow. Everything below is committed, pushed, live, and checked by the owner._

## AC. Discount Rules page reorganized (commits `d673fa2`, `b95f10b`)

`app/(dashboard)/discount-rules/list-table.tsx`
- Name and Scope cells wrap (`whitespace-normal` + min widths), so the table fits the screen and the Edit/Delete buttons are visible.
- Page is now **grouped boxes**, in this order: Ofertas del día (one box per store), Ofertas de la semana (per store), Other promotions (per store), Combos (bundles), Coupons, Club tiers, Customer overrides, Bulk quantity, Surcharges. Store = `scopeWarehouseName`, else "All stores" (sorted last).
- Rules that are **off or past their end date** go in a closed `<details>` box "Off / expired" at the bottom.
- Window column has a tag: **Live** (green), **Upcoming** (amber, start in the future), Expired.
- Header shows "X running now · Y off or expired".
- `nowMs` comes from `React.useState(() => Date.now())` (lint purity rule).

## AD. Pre-planned daily/weekly deals (commit `a4191e1`)

`new/new-promotion-form.tsx`, `edit/edit-promotion-form.tsx`
- The online-deal section gained an optional **"Starts at"** (datetime-local) next to Deal type. Empty = start now (old behavior). Edit form pre-fills the existing start so saving keeps it (previously edit reset the start to "now" on every save).
- Validation: end must be in the future; start must be before end.
- No DB change needed: `store_promotions` (website) and the register resolver already respect `starts_at`, so a future deal stays hidden until it starts.
- Tip given to owner: chain deals by setting each start = previous end, so there is always exactly one deal per slot/store.

## AE. Deal commission (DB round-86a/b/c + commit `ad97394`)

**What it does:** a promotion (daily/weekly deal or plain promotion) can carry an optional **seller commission %**. While that promotion is live, sellers earn that % on that product at that store instead of the normal one.

**Owner decisions:**
- Deal commission **wins for everyone**: over the product's `commission_percent` AND over a seller's personal `profiles.commission_percent_override`.
- Online website orders use the time the **customer placed** the order (`sales.sold_at`), not the confirm time.
- Distributor commission (per-warehouse) is untouched.

**Database:**

| File | What |
|---|---|
| `round-86a-deal-commission-column.sql` | `discount_rules.commission_percent numeric` (nullable) + check 0–100. |
| `round-86b-deal-commission-helper.sql` | `deal_commission_percent(product, warehouse, at)` → commission % of the highest-priority LIVE promotion for that product/store at time `at` (active, in window, `ends_at > at`, warehouse null or match), else NULL. SECURITY DEFINER, revoked from public/anon/authenticated. |
| `round-86c-deal-commission-in-sales.sql` | **Patch script**: reads each live function with `pg_get_functiondef`, replaces ONE line (must be found exactly once, else stops and changes nothing), re-creates it. New formula everywhere: `coalesce(deal_commission_percent(...), seller override, product %, 0)`. |

Functions patched (verified live: exactly these 4 compute seller commission, all SECURITY DEFINER):
- `confirm_pos_sale(jsonb)`: `(v_product_id, v_source_warehouse_id, now())`
- `create_online_order(jsonb)`: `(v_product_id, v_source_warehouse_id, now())`
- `confirm_storefront_order(uuid, uuid)`: `(v_item.product_id, v_source_wh, sales.sold_at)`, i.e. the order-placed time
- `edit_unpaid_sale(uuid, jsonb, integer)`: `(v_product_id, v_src_wh, sales.sold_at)`, i.e. the original sale time

**Important for future rebuilds:** anyone rebuilding one of those 4 functions from an OLD migration file would silently lose the deal commission. Always rebuild from the live body (`pg_get_functiondef`); the patched line is marked `-- round-86c`.

**Code:**
- `lib/discount-rules.ts`: `commissionPercent` on `DiscountRuleRow` (selects `commission_percent`).
- `discount-rules/actions.ts`: `createPromotionRule` / `updatePromotionRule` accept `commissionPercent` (0–100 or null) and save `commission_percent`.
- `new/new-promotion-form.tsx`, `edit/edit-promotion-form.tsx`: field "Seller commission % during this deal (optional)" (empty = normal). `[id]/edit/page.tsx` passes the initial value.
- `list-table.tsx`: shows "Comm. X%" under the amount.

**Verified:** helper returns NULL before / 12 during / NULL after a deal (rolled-back test); recent sales without a deal still record the normal % (FAC-3005…3007); the live deal "Oferta del día Montellano" (13x4 180% 28" Negro Rizo Suave InDoo, 30%, Comm. 10%, 27 Sep 17:30 → 1 Oct 03:40 UTC) returns 10 from the helper. No real sale of the deal product had happened yet at handoff; to confirm on a real sale:

```sql
select s.invoice_number, s.sold_at, p.name,
       public.deal_commission_percent(si.product_id, s.source_warehouse_id, s.sold_at) as deal_pct_at_sale_time,
       sc.percent as recorded_pct
from sale_commissions sc
join sale_items si on si.id = sc.sale_item_id
join sales s on s.id = si.sale_id
join products p on p.id = si.product_id
where sc.earner_role = 'seller'
order by s.sold_at desc limit 10;
```

(Note: the column is `sale_commissions.earner_role`, not `role`; also `earner_id`, `percent`, `amount_cents`, `status`.)

## Next free migration number: **round-87**
