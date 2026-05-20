# Round 16 — Sale-discount auto-application

Master spec covering all sale-discount mechanisms. Implementation is
sliced across **Rounds 16–20**, one mechanism per round (user
direction, session 2026-05-20). Round 16 implements the simplest
mechanism (customer-specific override) and lays the schema groundwork
that subsequent rounds extend.

## 1. Overview

Sales today take discounts entirely manually. The POS form (`sales/new`)
and the online-order form (`online-orders/new`) both expose
`line_discount` and `order_discount` inputs that operators type by hand.
The schema has the columns (`sale_items.discount_cents`,
`sales.discount_cents`) and a club-tier mechanism via
`products.club_price_cents` that auto-applies in the POS price
resolver, but that's the extent of automation.

Round 16 introduces a **rules-driven auto-discount engine** shared by
POS and online. Rules live in a new `discount_rules` table; applied
discounts are recorded per-rule in a new `sale_discount_applications`
audit table. Multiple rules can fire on one line; they stack
multiplicatively with a hard cap. Sellers can override by typing a
manual discount on a line, which silences all auto-rules for that
line.

## 2. Locked decisions (session 2026-05-20)

| Decision | Value | Notes |
|---|---|---|
| **Scope** | All 5 rule kinds | Across Rounds 16–20, one per round |
| **Stacking** | Multiplicative | Compound; safer math than additive |
| **Cap** | 30% effective max per line | Hard ceiling; if compounded discount > 30%, capped |
| **Manual override scope** | Per-line | Manual discount silences auto-rules for that line only; other lines still auto-discount |
| **Manual vs auto** | Manual wins | When seller types a manual line discount, auto-rules do not contribute |
| **Audit** | Per-applied-rule | Reports can attribute discount to specific rules ("Black Friday drove X DOP") |
| **Engine** | Shared POS + online | Same rules table feeds both surfaces |
| **Application timing** | At cart-add | Discount visible immediately; not deferred to confirm |

## 3. The 5 rule kinds

The user originally picked 6 mechanisms; two of them ("time-bound
promotions" + "category-wide promotion") merge naturally into a single
`promotion` rule type with optional date bounds AND optional category
scope. So the schema has 5 kinds but all 6 use cases are covered.

### 3.1 `bulk` — quantity-tier discount

Apply % off when line qty meets/exceeds a threshold.

- **Rule fields**: `scope_product_id` OR `scope_category_id` (one of), `threshold_qty`, `delta_percent`
- **Use cases**:
  - "Buy 6+ bottles of any shampoo → 10% off" (category scope)
  - "Buy 12+ Ondulado → 15% off" (product scope)
- **Proposed round**: 18

### 3.2 `club_tier` — % discount by club tier

Apply % off to all lines for customers in a specific club tier.
Independent from `products.club_price_cents` (which is a fixed
alternative price, not a percentage discount).

- **Rule fields**: `scope_club_tier`, `delta_percent`
- **Use cases**:
  - "Gold tier → 5% off entire order"
  - "Platinum tier → 8% off entire order"
- **Proposed round**: 17

### 3.3 `promotion` — time-bound, optional scope

The broadest rule. Apply % off during a date window, optionally scoped
to a product, category, or warehouse.

- **Rule fields**: `starts_at`, `ends_at`, optionally any of
  `scope_product_id`/`scope_category_id`/`scope_warehouse_id`,
  `delta_percent`
- **Use cases**:
  - "Black Friday week (20-Nov to 27-Nov), 20% off all shampoos"
    (category + time)
  - "Easter sale (15-Apr to 22-Apr), 15% off everything"
    (time only, no scope)
  - "Sosúa warehouse clearance, 25% off product X for one month"
    (product + warehouse + time)
- **Proposed round**: 19

### 3.4 `customer_override` — per-customer fixed %

Customer-specific discount. Applies to every line for that customer.
Replaces the originally-considered `profiles.discount_percent_override`
column — using the rules table keeps audit and management consistent.

- **Rule fields**: `scope_customer_id`, `delta_percent`
- **Use cases**:
  - "Wholesale account Maria Pérez → 15% off everything"
  - "Press & influencer accounts → 50% off (rare exception, would
    blow the 30% cap unless cap is per-mechanism — see §5.3)"
- **Proposed round**: 16 (this round, the smallest)

### 3.5 `logistics_surcharge` — pickup transfer fee

Surcharge, **not a discount**. Positive contribution to total when
source ≠ fulfillment warehouse on pickup orders. Currently manual via
`shipping_cents` in the 15.7 form; auto-fill replaces that on
qualifying orders.

- **Rule fields**: `scope_source_warehouse_id`, `scope_fulfillment_warehouse_id`, `delta_cents` (positive)
- **Use cases**:
  - "Pickup at Sosúa from Montellano stock → 500 DOP transfer fee"
  - "Any cross-warehouse pickup → flat 300 DOP"
