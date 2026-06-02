-- round-53b-payroll-extra-day-pay.sql
-- Payroll STEP 4 (calculator) — add per-employee "extra day" pay rate.
--
-- Used when an employee works MORE days than the normal 5-day (Tue–Sat)
-- baseline in a pay period: extra_days * extra_day_pay_cents is added to pay.
-- Defaults to 0 so it does nothing until the owner sets an amount.
-- Money in CENTS. Purely additive.

alter table public.payroll_employees
  add column if not exists extra_day_pay_cents bigint not null default 0;
