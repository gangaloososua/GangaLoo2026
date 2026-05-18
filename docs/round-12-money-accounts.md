# Round 12 — Money Accounts module

Status: spec. No code yet.

## Purpose

Surface the contents of the existing `money_accounts` table as a usable
admin page. The table already holds 20 production accounts across DOP,
EUR, USD; balances are real. This round is read + create + edit; no
transfers (Round 19), no delete (use `is_active=false`).

## Decisions locked

1. **Scope handling.** Business accounts shown by default. Private
   accounts hidden behind a "Show private" toggle on the list page,
   not a separate route. Private accounts never appear in selectors
   elsewhere (e.g. sale payment destination); the toggle is admin-only
   visibility.

2. **Multi-currency totals.** Accounts grouped by currency in the list.
   Per-currency subtotal shown. A DOP-equivalent grand total is shown
   below, computed using `monthly_exchange_rates` for the current month.
   The "as of" date for the conversion is rendered next to the total.

3. **Stale rates.** If no rate is set for the current month for some
   currency, fall back to the most recent prior month with a rate. The
   month being used is noted inline (e.g. "USD: rate from April 2026").
   No silent failure, no broken total.

4. **CRUD scope.** List, detail, create, edit. No delete — `is_active`
   toggle on the edit form is the disable path. Existing accounts
   referenced by sales/transactions must never be deletable.

5. **Transfers.** Out of scope. Round 19 (Accounting / transactions)
   owns the transactional logic; doing it here would duplicate it.

## RBAC

Owner-only across the board. Sellers and distributors have no business
in money accounts — they don't see the nav item, they 404 on the URL,
they 403 on any action. Per the existing pattern:

- `app/(dashboard)/money-accounts/page.tsx` → `requireOwner()`
- `app/(dashboard)/money-accounts/new/page.tsx` → `requireOwner()`
- `app/(dashboard)/money-accounts/[id]/edit/page.tsx` → `requireOwner()`
- Every export in `money-accounts/actions.ts` → `requireOwner()`

`lib/nav.ts`: new item with `roles: ['owner', 'admin']`. Sidebar
hides it for sellers/distributors automatically.

## Routes

- `/money-accounts` — list, grouped by currency, with totals.
- `/money-accounts/new` — create form.
- `/money-accounts/[id]/edit` — edit form (incl. is_active).

No detail-only view; the edit page IS the detail page. Matches the
Warehouses pattern.

## List page (`/money-accounts`)

Header: title "Money Accounts", subtitle "Where the money sits.",
"New account" button on the right (owner-only — already implied by
the route guard).

Filter row (URL-state, same pattern as elsewhere):
- "Show private" toggle (default off)
- "Show inactive" toggle (default off)
- Search box (filters by `name` substring, case-insensitive)
- Group filter: dropdown of distinct `group_tag` values + "All"

Table grouped by currency. For each currency group, in order DOP, EUR,
USD, then anything else alphabetical:

  Group header: currency code + per-currency subtotal of `balance_cents`
  (summed only over visible rows, respecting the filters).

  Rows columns:
    - Name
    - Kind (badge: bank / cash / digital / credit_line / etc.)
    - Group (group_tag, dimmed)
    - Balance (right-aligned, currency-aware formatting)
    - Status (Active / Inactive, badge)
    - Scope (Business / Private, only shown when private toggle on)
    - Manage (link to edit)

Empty groups (no visible accounts for that currency) are hidden.

Below the table, a single summary row:

  "DOP-equivalent total: ₱X,XXX,XXX.XX"
  "Conversion rates: DOP (base), USD via May 2026, EUR via April 2026"

The rates-used line lists each non-DOP currency present and which
month's rate is in use. If a fallback was needed, that month
differs from the current — naturally visible.

If a non-DOP currency has no rate in ANY month, that currency's
subtotal is NOT included in the grand total; the rates line shows
"USD: no rate set — not included in total."

## Create page (`/money-accounts/new`)