- **Proposed round**: 20

## 4. Schema

### 4.1 New enum: `discount_rule_kind`

```sql
CREATE TYPE public.discount_rule_kind AS ENUM (
  'bulk',
  'club_tier',
  'promotion',
  'customer_override',
  'logistics_surcharge'
);
```

### 4.2 New table: `discount_rules`

Unified table with kind enum. Polymorphic columns — some apply per
kind, others are NULL. A CHECK constraint enforces the required
fields per kind.

```sql
CREATE TABLE public.discount_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind public.discount_rule_kind NOT NULL,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,

  -- Time window (optional; promotion uses it)
  starts_at timestamptz,
  ends_at timestamptz,

  -- Scope filters (any combination, depending on kind)
  scope_product_id uuid REFERENCES public.products(id),
  scope_category_id uuid REFERENCES public.categories(id),
  scope_warehouse_id uuid REFERENCES public.warehouses(id),
  scope_club_tier public.club_tier,
  scope_customer_id uuid REFERENCES public.profiles(id),
  scope_source_warehouse_id uuid REFERENCES public.warehouses(id),
  scope_fulfillment_warehouse_id uuid REFERENCES public.warehouses(id),

  -- Trigger / amount fields
  threshold_qty numeric,
  delta_percent numeric, -- 5.0 = 5% off
  delta_cents int,       -- positive only (surcharges)

  priority int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),

  -- Required-fields shape check per kind
  CONSTRAINT discount_rules_shape_check CHECK (
    (kind = 'bulk'
      AND threshold_qty IS NOT NULL
      AND delta_percent IS NOT NULL
      AND (scope_product_id IS NOT NULL OR scope_category_id IS NOT NULL))
    OR (kind = 'club_tier'
      AND scope_club_tier IS NOT NULL
      AND delta_percent IS NOT NULL)
    OR (kind = 'promotion'
      AND delta_percent IS NOT NULL)
    OR (kind = 'customer_override'
      AND scope_customer_id IS NOT NULL
      AND delta_percent IS NOT NULL)
    OR (kind = 'logistics_surcharge'
      AND delta_cents IS NOT NULL
      AND delta_cents > 0)
  )
);

CREATE INDEX discount_rules_active_idx
  ON public.discount_rules(kind, is_active)
  WHERE is_active = true;

CREATE INDEX discount_rules_scope_product_idx
  ON public.discount_rules(scope_product_id)
  WHERE scope_product_id IS NOT NULL AND is_active = true;

CREATE INDEX discount_rules_scope_customer_idx
  ON public.discount_rules(scope_customer_id)
  WHERE scope_customer_id IS NOT NULL AND is_active = true;
```

### 4.3 New table: `sale_discount_applications`

Audit trail. One row per rule that fired on a sale_item (line-level)
or sale (order-level surcharges).

```sql
CREATE TABLE public.sale_discount_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid REFERENCES public.sales(id) ON DELETE CASCADE,
  sale_item_id uuid REFERENCES public.sale_items(id) ON DELETE CASCADE,
  discount_rule_id uuid REFERENCES public.discount_rules(id),
  is_manual boolean NOT NULL DEFAULT false,
  rule_kind public.discount_rule_kind,
  percent numeric,
  amount_cents int NOT NULL, -- negative for discount, positive for surcharge
  cap_hit boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),

  -- Either line-level OR order-level (XOR)
  CONSTRAINT app_target_check CHECK (
    (sale_item_id IS NOT NULL AND sale_id IS NULL)
    OR (sale_item_id IS NULL AND sale_id IS NOT NULL)
  ),
  -- Manual entries have no rule; rule-based entries have no is_manual
  CONSTRAINT app_source_check CHECK (
    (is_manual = true AND discount_rule_id IS NULL)
    OR (is_manual = false AND discount_rule_id IS NOT NULL)
  )
);

CREATE INDEX sda_sale_idx ON public.sale_discount_applications(sale_id);
CREATE INDEX sda_sale_item_idx ON public.sale_discount_applications(sale_item_id);
CREATE INDEX sda_rule_idx ON public.sale_discount_applications(discount_rule_id);
```

### 4.4 No changes to existing tables

`sale_items.discount_cents` and `sales.discount_cents` retain their
current meaning: the final, after-rules amount. The audit table is
the source of truth for which rules contributed.

## 5. Resolution algorithm

### 5.1 When does it fire?

In the cart UI:
- Item added → recompute for that line
- Item qty changed → recompute for that line
- Item removed → no-op (line is gone)
- Customer changed → recompute for ALL lines (different customer = different applicable rules)
- Manual discount entered/cleared on a line → recompute (or skip) that line

