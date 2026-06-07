-- Round 64a - Balance Sheet monthly snapshots.
--
-- Goal: bank a snapshot of the LIVE balance_sheet() each month so the
-- Reports > Balance Sheet screen can show past months ("clean history going
-- forward"). We do NOT reconstruct the past; we store the current sheet,
-- keyed by month. Re-saving the same month overwrites it (latest wins).
--
-- This migration does NOT modify the existing balance_sheet() function. It
-- only reads it. The whole balance_sheet() jsonb (which already contains
-- live_rate, the cash split, etc.) is stored verbatim in `data`.
--
-- Access model: the table is locked down (RLS on, no grants). Every read/write
-- goes through SECURITY DEFINER functions that gate on owner/admin, EXCEPT the
-- internal capture helper, which is ungated (not granted to app users) so a
-- future scheduled job could call it directly. All money values stay in CENTS.

-- 1) Storage -----------------------------------------------------------------
create table if not exists public.balance_sheet_snapshots (
  id            uuid        primary key default gen_random_uuid(),
  period_month  date        not null unique,   -- first day of the month (DR time)
  captured_at   timestamptz not null default now(),
  data          jsonb       not null           -- verbatim balance_sheet() output
);

alter table public.balance_sheet_snapshots enable row level security;
revoke all on public.balance_sheet_snapshots from anon, authenticated;

-- 2) Internal capture helper (UNGATED definer; NOT granted to app users) ------
--    Stores the current live sheet under the current calendar month.
create or replace function public._capture_balance_sheet_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_month date  := date_trunc('month', (now() at time zone 'America/Santo_Domingo'))::date;
  v_data  jsonb := public.balance_sheet();
begin
  insert into public.balance_sheet_snapshots (period_month, captured_at, data)
  values (v_month, now(), v_data)
  on conflict (period_month)
  do update set captured_at = excluded.captured_at,
                data        = excluded.data;
  return v_data;
end;
$fn$;

revoke all on function public._capture_balance_sheet_snapshot() from anon, authenticated;

-- 3) Public "save this month" (GATED owner/admin) ----------------------------
create or replace function public.save_balance_sheet_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not exists (
    select 1 from public.profiles
    where auth_user_id = auth.uid() and role::text in ('owner','admin')
  ) then
    raise exception 'Not authorized';
  end if;
  return public._capture_balance_sheet_snapshot();
end;
$fn$;

grant execute on function public.save_balance_sheet_snapshot() to authenticated, service_role;

-- 4) List saved months (GATED owner/admin) -----------------------------------
create or replace function public.list_balance_sheet_snapshots()
returns table (period_month date, captured_at timestamptz)
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not exists (
    select 1 from public.profiles
    where auth_user_id = auth.uid() and role::text in ('owner','admin')
  ) then
    raise exception 'Not authorized';
  end if;
  return query
    select s.period_month, s.captured_at
    from public.balance_sheet_snapshots s
    order by s.period_month desc;
end;
$fn$;

grant execute on function public.list_balance_sheet_snapshots() to authenticated, service_role;

-- 5) Fetch one saved month (GATED owner/admin) -------------------------------
--    Returns NULL if no snapshot exists for that month.
create or replace function public.get_balance_sheet_snapshot(p_month date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_data jsonb;
begin
  if not exists (
    select 1 from public.profiles
    where auth_user_id = auth.uid() and role::text in ('owner','admin')
  ) then
    raise exception 'Not authorized';
  end if;
  select s.data into v_data
  from public.balance_sheet_snapshots s
  where s.period_month = date_trunc('month', p_month)::date;
  return v_data;
end;
$fn$;

grant execute on function public.get_balance_sheet_snapshot(date) to authenticated, service_role;
