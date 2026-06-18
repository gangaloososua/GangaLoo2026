# GangaLoo — Handoff Addendum (2026-06-17)

_Appended to the prior handoffs. Same owner (**Bernhard Perkins**, non-technical), same workflow: work **one step at a time**, plain language, **DB before dependent code**, deliver **whole files + a PowerShell move script** (owner prefers complete files, not line edits), then publish `npx tsc --noEmit` → `git add` (explicit paths) → `git commit` → `git push` (**commit before push**; a pre-commit hook runs tsc). Everything below is committed, pushed, and live. Round numbering continues from Round 73a below._

---

## A. What shipped this session

| Commit | Round | What |
| --- | --- | --- |
| `c3010af` | — | **Club signup: payment instructions on the success screen** |
| `3cc868d` | 72a | **`merge_customers()` function** (record file; function already live) |
| `b327446` | — | **Virtual card fees page** `/club/tarifas` + "Ver tarifas" link from the Club benefits |
| `7fd7fca` | — | **Cotizador: Club-member toggle** (waive financing + RD$200 home-pickup) |
| `5039de9` | — | **Tarifas page: order fees + member perks** |
| `b54d5f3` | — | **Owner WhatsApp alert on register/caja sales** (`notifyRegisterSale` + `lib/pos-sale-notify.ts`) |
| `c6b0d97` | — | **Money-account statement: group split payments into one expandable line** (UI + type) |
| `1be6db5` | 73a | **`account_statement()` rebuilt to group split receipts** (record file; function already live) |
| `7263c6d` | — | **Fix mojibake in `lib/nav.ts` Spanish labels** (¿Dónde está?, Nómina) |

Also delivered (NOT in the repo — a personal reference for the owner): **`club-mensajes-whatsapp.txt`**, copy/paste WhatsApp templates for sending Club payment instructions by hand.

---

## B. Club signup — how a new member is told to pay

**Background confirmed by reading the code:** when someone signs up at `/club`, `signUpCustomer` (in `lib/store/auth-actions.ts`) creates the Supabase login (confirm-email is OFF, so no email is sent to the client), creates a locked customer profile, assigns the GL-xxxxxx member number, and fires **one WhatsApp alert to the OWNER** (`notifyNewSignup`). **The client receives no automated message** — there is no way to auto-send WhatsApp to a client (CallMeBot only messages the owner; `wa.me` only opens a chat the client taps). So "a client message" = either the owner sends it by hand, or it's shown on-screen.

**Payment details (from `store_config`):** Banco **Banreservas**, **Cuenta de Ahorros**, **960-649-2594**, a nombre de **Bernhard Perkins**. Cash in person at **Maranatha**. After paying, the client sends the **receipt + a photo of cédula or passport** by WhatsApp. (`store_config` also has `transfer_discount = 3` — owner confirmed it does NOT apply to the Club fee.)

**Two deliverables:**
1. **Copy/paste WhatsApp template** (`club-mensajes-whatsapp.txt`) — two versions (all plans / single plan). Owner sends it by hand after the signup alert.
2. **On-screen (commit `c3010af`):** `app/club/page.tsx` success screen now shows a "Cómo activar tu Club" block (bank details + cash-at-Maranatha + the receipt + ID step). `gl-no-print` so it stays off the printed card.

---

## C. Round 72a — `merge_customers()` (duplicate customers)

**Problem:** the same person can exist twice — an old in-store/till record (created at the register) and their later online/Club signup — often with different name spellings. This splits their purchase history, points, and club status.

`db/migrations/round-72a-merge-customers.sql` — **`merge_customers(p_keep, p_retire, p_final_name, p_dry_run)`** (SECURITY DEFINER, owner-gated). Re-points every CUSTOMER reference from the retired profile to the survivor: **`sales.customer_id`, `member_cards.customer_id`, `payment_receipts.customer_id`, `discount_rules.scope_customer_id`** (these are the only four FKs to `profiles` that hold a customer-as-customer; the rest are staff/actor columns). Merges the profile (adds `bonus_points`, keeps Club status if either had it, keeps `club_member_no`, earliest `club_joined_at`, fills any blank survivor field from the retired one). Then DELETES the retired profile if it has no login, else DEACTIVATES it (`is_active=false`, name prefixed `[MERGED]`) and the leftover Supabase Auth user must be removed by hand.