In the create-sale RPC:
- Server re-resolves and writes the audit rows (cart-time resolution
  is for UX; server is the source of truth for what gets persisted)

### 5.2 Per-line resolution

For a line with `product_id`, `qty`, `unit_price_cents`,
`customer_id`, `source_warehouse_id`, current timestamp:

1. **If a manual discount is set** on the line, skip auto-rules entirely.
   Write ONE audit row with `is_manual = true`.

2. Otherwise, find candidate rules where:
   - `is_active = true`
   - `kind != 'logistics_surcharge'` (that's order-level)
   - Time window matches (`starts_at <= now <= ends_at`, NULLs treated as open-ended)
   - Scope filters match:
     - `scope_product_id IS NULL OR scope_product_id = line.product_id`
     - `scope_category_id IS NULL OR scope_category_id = product.category_id`
     - `scope_warehouse_id IS NULL OR scope_warehouse_id = line.source_warehouse_id`
     - `scope_club_tier IS NULL OR scope_club_tier = customer.club_tier`
     - `scope_customer_id IS NULL OR scope_customer_id = customer.id`
   - Kind-specific:
     - `bulk`: `line.qty >= threshold_qty`

3. Sort by `priority DESC` then `created_at ASC` for stable order.

4. Compound multiplicatively:
   ```
   effective_factor = 1.0
   for rule in candidates:
     factor = 1.0 - (rule.delta_percent / 100.0)
     effective_factor *= factor
   ```

5. Cap: if `(1.0 - effective_factor) > 0.30`, set
   `effective_factor = 0.70` and mark all contributing audit rows
   `cap_hit = true`.

6. Compute `discount_cents = round(unit_price_cents * qty * (1.0 - effective_factor))`.

7. Write `sale_items.discount_cents = discount_cents`.

8. Write one audit row per contributing rule, with each row's
   individual `percent` and `amount_cents` (the marginal contribution
   that rule made, see §5.4 for how to attribute).

### 5.3 Order-level resolution (logistics_surcharge)

After all lines are resolved:

1. If `source_warehouse_id != fulfillment_warehouse_id` AND
   `fulfillment_method = 'pickup'`:
2. Find matching `logistics_surcharge` rules.
3. Sum `delta_cents` (additive, not multiplicative — these are fixed amounts).
4. Write to `sales.shipping_cents` (existing column).
5. Audit rows at `sale_id` level (`sale_item_id IS NULL`).

### 5.4 Attributing audit amounts

When rules compound, attributing "how much did rule X contribute" is
ambiguous. Convention:

- Each audit row's `percent` field stores the rule's own delta_percent.
- Each audit row's `amount_cents` is the marginal step: the difference
  between the running discount before this rule and after.

Example: 100 DOP line, 10% rule then 5% rule, multiplicative:
- After 10%: 90 DOP (discount so far = 10)
- After 5%:  85.5 DOP (discount so far = 14.5)
- Audit row 1: percent=10, amount_cents = -1000 (-10.00 DOP)
- Audit row 2: percent=5, amount_cents = -450 (-4.50 DOP)
- Sum = -1450 = sale_items.discount_cents ✅

## 6. Manual override behavior

- If `sale_items.discount_cents` is set manually (i.e., the form's
  line-discount field has a non-zero value not derived from auto-rules):
  - The cart UI surfaces this as "Manual: 100 DOP off" with a small
    indicator.
  - Auto-rules do NOT fire on that line.
  - On confirm, a single `sale_discount_applications` row is written
    with `is_manual = true` and `amount_cents = -discount_cents`.

- How does the UI know "manual" vs "auto"? The cart tracks an internal
  flag on each line (`isManualDiscount`). When the user types in the
  discount field, the flag flips true. To "un-manual", they clear the
  field; auto-rules re-fire.

- On the server side (`create_*_order` RPCs), the RPC needs an
  `is_manual_discount` boolean per line in the payload. Without it,
  the server can't tell whether to record the audit row as manual
  or to re-resolve auto-rules.

## 7. RBAC

| Action | owner | admin | seller | distributor |
|---|---|---|---|---|
| Create/edit/delete rules | ✓ | ✓ | ✗ | ✗ |
| View rule list | ✓ | ✓ | ✗ | ✗ |
| See auto-discounts apply in cart | ✓ | ✓ | ✓ | ✗ |
| See audit on sale detail page | ✓ | ✓ | ✓ | ✗ |
| Type manual discount in cart | ✓ | ✓ | ✓ | ✗ |

## 8. UI surfaces

### 8.1 New admin pages

- `/discount-rules` — list of all rules (filters: kind, active,
  current/expired)
- `/discount-rules/new` — create form (different fields appear based
  on selected kind)
- `/discount-rules/[id]` — view + edit + deactivate
- Settings hub: add "Discount rules" card

### 8.2 Cart changes (POS + online)

- Line shows applied auto-discounts as small inline text below the
  qty/price row: e.g., "Gold tier −5%, Bulk −10% (capped at 30%)"
- Manual-discount field shows "(auto-applied: 14.50 DOP)" hint when
  no manual override; switches to a clear button when manual is set
- Order summary shows breakdown if useful (deferred to round-specific
  implementation)

### 8.3 Sale detail page changes

- Items table gets a new column or expandable row: "Discount sources"
  showing the audit rows for that line
- Order summary shows the surcharge breakdown (logistics if any)

## 9. Implementation order across Rounds 16–20

| Round | Mechanism | Size | Why this order |
|---|---|---|---|
| **16** | `customer_override` | Small | Smallest scope filter, no time math, no qty threshold — perfect for laying schema groundwork + the audit table + the resolution skeleton |
| **17** | `club_tier` | Small-Med | Adds tier-based matching but logic is otherwise similar to 16 |
| **18** | `bulk` | Medium | Adds the qty-threshold dimension; first rule kind that depends on line state, not just customer |
| **19** | `promotion` | Medium-Large | Adds time-window matching + category/warehouse scoping; broadest rule type |
| **20** | `logistics_surcharge` | Medium | Order-level (not line-level) — different code path; saves it for last |

Each round contains:
- `.0` — round spec (already done in 16.0 for all 5)
- `.1` — schema migration if needed (Round 16 introduces both tables;
  later rounds may add only the new kind enum value)
- `.2` — server-side resolver function (extended each round)
- `.3` — admin UI for that kind's rule management
- `.4` — integration into POS form
- `.5` — integration into online-order form
- `.6` — e2e smoke

## 10. Round 16 specifically — customer_override

After this spec, Round 16's remaining sub-rounds:

- **16.1** Schema migration: create enum, both new tables
- **16.2** Resolver function: `resolve_line_discounts(p_product_id, p_qty, p_unit_price_cents, p_customer_id, p_source_warehouse_id, p_at)` returns a jsonb array of `{rule_id, percent, amount_cents}`. Initial version only handles `customer_override`; subsequent rounds extend.
- **16.3** Admin UI at `/discount-rules` — list + new + detail; filtered to `kind='customer_override'` only in v1 (other kinds get UI in their rounds)
- **16.4** Integration into POS form: `resolveDefaultPrice` extended to call resolver after picking base price; cart line shows applied discounts
- **16.5** Integration into online-order form: same pattern
- **16.6** E2E smoke: create a `customer_override` rule for a known customer, run a sale, verify discount_cents matches expected, verify audit row written

## 11. Roadmap impact

This spec absorbs Rounds 16–20 into a single domain. Previously
planned items shift back:

| Was | Becomes |
|---|---|
| 17 Inventory UI | 22 |
| 18 Cashback reports | 23 |
| 19 Accounting | 24 |
| 20 Dashboard | 25 |
| 21 Spanish UI | 26 (or sooner if seller cutover pressure forces it) |

This is a real reordering. The Spanish UI urgency note from the prior
handoff still stands — if sellers start using the admin daily before
Round 25, jump Spanish UI ahead.

## 12. Open questions / future items

- **Customer-product specific override** — more granular than per-customer
  (e.g., "this customer gets 15% on shampoo specifically"). Could be
  done with a `scope_customer_id + scope_product_id` combo on the
  existing schema; deferred until needed.
- **Refund handling** — when a sale is cancelled or refunded, do audit
  rows stay or get marked? Current proposal: stay; they're historical
  record. Cancelled-sale reports can filter.
- **Per-warehouse price overrides** (already exist via
  `warehouse_price_override_cents` on a product-warehouse linking
  table) — interaction with the new engine? Current proposal: the
  resolver picks base price via existing logic (warehouse override
  > club_price_cents > base price), then applies the rule engine on
  top. No conflict.
- **Stacking of `promotion` rules** — if multiple active promotions
  match (e.g., both Easter sale 15% AND product-specific 20%), they
  multiplicatively stack like other rules. The 30% cap protects the
  business.
- **Rule conflicts** — two `customer_override` rules for the same
  customer (one 10%, one 15%). Behavior: both apply, multiplicatively
  stack, until cap. Admin UI should warn at creation if a duplicate
  is detected, but not block.
- **Rule deletion vs deactivation** — deleting a rule with audit rows
  attached is messy (foreign key). Recommend deactivation (`is_active = false`)
  as the primary "off" mechanism; only owners can hard-delete, and
  only when no audit rows reference the rule.

## 13. Schema-name corrections appendix

(Populate as columns are verified during implementation, same
convention as Rounds 14c and 15.)
