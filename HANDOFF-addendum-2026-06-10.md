# GangaLoo — Handoff Addendum (2026-06-10)

_Appended to the prior handoffs. Same owner (**Bernhard Perkins**, non-technical), same workflow: work **one step at a time**, plain language, **DB before dependent code**, deliver files to copy in, then publish `npx tsc --noEmit` → `git add` (explicit paths) → `git commit` → `git push` (**commit before push**; a pre-commit hook runs tsc). Everything below is committed, pushed, and live. Round numbering continues from Round 66a in the prior addendum._

---

## A. What shipped this session

| Commit | Round | What |
| --- | --- | --- |
| `8e7da08` | 67a | **Stock transfers mobile fix** — approve dialog scrolls with a pinned footer; pending-request card stacks on phones |
| `28f903d` | 68a | **`member_cards` table + link/lookup/deactivate functions** (NFC membership cards) |
| `3aaabd3` | 68b | **Link / manage membership cards** on a customer's People page |
| `d6044b1` | 68c | **Scan / attach a membership card** at the caja register (pricing + history) |
| `f7ef082` | 68d | **Award loyalty points on paid sales** (rate in `store_config`, idempotent trigger) |
| `b810392` | 68e | **`return_sale_money` + `get_sale_return_info`** (cash-refund-through-ledger SQL; committed after 68f as a record) |
| `4130e50` | 68f | **"Return money" on a sale** — partial cash refund through the ledger (UI) |

> The big theme this session: a full **NFC membership** capability (68a–68d) and a **"Return money"** capability (68e–68f) that fills a known gap — refunds returned goods but never the cash.

---

## B. Round 67a — Stock transfers: mobile layout fixes

**Reported:** on a phone, the Stock Transfers "Pending requests" card was crushed (details wrapped one word per line), and the **Approve transfer request** dialog couldn't scroll to the **Approve & send** button when there were many line items.

**Code (no DB):**
- `app/(dashboard)/transfers/request-actions.tsx` — the approve dialog `AlertDialogContent` is now `flex max-h-[90dvh] flex-col` with the header/footer `shrink-0` and the table+note in a `min-h-0 flex-1 overflow-y-auto` middle region, so the footer stays pinned and the body scrolls. The `RequestReviewButtons` wrapper became `flex w-full ... sm:w-auto sm:shrink-0` and the two buttons `flex-1 sm:flex-none` (full-width side-by-side on phones).
- `app/(dashboard)/transfers/page.tsx` — the pending-request row wrapper changed from `flex items-start justify-between` to `flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between`, so details sit full-width above the buttons on mobile.

---

## C. Round 68a — `member_cards` table + functions (DB)

`db/migrations/round-68a-member-cards.sql`.

**Key discovery that shaped everything:** customers already exist — they are **`profiles` rows with `role = 'customer'`** (the live `user_role` enum in use is `owner / seller / distributor / customer`). `profiles` already carries the club fields: **`is_club_member`, `club_tier`, `club_joined_at`, `club_member_no`, `bonus_points`, `customer_type`, `credit_limit_cents`**. And **`sales.customer_id` already exists**. So membership did **not** need a new members/points/tier system — only a way to map a card to a customer.

**Table `public.member_cards`** (`id`, `customer_id` → `profiles(id)` on delete cascade, `card_uid` text [normalised], `label`, `is_active`, `created_at`, `created_by`, `deactivated_at`). Partial unique index `member_cards_active_uid_ux on (card_uid) where is_active` = one active owner per physical card (deactivated rows kept for history). RLS ON, revoked from anon/authenticated — access only via the functions below.

**Functions** (all `SECURITY DEFINER, set search_path = public`):
- `_member_card_normalize(text)` — uppercases hex, strips separators (so `04:1a:2b` == `041A2B`).
- `_member_card_is_staff()` — `auth.uid()` → `profiles.role in ('owner','seller')` and `is_active`.
- `link_member_card(p_customer_id, p_card_uid, p_label)` → jsonb `{status: 'linked'|'already', card_id}`; validates the target is an active `role='customer'`; blocks a card already active for a **different** customer.
- `deactivate_member_card(p_card_id)` → jsonb `{ok}`.
- `list_member_cards(p_customer_id)` → table (active first).
- `find_customer_by_card(p_card_uid)` → table `(card_id, customer_id, full_name, phone, is_club_member, club_tier::text, club_member_no, bonus_points)` or none.
- Granted execute to `authenticated, service_role`. **Because they gate on `auth.uid()`, call them via the regular server client** (`@/lib/supabase/server`), like `balance_sheet()`.

---

## D. Round 68b — Manage cards on a customer's page

People detail page is `app/(dashboard)/people/[id]/page.tsx` (gated `requireOwner`), rendering `PersonFinancialsView`. Customers = `profiles role='customer'`; the page's `Profile` type / `PROFILE_COLUMNS` (in `people/actions.ts`) **does not include `club_member_no`** (noted below).