**Safety:** defaults to **dry-run** (preview only, changes nothing); pass `false` to commit. Refuses unless both are `role='customer'`; aborts if the retire profile was ever a seller.

**Usage:**
```sql
select public.merge_customers('KEEP-id','RETIRE-id','Final Name', true);   -- preview
select public.merge_customers('KEEP-id','RETIRE-id','Final Name', false);  -- commit
```

**Gotcha hit + fixed:** `profiles` has a UNIQUE constraint **`ux_profiles_legacy` on (`legacy_source`, `legacy_id`)**. The first version copied those columns onto the survivor → collided with the retired row before delete ("duplicate key value violates unique constraint ux_profiles_legacy"). Fix: do NOT copy `legacy_source`/`legacy_id` onto the survivor; fold that reference into the survivor's `notes` instead.

**First real merge:** Suleyki (in-store, 2 sales, no login — deleted) → **Suleyki Derisma** (online, GL-000002 — survivor). Verified: survivor now has 2 sales, GL-000002 intact, balance/points correct; old record gone. Find duplicates by **matching phone numbers** (more reliable than names).

---

## D. Virtual card fees page + Club-member cotizador

### `/club/tarifas` (commit `b327446`, then expanded in `5039de9`)
New public page `app/club/tarifas/page.tsx` (covered by the `/club` PUBLIC_PREFIX, so no middleware change). Linked from the "Tarjeta de débito virtual GRATIS" benefit on `/club` (added a `link` field to the BENEFITS array + a "Ver tarifas de uso →" link). Two editable blocks at the top:
- **`TARIFAS`** — virtual-card service charges (Stripe acceptance fees).
- **`PEDIDOS`** — all the cotizador/order fees + a member-perks highlight (financing 0%, home-pickup free).

**IMPORTANT — the card fee numbers are unverified.** They came from content the owner pasted that was (a) addressed to "Anthony" (not his business) and (b) describing Stripe **acquiring** (payment-acceptance) fees, NOT **Issuing** (the cards he funds for customers) fees — a different Stripe product with a separate price schedule. The acquiring numbers do match Stripe's current EU pricing (1.5% + €0.25 EU / 3.25% + €0.25 non-EU / +2% FX / $15 chargeback), so they're reasonable for "customer pays in your store," but they are NOT the Issuing-card cost. Real Issuing numbers live only in the owner's **Stripe Issuing dashboard** (Stripe lists EU Issuing as custom/"get in touch"). **OPEN:** owner to pull real Issuing figures and have them swapped into the `TARIFAS`/`PEDIDOS` blocks. Owner's model: cards run on his account, he funds them, sets per-customer limits (i.e. Stripe Issuing).

### Cotizador Club-member toggle (commit `7fd7fca`)
`app/cotizador/page.tsx` (display-only calculator; builds a WhatsApp quote, charges nothing, no DB). Added a **"Soy miembro del Club GangaLoo"** toggle. When ON:
- **Cargo financiero (the +20% on the 50/50 plan) → 0%** (`financingPct = member ? 0 : FINANCING_PCT`).
- **Cobro a domicilio (RD$200) → free** (the note flips to GRATIS; it was never in the total, only a note).
- **Service commission stays the tiered 6–15%** (owner changed his mind mid-task: originally asked for flat 5%, then said keep it the same).
- WhatsApp quote notes "Miembro del Club GangaLoo ✓".

**Order fees inventory (for reference — all hardcoded in the cotizador):** service commission tiers (≤$30 15%, ≤$50 12.5%, ≤$100 10%, ≤$150 8%, ≤$200 7%, >$200 6%); bank charge 3% (eBay/AliExpress/Otra); import tax 7% (AliExpress/Otra); Amazon minimum RD$150 under $35; flete RD$100 flat (Temu/Shein) or RD$300/lb at delivery (others); financing +20% (50/50 plan); cobro a domicilio RD$200; rate markup +0.8%.

