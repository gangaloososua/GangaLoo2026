-- round-53a-payroll-foundation.sql
-- Employee timesheets + payroll calculator — STEP 1: the tables.
--
-- All amounts in CENTS (RD$2,000 -> 200000), matching the rest of the app.
-- Employees are existing staff (profiles). Everything here is OWNER-ONLY:
-- RLS is ON and the tables are revoked from anon/authenticated, exactly like
-- service_orders. All reads/writes go through the service-role admin client
-- inside owner-gated server actions, so payroll never reaches a seller.
--
-- Purely additive: creates new tables only, touches no existing data.

-- 1) Employees on payroll (one row per staff member who gets paid this way).
create table if not exists public.payroll_employees (
  id                              uuid primary key default gen_random_uuid(),
  profile_id                      uuid not null references public.profiles(id) on delete cascade,
  is_active                       boolean not null default true,
  -- Optional convenience defaults used only to PRE-FILL the per-day box.
  -- The real deduction is entered per attendance day (depends on the work).
  default_late_deduction_cents    bigint not null default 0,
  default_absent_deduction_cents  bigint not null default 0,
  notes                           text,
  created_at                      timestamptz not null default now(),
  unique (profile_id)
);

-- 2) Stacking pay components (e.g. "Base" 2000 weekly + "Bono" 1000 twice a month).
create table if not exists public.payroll_pay_components (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.payroll_employees(id) on delete cascade,
  label         text not null,
  amount_cents  bigint not null check (amount_cents >= 0),
  frequency     text not null check (frequency in ('weekly', 'biweekly', 'semimonthly', 'monthly')),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists idx_payroll_components_employee
  on public.payroll_pay_components (employee_id);

-- 3) Attendance — one mark per employee per day, with that day's deduction.
create table if not exists public.payroll_attendance (
  id               uuid primary key default gen_random_uuid(),
  employee_id      uuid not null references public.payroll_employees(id) on delete cascade,
  work_date        date not null,
  status           text not null check (status in ('present', 'late', 'absent')),
  deduction_cents  bigint not null default 0 check (deduction_cents >= 0),
  note             text,
  created_at       timestamptz not null default now(),
  unique (employee_id, work_date)
);
create index if not exists idx_payroll_attendance_employee_date
  on public.payroll_attendance (employee_id, work_date);

-- 4) Advances ("adelanto") — upfront money paid, deducted from the period total.
create table if not exists public.payroll_advances (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.payroll_employees(id) on delete cascade,
  advance_date  date not null,
  amount_cents  bigint not null check (amount_cents >= 0),
  note          text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_payroll_advances_employee_date
  on public.payroll_advances (employee_id, advance_date);

-- Lock everything down: owner-only via the service-role admin client.
alter table public.payroll_employees      enable row level security;
alter table public.payroll_pay_components enable row level security;
alter table public.payroll_attendance     enable row level security;
alter table public.payroll_advances       enable row level security;

revoke all on table public.payroll_employees      from anon, authenticated;
revoke all on table public.payroll_pay_components from anon, authenticated;
revoke all on table public.payroll_attendance     from anon, authenticated;
revoke all on table public.payroll_advances       from anon, authenticated;

grant all on table public.payroll_employees      to service_role;
grant all on table public.payroll_pay_components to service_role;
grant all on table public.payroll_attendance     to service_role;
grant all on table public.payroll_advances       to service_role;