Form fields:
- Name (text, required, unique-not-enforced — names like "Bank
  Banreservas Joel" / "Bank Banreservas Perkins" coexist, that's fine)
- Kind (select, required) — populated from `money_account_kind` enum
- Currency (select, required) — DOP / EUR / USD; could be free-text
  but the existing data only uses these three, lock it to those
- Scope (select, required) — Business / Private
- Group tag (text, optional) — free-text, autocompletes from existing
  `group_tag` values (bank / cash / digital / credit / external in
  current data)
- Initial balance (number, default 0, in major units — converted to
  cents on submit)
- Allow negative (checkbox, default off — only on for accounts you
  expect to overdraw, like "Cash DOP Business" today)
- Is active (checkbox, default on)

On submit:
  - validate required fields server-side
  - convert balance from major → cents (multiply by 100, round to int)
  - INSERT with `balance_cents = initial_balance_cents` so a brand new
    account starts at its declared opening balance
  - revalidate /money-accounts
  - redirect to /money-accounts on success

`warehouse_id` is not exposed in the form (all current accounts have
it null). If the schema ever needs it surfaced, add then; don't
pre-build.

`legacy_id` is not exposed (migration-time field, set externally if
ever needed).

## Edit page (`/money-accounts/[id]/edit`)

Same fields as create, EXCEPT:
- Initial balance is shown as read-only (you don't retroactively
  change a starting balance — that's accounting-rewrite territory)
- Balance (current) is shown as read-only, big number, separate
  panel above the form. Includes a small note: "Balance is updated
  by transactions, not edited directly."
- Currency: read-only after creation. Changing an account's currency
  on a row that already has balance/transactions would lie about
  history.

Editable: Name, Kind, Scope, Group tag, Allow negative, Is active.

On submit:
  - validate
  - UPDATE only the editable fields
  - revalidate /money-accounts
  - redirect on success

## Data fetchers

New file: `lib/money-accounts.ts`. Exports:

- `listAccounts(opts: { includePrivate?: boolean; includeInactive?: boolean })`
  → returns rows joined with whatever rate info the page needs (or the
  page can fetch rates separately — see Implementation note below).

- `getAccount(id: string)` → single row or null.

- `getEffectiveExchangeRates(): Promise<{ rates: Record<Currency, { rate, monthUsed }>, missing: Currency[] }>`
  → for each non-DOP currency present in active business accounts,
  return the most recent rate (current month preferred, fall back to
  prior). Missing currencies (no rate ever set) listed separately.

Implementation note: the page CAN make two parallel queries (accounts
+ rates) and assemble client-side in the server component. That's
cleaner than denormalising into one fetcher.

## Actions

New file: `app/(dashboard)/money-accounts/actions.ts`. Exports:

- `createAccount(formData): Promise<ActionResult>` — INSERT
- `updateAccount(formData): Promise<ActionResult>` — UPDATE editable fields only
- `setAccountActive(id, active): Promise<ActionResult>` — convenience
  for the inactive toggle from the list (optional; can defer if list
  doesn't need inline toggle)

All start with `await requireOwner()`. None update `balance_cents`
directly — that's transactions territory. Only `createAccount` touches
balance, and only by setting it equal to `initial_balance_cents`.

## Nav

`lib/nav.ts`: insert between Warehouses and Users, since money is an
admin-only operational surface:

  { label: 'Money Accounts', href: '/money-accounts',
    icon: Wallet, roles: ['owner', 'admin'] }

Lucide icon: `Wallet` (or `Landmark` if Wallet conflicts).

## Out of scope (deferred)

- Transfers between accounts — Round 19.
- Balance editing — never (accounting integrity).
- Per-warehouse account assignment (`warehouse_id` column ignored).
- Transaction history per account view — Round 19.
- Account reconciliation tools — future round.
- Multi-account batch operations — future round.

## Order of implementation

12.1 — Spec (this file) + commit.
12.2 — `lib/money-accounts.ts` fetchers (incl. effective-rate logic).
12.3 — List page (server component) + list-table client component.
12.4 — Create page + form + createAccount action.
12.5 — Edit page + edit form + updateAccount action.
12.6 — Nav entry + sidebar smoke test.
12.7 — Smoke test all paths end-to-end as owner; verify seller 404s
       on every route and toolbar nav doesn't expose the item.

Each step its own commit. Same micro-step rhythm as Round 11.