**MAINTENANCE NOTE:** the order fees now live in **two places** — `app/cotizador/page.tsx` (where they're calculated) and `app/club/tarifas/page.tsx` (the `PEDIDOS` display block). If a fee changes, change BOTH so they agree. (Could be centralised into one shared module later if it gets error-prone.)

---

## E. Register/caja sale → owner WhatsApp alert (commit `b54d5f3`)

**Why:** owner wasn't getting alerts when a distributor/seller made a register sale. Confirmed by reading `lib/notify.ts`: the four existing alerts are online orders, new signup, seller application, and encargo response — **a register sale never had an alert** (it was never built, not broken).

- `lib/notify.ts` — added **`notifyRegisterSale({invoice, sellerName, storeName, totalLabel, items})`** → "🛒 Venta en caja" to the owner. Never throws.
- `lib/pos-sale-notify.ts` (NEW) — **`maybeNotifyRegisterSale(...)`**, fully NON-BLOCKING (try/catch), runs AFTER the sale is saved. Looks up store name (`warehouses.name`), authoritative total (`sales.total_cents`), and product names (`products.name`) via the **regular server client** (as the caller). Seller name is passed in from the caller (a register sale's seller is always the logged-in caller, so it comes free from `requireAdminCaller()` — no profile read needed, avoiding the service-role `profiles` grant issue).
- `app/(dashboard)/sales/actions.ts` — in `confirmPosSale`: captured the caller (`const caller = await requireAdminCaller()`) and added one `await maybeNotifyRegisterSale(...)` call right after `maybeCreateEncargoFromSale` (the same safe "after success, non-blocking" spot). Fires for **every** confirmed register sale (paid or not), to the same owner WhatsApp number the online-order alerts use.

---

## F. Round 73a — money-account statement groups split payments (commits `c6b0d97`, `1be6db5`)

**Problem:** `receive_payment` takes one lump (e.g. RD$9,000) and allocates it across several open invoices. It writes ONE `payment_receipts` row but posts ONE ledger row per invoice (via `post_sale_payment_to_ledger`). So the money account showed 3 lines instead of one RD$9,000 deposit → impossible to match against the real bank deposit.

**Decision:** fix it **properly in SQL** (Option B), not a front-end-only patch, so the running saldo, the movement count, and the entradas/salidas totals all agree with the single-line view.

`db/migrations/round-73a-account-statement-group-receipts.sql` — rebuilt the read-only **`account_statement(p_account_id)`** so ledger rows that share a **receipt** collapse into ONE movement. Grouping key: `transactions.source_sale_payment_id → sale_payments.id → sale_payments.receipt_id` (coalesced to the row's own id when there's no receipt, so nothing else ever groups). Everything (saldo, counts, totals) is computed on the grouped rows. New per-movement JSON fields: **`group_size`** (invoice count; 1 = normal) and **`invoices`** (array of invoice numbers). **Read-only** — changes how the ledger is reported, never how money is posted.

- `lib/account-statement.ts` — added `group_size: number` + `invoices: string[]` to `StatementMovement`.
- `app/(dashboard)/money-accounts/account-statement-modal.tsx` — a grouped row (`group_size > 1`) shows as "Pago recibido · N facturas" with a chevron and is tappable to expand the invoice numbers.

**Verified live** on Bank Banreservas Perkins: the RD$9,000 (FAC-2920/2921/2922) shows as one movement, group_size 3, with all three invoices; and crucially **`computed_balance_cents` == `stored_balance_cents`** (1,523,302) — the balance was unchanged. (Also correctly grouped older 16k/19k/18k splits, including a register+online mix.)

**Gotcha that bit (file-name truncation):** the file list showed `account-statement-m…`; the REAL file is **`account-statement-modal.tsx`**, NOT `-movements`. An initial copy created an orphan `account-statement-movements.tsx` (and tsc still passed because the real `-modal` file the app imports was untouched). Fix: copy the content onto `-modal.tsx`, delete the orphan. **Lesson: always expand a truncated filename before copying.**

---

## G. `lib/nav.ts` mojibake fix (commit `7263c6d`) — RECURRING

Two seller/distributor (`es`) nav labels were double-encoded mojibake again: `/buscar` → fixed to **`¿Dónde está?`**, `/payroll` → **`Nómina`**. **This is the SECOND time these exact labels broke** (first fixed 2026-06-04, section W). Root cause is NOT the text — something re-saves `nav.ts` through a non-UTF-8 (ANSI) encoding, which double-encodes the accents. Fix is to re-save as **UTF-8 (no BOM)**; the download→copy path preserves bytes correctly. **Keep a known-good `nav.ts` handy** so it can be re-copied without re-fixing if it breaks a third time.

---

## H. Non-code guidance given this session (no repo change)

- **Meta product catalog:** reuse the existing Google feed at **`https://gangaloo.club/feed.xml`** (Meta accepts XML RSS). On the "Add products" screen pick platform **"Other"** (not "Commerce Manager"), paste the URL. Confirmed the feed is public (`Invoke-WebRequest … -MaximumRedirection 0` → 200 + application/xml). Default currency should be **DOP** (the feed prices are in DOP; each `<g:price>` carries "DOP"). If Meta flags fields, screenshot and tune `feed.xml`.
- **Meta Verified (paid) vs WhatsApp verification:** these are different. Paid Meta Verified is a badge/credibility product; it does NOT fix a phone-number OTP/registration block (esp. VoIP/virtual numbers, which Meta tightened in 2026) or business-document verification. Advised not to pay until the exact failure is known.

---

## I. Conventions reconfirmed this session

- **Encoding:** files with accents/emojis are delivered as **whole files written in UTF-8** (authored clean, not round-tripped through PowerShell, which mangles them). Verify with `Get-Content -Encoding UTF8 … | Select-String` after copying.
- **Expand a truncated filename** (from a directory listing) before copying onto it — don't assume the suffix.
- **Money display vs money posting:** when a reconciliation/display issue comes up, prefer fixing the **read/report** side (here, `account_statement`) and leave the posting functions (`receive_payment`, `post_sale_payment_to_ledger`) untouched. Verify the account balance is unchanged after.
- **Gated RPCs → regular server client** (anything checking `auth.uid()`); the service-role admin client can't read `profiles`.
- Same `tsc → add → commit → push` flow, one line at a time; SQL record files saved BEFORE `git add`.

---

## J. OPEN / WATCH (carried + new)

- **NEW — Stripe Issuing fees unverified** on `/club/tarifas`. Owner to pull real Issuing numbers from the Stripe dashboard; swap into the `TARIFAS`/`PEDIDOS` editable blocks. Current numbers are acceptance (acquiring) fees, not Issuing.
- **NEW — cotizador fees duplicated** in `app/cotizador/page.tsx` and the `PEDIDOS` block of `app/club/tarifas/page.tsx`; keep in sync (or centralise later).
- **NEW — `nav.ts` is a recurring encoding casualty** (broke twice). Keep a clean copy; re-save UTF-8 no-BOM.
- **Meta catalog** — try the existing feed; remove the old `gangaloo.netlify.app` data source from Merchant Center if still listed.
- Carried from prior addenda (still open): tier/loyalty config cleanup (two overlapping tier sets in Store Config — see 2026-06-06 §G); refunds still don't auto-return cash (Return-money is a separate manual button, 2026-06-10); points have no clawback on refund; `club_member_no` not on the People `Profile` type; remaining single-phrase product-search boxes (Caja/transfers/online-orders/labels) could use the word-split fix; mobile menu for Club/Mayoreo/Cómo funciona; retire old `gangaloo.netlify.app`; member-number backfill for till-only members; US dropship Phase 3 (USD checkout) not yet built.

---

## K. New reusable pieces to remember

- **`merge_customers(keep, retire, name, dry_run)`** — dedupe customers (round-72a).
- **`notifyRegisterSale` + `lib/pos-sale-notify.ts`** — owner alert on every register sale.
- **`account_statement()` receipt grouping** + `group_size`/`invoices` fields (round-73a).

_End of 2026-06-17 addendum._
