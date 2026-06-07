# GangaLoo — Handoff Addendum (2026-06-07)

_Appended to the prior handoffs. Same owner (**Bernhard Perkins**, non-technical), same workflow: work **one step at a time**, plain language, **DB before dependent code**, deliver files to copy in, then publish `npx tsc --noEmit` → `git add` (explicit paths) → `git commit` → `git push` (**commit before push**; a pre-commit hook runs tsc). Everything below is committed, pushed, and live. Round numbering continues from Round 63 in the prior addendum._

---

## A. What shipped this session

| Commit | Round | What |
| --- | --- | --- |
| `5f1e696` | 64a | **Balance Sheet: monthly snapshots** (date picker + "Save this month" + auto-bank) |
| `f00a259` | 65a | **Balance Sheet: convert EUR/USD cash to pesos**; Add-transaction amount label shows the account's real currency |
| `b7219d0` | 66a | **Payroll attendance: "Off" days now save and persist** (new `off` status) |

---

## B. Round 64a — Balance Sheet monthly snapshots

**Decision on record:** the balance sheet is **forward-only**. We do NOT reconstruct the past (the system never stored historical shelf quantities, so a past inventory value can't be rebuilt accurately). Instead we **bank a copy of the live sheet each month** going forward. Snapshots start **June 2026**; there is no data for earlier months by design.

**DB** (`round-64a-balance-sheet-snapshots.sql`):
- Table **`public.balance_sheet_snapshots`** (`id`, `period_month date UNIQUE` = first of the month in DR time, `captured_at`, `data jsonb` = the verbatim `balance_sheet()` output). RLS ON, revoked from anon/authenticated. **One row per month** — re-saving a month overwrites it (latest wins).
- Functions (all `SECURITY DEFINER, set search_path = public`):
  - **`_capture_balance_sheet_snapshot()`** — UNGATED, **not** granted to app users; upserts the current DR-month. Exists so a future scheduled job (pg_cron) could call it directly. The wrapper below calls it.
  - **`save_balance_sheet_snapshot()`** — gated owner/admin (checks `profiles` where `auth_user_id = auth.uid()` and `role in ('owner','admin')`), granted to authenticated + service_role.
  - **`list_balance_sheet_snapshots()`** — gated; returns `(period_month, captured_at)` newest first.
  - **`get_balance_sheet_snapshot(p_month date)`** — gated; returns that month's `data` jsonb, or NULL.
- Because they gate on `auth.uid()`, the save/list/get RPCs **must** be called via the **regular server client** (`@/lib/supabase/server`), exactly like `balance_sheet()` already is.

**Code:**
- `lib/balance-sheet.ts` — added `listBalanceSheetSnapshots()`, `getBalanceSheetSnapshot()`, `saveBalanceSheetSnapshot()` + `BalanceSheetSnapshotMeta` type.
- `app/(dashboard)/reports/balance-sheet/actions.ts` (NEW) — `'use server'` `saveSnapshotAction()`: `requireOwner()` → save → `revalidatePath('/reports/balance-sheet')`.
- `app/(dashboard)/reports/balance-sheet/snapshot-controls.tsx` (NEW, client) — a **Live (today) / saved-month dropdown** (navigates to `?month=YYYY-MM-01`) plus a **"Save this month's snapshot"** button. On mount it **auto-banks the current month once** if no snapshot exists for it yet (so history accrues hands-off).
- `app/(dashboard)/reports/balance-sheet/page.tsx` — reads `searchParams` (an awaited Promise in Next 16) `?month=…`; fetches the snapshot when a month is chosen, else the live sheet; header reads "Snapshot as of …" (live) or "Saved snapshot from …" (saved).

---

## C. Round 65a — Foreign-currency cash on the Balance Sheet (+ transaction label)

**The problem found:** `money_accounts` has a **real `currency` column** (DOP / EUR / USD — 12 / 5 / 4 accounts). The old `balance_sheet()` summed every account's `balance_cents` together **as if all pesos**, so euro and dollar balances were counted one-for-one as DOP. Separately, the **Add-transaction form's amount label was hard-coded "Amount (RD$)"** regardless of the chosen account, and the form **stores the typed number straight onto the balance with no conversion** (which is correct — each account holds its own currency).

**Rates:** `public.monthly_exchange_rates` (`year, month, rate, currency`) — the `currency` column already existed. Owner added **EUR** rows (June 70.00, May 71.00); **USD** already present (June 62.00, May 62.50).

**DB** (`round-65a-balance-sheet-currency-convert.sql`): `CREATE OR REPLACE FUNCTION public.balance_sheet()`, rebuilt from the **live** `pg_get_functiondef` body (it matched the file — no drift). **Only the cash block changed:**
- New `fx` CTE = latest rate per currency (`row_number() over (partition by currency order by year desc, month desc, created_at desc)`).
- Cash now sums `round(balance_cents * factor)` where factor = `1` for DOP, else the latest rate, else `1` (unrated currency falls back to 1:1 = old behaviour, nothing vanishes).
- Output gained **`cash_rates {eur, usd}`**. Everything else (inventory, receivables, supplier_owed via the USD `live_rate`, commissions) is unchanged.
- Conversion math: `balance_cents` are cents **of that currency**; DOP cents = `round(balance_cents * rate)`.

**Code:**
- `lib/balance-sheet.ts` — `BalanceSheet` type gained optional **`cash_rates?: { eur: number|null; usd: number|null }`** (optional so pre-65a snapshots still typecheck).
- `app/(dashboard)/reports/balance-sheet/balance-sheet-view.tsx` — shows a note "Foreign-currency cash converted to pesos at EUR x / US$ y per unit" when rates are present.
- `app/(dashboard)/accounting/transaction-form.tsx` — amount label now reflects the selected account's currency (`RD$` / `€` / `US$`) via a `currencySymbol()` helper, plus a hint for non-DOP accounts: "Enter the amount in <CUR>, this account's own currency."

**Verified:** cash jumped from ~49.3M cents (mixed) to **74,372,384 cents**; `cash_rates = {"eur":70,"usd":62}`.

**Behaviour / gotchas:**
- The balance sheet converts using the **latest** monthly rate per currency (not necessarily the *current* month's). To make the sheet use a new rate, add the new month's row in `monthly_exchange_rates`.
- **Snapshots freeze the rate at capture time** (correct for history). After 65a deployed, the owner was told to click **"Save this month's snapshot"** once to refresh June (the snapshot banked under 64a still held the old mixed-currency cash number).
- **OPEN / WATCH:** the Add-transaction form intentionally stores per-account currency with **no conversion**. So an account's own balance/statement is in its own currency; conversion happens only when the balance sheet adds everything up. Older entries on a foreign account (e.g. **Bank C24 (EUR)**) may have been typed as **pesos** back when the label wrongly said "RD$" — those would now be misvalued. **Worth auditing C24's history** before trusting its balance.

---

## D. Round 66a — Payroll attendance: "Off" days persist

**Bug reported:** setting a normal weekday (Tue–Sat) to **Off** didn't survive a refresh — it sprang back to the Present/Late/Absent buttons. **Two causes:** (1) `payroll_attendance`'s CHECK only allowed `present/late/absent`, so an `off` row could not be stored at all; (2) the screen **skipped** off-days when saving, and Tue–Sat reload **assumes worked unless told otherwise**. (Sun/Mon behaved fine only because Off is their built-in default and needs no row.)

**DB** (`round-66a-attendance-off-status.sql`): dropped `payroll_attendance_status_check` (if exists) and re-added it as `status in ('present','late','absent','off')`. Additive, no data touched.

**Code:**
- `lib/payroll.ts` — `AttendanceStatus` gained `'off'`.
- `app/(dashboard)/payroll/actions.ts` — `STATUSES` includes `'off'`; in `saveAttendanceMonth`, deduction is 0 for **present AND off** (only late/absent carry a deduction).
- `app/(dashboard)/payroll/attendance-tab.tsx` — `onSave` now writes **every** day including Off ones (`status 'off'`, deduction 0), so an Off day persists and **overwrites** any prior worked row for that date; `load()` maps a stored `off` row → `off: true` (keeps `status` as `'present'` so "+ Mark" activates cleanly).

**Pay calculator (`pay-run-tab.tsx`) is UNCHANGED and safe:** worked days = present + late; deductions = late + absent. Any status that isn't present/late/absent (i.e. `off`) is **ignored**, so Off days have no effect on pay.

**OPEN (pay-policy decision, NOT a bug):** the pay-run "extra days worked" baseline = **all** Tue–Sat in range; it is **not** reduced by Off days. So if a normal day is Off but the employee works a Sunday to make up, that Sunday is treated as a **swap = no extra-day pay**. If the owner ever wants make-up days to earn extra-day pay, reduce the baseline by Off days in `pay-run-tab.tsx` — left undone deliberately because it changes pay.

---

## E. Conventions reconfirmed this session

- **Money functions:** always rebuild a `CREATE OR REPLACE` function from the **live** body (`select pg_get_functiondef('public.fn(args)'::regprocedure);`), never from an old file — copy the full returned text from the result cell (it comes back as one big cell). Reproduce the **whole** body; change only the lines needed.
- **PowerShell file delivery:** Claude now always ships a move script with each file. Newest-match picker `Get-ChildItem -LiteralPath $dl -Filter 'name*.ext' | Sort-Object LastWriteTime -Descending | Select-Object -First 1` avoids `(1)` collisions. When two patterns can overlap (e.g. `payroll*.ts` also matching `payroll-actions.ts`, or `balance-sheet*.ts` matching `balance-sheet-view.tsx`), exclude the unwanted one explicitly.
- **Owner-only payroll** tables stay RLS-locked with no policies; reads/writes go through the **service-role admin client** inside `requireOwner()`-gated actions — EXCEPT advance post/remove, which use the **regular server client** because the ledger RPCs gate on `auth.uid()`.

_End of 2026-06-07 addendum._
