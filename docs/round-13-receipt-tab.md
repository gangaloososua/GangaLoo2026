# Round 13 — Settings Receipt tab

Polish round. Adds a typed write surface for the four store-identity
fields that already flow from store_config -> StoreInfo -> POS receipt
header.

## Background

Round 9.9 scaffolded the read side in `lib/store-config.ts`:

- `StoreInfo` type: { name, address, phone, rnc }
- `fetchStoreInfo()`: reads `store_name`, `store_address`,
  `store_phone`, `store_rnc` from `store_config` in one round-trip.
- `STORE_INFO_DEFAULTS`: hardcoded fallbacks (`name = 'Gangaloo'`,
  rest empty).

The POS receipt template (Round 9) consumes `StoreInfo` and
conditionally hides lines for empty values.

The write side was never built — the four keys currently get edited
via the generic Store Config key/value editor. Round 13 ships a
typed form for the same four keys, accessed via a new Settings
sub-page.

## Scope

In scope:
- A new page at `app/(dashboard)/settings/receipt/page.tsx` (owner-only).
- A new client form component (`receipt-form.tsx`) bound to `StoreInfo`.
- A server action `upsertStoreInfo({ name, address, phone, rnc })`
  that writes all four keys in one bulk upsert.
- A new card on the Settings hub linking to the Receipt page.
- Export `STORE_INFO_DEFAULTS` from `store-config.ts` so the form
  can show them as input placeholders when a field is empty.

Out of scope:
- Logo upload.
- Receipt template / layout editor (the existing receipt template
  is whatever Round 9 shipped; we're only editing the data it reads).
- Per-warehouse override of these fields (all four are global).
- Adding new fields beyond the existing four. `confirmMsg`, banking
  info, and WhatsApp number would be reasonable Round-13.5 additions
  but the back half of 9.9 is exactly these four fields; staying
  scope-true.
- Cleaning up the `guest_markup` / `guestMarkup` duplicate keys
  noticed during 13.1 — separate concern.

## RBAC

Owner-only across the board.

- `app/(dashboard)/settings/receipt/page.tsx` -> `requireOwner()`
- `app/(dashboard)/settings/receipt/actions.ts` `upsertStoreInfo` ->
  `requireOwner()`
- The Settings hub already gates sellers/distributors out; the new
  Receipt card inherits that.

No `lib/nav.ts` change — Settings is already in the nav with
`roles: OWNER_ONLY`. Receipt is a sub-page of Settings, reachable
only through the hub.

## Routes

- `/settings/receipt` — page with form, no detail route, no list,
  no create-vs-edit split. Same row of values every time you visit;
  it's a singleton.

## Page shape

Header: title "Receipt identity", subtitle "Store name, address,
phone, and RNC printed on every POS receipt."

Form (single pane, no tabs — four fields):

- **Store name** (text, required at the form layer; the action also
  defaults to 'Gangaloo' if blank to never leave the receipt headerless)
- **Store address** (textarea, two rows, optional)
- **Store phone** (text, optional, no format enforcement)
- **RNC** (text, optional, no format enforcement — DR tax IDs vary by
  entity type; helper text notes "Registro Nacional de Contribuyente.
  Leave blank if not registered.")

Buttons: Save changes (primary), Cancel (back to /settings).

On submit:
- Validate name is non-empty (or default to 'Gangaloo'; decide in
  implementation — leaning toward "name required at form layer,
  server defaults to 'Gangaloo' as a defense-in-depth fallback").
- Call `upsertStoreInfo`.
- Toast on success, `router.refresh()` to re-read.
- Stay on the page (no redirect).

## Data layer

New action file: `app/(dashboard)/settings/receipt/actions.ts`.

```ts
export async function upsertStoreInfo(formData: FormData): Promise
  { success: true } | { error: string }
>
```

- requireOwner() first.
- Read four string fields from FormData. Trim each.
- Bulk upsert all four rows into `store_config` via Supabase
  upsert with on-conflict on `key`.
- revalidatePath('/settings/receipt') and revalidatePath('/settings').
- Return { success } on success / { error: message } on failure.

`lib/store-config.ts` changes:

- Export `STORE_INFO_DEFAULTS` so the form can use them as input
  placeholders. No other change — fetchStoreInfo stays as-is and
  is the read path for the page.

## Order of work (sub-rounds)

13.1 — Spec (this file) + export STORE_INFO_DEFAULTS from
       lib/store-config.ts. Single commit.
13.2 — Server action `upsertStoreInfo` in
       app/(dashboard)/settings/receipt/actions.ts.
13.3 — Page + form at app/(dashboard)/settings/receipt.
13.4 — Settings hub card linking to Receipt.
13.5 — Smoke test: edit each field, save, refresh; verify
       fetchStoreInfo returns updated values; confirm the POS
       receipt template (if rendered anywhere accessible) shows
       the new values.

Each step its own commit.
