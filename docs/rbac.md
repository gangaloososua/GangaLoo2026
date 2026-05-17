# Gangaloo Admin — Role-Based Access Control (RBAC)

**Status:** Canonical spec for Round 11. Source of truth for route guards, nav filtering, server-side field stripping, and RLS policy design.

**Last updated:** 2026-05-17 (Round 11, design phase)

---

## 1. Roles

The `role` enum on `profiles` has five values: `owner`, `admin`, `seller`, `distributor`, `customer`. This admin app actively supports three of them.

| Role | Status | Notes |
|---|---|---|
| `owner` | active | Full access. Currently one row (Perkins). |
| `admin` | **dormant** | No admin users planned. If ever created via SQL, behaves identically to owner. Cannot be created or managed from `/users` (SQL-only). |
| `seller` | active | Sophia Perkins is linked. Delia, Estafany, Fabienne pending promotion. |
| `distributor` | active | Behaves like seller plus distributor-commission visibility. |
| `customer` | **excluded** | Belongs on the storefront, not this app. Signed-in customers hitting this app see a bounce page with a link to the storefront and a sign-out button. |

---

## 2. Access matrix

`yes` = full read+write. `read` = read-only. `own` = scoped to rows where `seller_id = caller`. `hidden` = field/tab not rendered and not returned by the server.

| Surface | Owner / Admin | Seller | Distributor |
|---|---|---|---|
| Dashboard | full | own metrics only | own metrics only |
| Sales list | all | own (by seller_id) | own (by seller_id) |
| POS / new sale | yes | yes | yes |
| Refund / void sale | yes | no | no |
| Online Orders | all | no | no |
| Inventory view | yes | read | read |
| Stock movements | yes | read | read |
| Products — list, no costs | yes | read | read |
| Products — cost / margin / supplier_cost / landed_cost fields | yes | hidden | hidden |
| Products — Calculator tab | yes | hidden | hidden |
| Categories | yes | read | read |
| People — clients | full | read | read |
| People — suppliers | full | no | no |
| Warehouses | yes | no | no |
| Purchases | yes | no | no |
| Exchange Rates | yes | no | no |
| Accounting / transactions (future) | yes | no | no |
| Settings (all tabs) | yes | no | no |
| Users | full (owner protected; admin mgmt SQL-only) | no | no |
| Commissions report | all | own | own + distributor portion |
| Cashback report | all | no | no |
| Loyalty points | all clients | visible on client read | visible on client read |
| Own profile | edit | edit | edit |

---

## 3. Key decisions

- **Sellers cannot refund or void sales.** Financial reversals go through the owner.
- **Sellers cannot create or edit clients during POS.** Walk-ins use the `__walkin__` sentinel. Owner pre-creates named clients.
- **Sellers and distributors can read stock movements** but cannot create them. POS sales decrement stock automatically via `confirm_pos_sale`; that is not a manual movement.
- **Online orders are owner-only.** Customer-placed self-service surface, no meaningful `seller_id` to scope by. Revisit if an `assigned_to_id` field is added when the Online Orders module ships.
- **Cost fields are server-stripped, not just hidden client-side.** A non-owner page request for Products never receives `cost_cents`, `supplier_cost_cents`, `landed_cost_cents`, or `margin_*`. Defence in depth.
- **The Calculator tab is removed entirely from the Products page for non-owners**, not disabled.
- **Admin management is SQL-only.** The `/users` role dropdown stays locked to `seller` / `distributor` for every caller, including the owner.
- **The owner cannot be banned, unlinked, or role-changed from /users.** Already guarded in `actions.ts`; documented here for completeness.

---

## 4. Operational consequences

These are real workflow constraints the spec creates.

1. **No walk-in client creation at POS.** Unknown customers ring up as `__walkin__` until the owner pre-creates a named record.
2. **No seller-initiated refunds.** Any sale reversal blocks on the owner.
3. **No manual stock adjustments by sellers.** Damaged units stay in inventory until the owner records the loss.
4. **Three sellers pending promotion** (Delia, Estafany, Fabienne) can be safely promoted via `/users/new` once Round 11 ships.

---

## 5. Out of scope for Round 11

- Any customer-facing surface inside this codebase. Customers get a bounce page only.
- Admin-management UI. Stays SQL-only.
- Per-warehouse scoping for distributors beyond commissions. Distributors see the same own-sales view as sellers.
- The Online Orders module itself. Round 11 only locks down access.
- Any new role beyond the existing enum.

---

## 6. Enforcement layers (architecture)

Two layers, both required. Implementation details land in subsequent micro-steps.

### Layer 1 — UI / server (this codebase)

- Route guard in `app/(dashboard)/layout.tsx` reads `auth.uid()` → `profiles.role` and decides: render, redirect to `/bounce` (customer), or `notFound()` (insufficient role).
- `lib/nav.ts` gets a per-item `roles: Role[]` allow-list. Sidebar filters by current role.
- Server components for Products strip cost fields from query results before passing them to client components.
- Server actions re-check role at entry. UI guards are not enough; anyone can POST directly to a server action endpoint.

### Layer 2 — Database (RLS)

- Enable RLS on every table touching costs, sales financials, exchange rates, commissions, payouts, store config, and PII. Minimum candidate list: `profiles`, `purchases`, `purchase_items`, `purchase_payments`, `store_config`, `monthly_exchange_rates`, `sale_commissions`, `sale_payments`, `sales`, `sale_items`, `sale_lot_consumption`, `stock_movements`, `inventory_lots`, `money_accounts`, `transactions`. Full list confirmed during the audit pass.
- Helper SQL function `auth_role()` returning the caller's role from `profiles.role`, used inside policies to keep them readable.
- **Caveat:** server actions using `SUPABASE_SERVICE_ROLE_KEY` (via `lib/supabase/admin.ts`) bypass RLS. RLS therefore defends against (a) direct client-side queries from a future storefront or mobile app, (b) accidental use of the anon/ssr client where admin client was intended, and (c) future API surface area. It does not defend against bugs in our own server actions; those must be correct on their own.
- An audit pass over existing server actions classifying each as "admin client (bypasses RLS)" or "ssr client (respects RLS)" is part of Round 11.

---

## 7. Bounce / unauthorized behaviour

- **Customer signs in:** redirected to `/bounce` showing "This is the Gangaloo admin app. If you are a customer, your account lives at [storefront URL]" plus a sign-out button.
- **Seller / distributor reaches an owner-only route directly:** `notFound()` renders the standard 404. Avoids leaking the existence of admin-only surfaces. Sidebar already hides them.
- **Signed-out user:** existing auth middleware handles redirect to `/login`; no change.