**New files:**
- `app/(dashboard)/people/member-card-actions.ts` — `'use server'`; `listMemberCards`, `linkMemberCard`, `deactivateMemberCard`. Call the 68a RPCs via the **regular** server client; `requireOwner`. Link/deactivate `revalidatePath('/people/{id}')` and **return the fresh card list** so the client updates instantly.
- `app/(dashboard)/people/member-cards-manager.tsx` — `'use client'`; a "Membership cards" Card showing a club summary line, the linked cards (Active/Inactive badge + Deactivate w/ confirm), and a dashed "link a card by serial + optional label" box. Type/paste only for now (tap-to-scan deferred until cards arrive).

**Edit:** `app/(dashboard)/people/[id]/page.tsx` — imports the above, fetches `memberCards` only when `role==='customer'`, renders `<MemberCardsManager>` for customers. **`club.memberNo` is passed `null`** because `club_member_no` isn't on the `Profile` type yet.

---

## E. Round 68c — Scan / attach a card at the caja register

The caja register (`app/(dashboard)/caja/register.tsx`) **previously attached no customer** — it hardcoded `customer_id: null` into `ConfirmPosInput` and computed line discounts with `customerId: null, customerClubTier: null`. Existing QR scanning (`@/components/qr-scanner`, `findProductBySkuAction`) is **camera-based for products** — NFC is a separate, new mechanism.

**New files:**
- `app/(dashboard)/caja/member-scan-actions.ts` — `'use server'`; `findMemberByCardAction(cardUid)` wraps `find_customer_by_card` (regular server client; `requireAdminCaller`, same as `loadRegisterProducts`). Returns `ScannedMember {customerId, fullName, phone, isClubMember, tier, memberNo, points}` or null.
- `app/(dashboard)/caja/member-scan.tsx` — `'use client'`; the **Scan member card** control. Web NFC (`NDEFReader`) tap **on Android Chrome only** (feature-detected, shown as "Tap card (NFC)") plus a typed/pasted serial that works everywhere now. Found member shows as a green chip (name, tier, points) with an X to remove. Bilingual (es/en).

**Edit:** `register.tsx` — added `member` state; feeds `member?.customerId / member?.tier` into `lineDiscountFor`; a `useEffect([member])` recomputes all line discounts when the member changes; `clearCart()` also clears the member (so a finished sale resets for the next customer); `checkout` sets `customer_id: member?.customerId ?? null`; renders `<MemberScan>` at the top of `renderCart()` (shows in both desktop side cart and mobile cart sheet).

Member **pricing** rides on the existing engine: `lib/discount-rules-resolver.ts` already supports `club_tier` and `customer_override` rules (treats `'none'`/null tier as no match); the authoritative recompute happens in `confirm_pos_sale` at submit since `customer_id` now flows in.

---

## F. Round 68d — Loyalty points earning on paid sales (DB)

`db/migrations/round-68d-loyalty-points-earning.sql`.

**Confirmed by inspection:** nothing in the DB awarded points on a sale (`confirm_pos_sale` doesn't touch `bonus_points`; only `create_customer_quick` sets a starting value and `find_customer_by_card` reads it). So earning was genuinely missing.

**Decision on record (owner):** **1 point per RD$100 of merchandise (after discounts), same rate for all tiers.**

**What it adds:**
- `alter table sales add column points_awarded_at timestamptz` (idempotency stamp).
- `store_config` row **`loyalty_points_per_100`** (jsonb number, default **1**) — editable later via the config UI, no code change. `store_config` is a key/value table (`key text, value jsonb, ...`).
- `_award_loyalty_points()` trigger fn (`SECURITY DEFINER`) + **`before insert or update of status on sales`** trigger `trg_award_loyalty_points`. Awards when `status='paid'` AND `customer_id` set AND `points_awarded_at is null`; base = `greatest(subtotal_cents - discount_cents, 0)` (shipping/tax excluded); `points = floor((base/10000) * rate)`; increments `profiles.bonus_points`; stamps `points_awarded_at`. **Does NOT touch `confirm_pos_sale`.** Walk-ins earn nothing. **No clawback on refund** in this version.

**Verified live:** an RD$100 paid sale to a member credited exactly **1 point**.

---

## G. Round 68e — `return_sale_money` + `get_sale_return_info` (DB)

`db/migrations/round-68e-return-sale-money.sql`.

**Money model confirmed:** `money_accounts.balance_cents` is moved **only** by posting to the `transactions` ledger — never edited directly. The engine functions are `post_transaction(jsonb)` (insert row + `balance += signed amount`; income +, expense −; owner/admin via `auth.uid()`) and `reverse_transaction(uuid)` (balance −= amount, delete row; owner/admin). Sale payments post via `post_sale_payment_to_ledger(...)` (internal, no gate, called inside gated sale fns) and carry `source_sale_id` + `source_sale_payment_id`.

**Decisions on record (owner):** "Return money" is a **separate button** (not automatic on refund), and **partial returns** are needed.

**Functions** (`SECURITY DEFINER`, owner/admin via `auth.uid()`):
- `get_sale_return_info(p_sale_id)` → `(invoice_number, collected_cents, returned_cents, returnable_cents, suggested_account_id)`. Collected = Σ positive ledger rows for the sale; returned = −Σ negatives; suggested account = the most recent inflow's account.
- `return_sale_money(p_sale_id, p_amount_cents, p_money_account_id, p_note)` — caps at `collected − already_returned`; copies the **category + scope from an inflow row** (prefers the chosen account) so the refund nets against the same income line; posts a **negative** entry via `post_transaction` with `source_sale_id` + description `"Refund <invoice>"`. Returns `{ok, invoice_number, returned_cents, remaining_returnable_cents, transaction}`.

**v1 boundary (decision):** this moves **cash only** — it does **not** change the invoice's `paid_cents` / `status` (the goods-refund already sets `refunded`; touching `paid_cents` risked AR/"owes me" weirdness).

---

## H. Round 68f — "Return money" button on the sale page

Sale page is `app/(dashboard)/sales/[id]/sale-detail.tsx` (`SaleDetail` already receives `moneyAccounts`; `isOwnerEquivalent(role)` is imported).

**New files (co-located in `sales/[id]/`):**
- `return-money-actions.ts` — `'use server'`; `getSaleReturnInfoAction` + `returnSaleMoneyAction` (regular server client, `requireOwner`). The return action `revalidatePath('/sales')`, `/sales/{id}`, `/money-accounts`.
- `return-money.tsx` — `'use client'`; the **Return money** button + dialog. On open it loads returnable info, prefills the amount (full returnable) and account (suggested), allows a partial amount, caps client-side at returnable, optional note. Bilingual. Renders nothing unless `canReturn`.

**Edit:** `sale-detail.tsx` — import `ReturnMoney`; render it once at the bottom of `SaleDetail`, right-aligned, wrapped in `{isOwnerEquivalent(role) ? ... : null}`.

---

## I. Conventions reconfirmed / added this session

- **PowerShell + the `[id]` route folders:** square brackets are PowerShell wildcards — always use `-LiteralPath` (and `Test-Path -LiteralPath`) when copying files under `app/(dashboard)/.../[id]/...`, or the copy silently "MISSING"es.
- **Gated RPCs → regular server client.** Any RPC that checks `auth.uid()` (all the 68a/68e money + card fns, plus `post_transaction`/`reverse_transaction`) must be called through `@/lib/supabase/server`, never the service-role client, or `auth.uid()` is null and it raises `permission denied`. Corollary: **these can't be run from the Supabase SQL Editor** (no logged-in user there) — exercise/verify them from inside the app, or sanity-check the underlying math with a plain ungated SELECT.
- **Move scripts** continued the newest-match picker; SQL files live in `db/migrations/`.

---

## J. OPEN / WATCH

- **Refunds still don't return money by themselves.** `refundSale` returns stock + voids commissions but, by its own comment, never reversed payments ("future negative-payment when 9.5 ships"). **Round 68f is the manual fix** — a separate **Return money** button. A full auto-refund-returns-cash flow (refund → also call the return automatically) was deliberately **not** built; owner chose a separate button. Returning the **physical** cash to the customer is still a manual counter act; and a complete real refund = **Refund w/ restock** (goods) **plus** **Return money** (cash), two actions.
- **Return money does not change invoice `paid_cents`/status** (v1 decision). Revisit if AR needs it.
- **Points: no clawback on refund/return.** Refunding a paid sale leaves the earned points on the customer. Reset manually via the customer's **Edit details** (points are editable there) or build clawback later.
- **NFC tap pending hardware.** Owner has no physical cards yet; everything works by typing the serial. The **Tap card (NFC)** button already appears on Android Chrome and will work once NTAG215-type cards arrive — no code change needed. (Web NFC is Android-Chrome + HTTPS only.)
- **`club_member_no` not on the `Profile` type.** The People card summary passes `memberNo: null`. To show it, add `club_member_no` to `PROFILE_COLUMNS` + `Profile` in `people/actions.ts` and pass it through `[id]/page.tsx`.
- **Test-data cleanup pattern (used this session):** a paid test sale leaves (a) the cash ledger row — reverse it via **Accounting → delete** the "POS sale FAC-xxxx" row (calls `reverse_transaction`; the SQL Editor can't, owner-gated), (b) earned points — subtract on the customer's Edit page or `update profiles set bonus_points = greatest(bonus_points-1,0)`, (c) stock — **Refund w/ restock**.
- **Repo noise (unrelated):** `git status` shows two already-deleted `app/(dashboard)/categories/*.bak-2026...` files and an untracked `HANDOFF-addendum-2026-06-06.md`. Left untouched; clean up anytime.

_End of 2026-06-10 addendum._
