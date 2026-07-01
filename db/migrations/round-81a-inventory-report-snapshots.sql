-- round-81a-inventory-report-snapshots.sql
--
-- Reports > Inventory Valuation: monthly snapshots, mirroring the Balance
-- Sheet snapshot feature (round-64a). Inventory valuation is current qty x
-- cost and CANNOT be reconstructed for the past (historical shelf quantities
-- were never stored), so - exactly like the balance sheet - we bank a copy of
-- the live inventory_report() output per calendar month, going forward. The
-- screen can then show Live (today) or any saved month.
--
-- This is a faithful clone of the balance-sheet snapshot objects: same table
-- shape, same DR-timezone month key, same owner/admin gating, same
-- upsert-latest-wins behaviour. Only balance_sheet -> inventory_report and the
-- table name differ.
--
-- Snapshots start the month this is deployed; there is no data for earlier
-- months by design.

-- 1) Storage: one row per calendar month (DR time). Latest save wins.
create table if not exists public.inventory_report_snapshots (
  id           uuid primary key default gen_random_uuid(),
  period_month date not null unique,
  captured_at  timestamptz not null default now(),
  data         jsonb not null
);

alter table public.inventory_report_snapshots enable row level security;
revoke all on public.inventory_report_snapshots from anon, authenticated;

-- 2) UNGATED capture helper (not granted to app users; exists so a future
--    pg_cron job could call it directly). The gated wrapper below calls it.
create or replace function public._capture_inventory_report_snapshot()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_month date  := date_trunc('month', (now() at time zone 'America/Santo_Domingo'))::date;
  v_data  jsonb := public.inventory_report();
begin
  insert into public.inventory_report_snapshots (period_month, captured_at, data)
  values (v_month, now(), v_data)
  on conflict (period_month)
  do update set captured_at = excluded.captured_at,
                data        = excluded.data;
  return v_data;
end;
$function$;

-- 3) Gated save: owner/admin only; banks/refreshes the current DR month.
create or replace function public.save_inventory_report_snapshot()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not exists (
    select 1 from public.profiles
    where auth_user_id = auth.uid() and role::text in ('owner','admin')
  ) then
    raise exception 'Not authorized';
  end if;
  return public._capture_inventory_report_snapshot();
end;
$function$;

-- 4) Gated list: saved months, newest first.
create or replace function public.list_inventory_report_snapshots()
returns table(period_month date, captured_at timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not exists (
    select 1 from public.profiles
    where auth_user_id = auth.uid() and role::text in ('owner','admin')
  ) then
    raise exception 'Not authorized';
  end if;
  return query
    select s.period_month, s.captured_at
    from public.inventory_report_snapshots s
    order by s.period_month desc;
end;
$function$;

-- 5) Gated get: one month's stored data, or NULL.
create or replace function public.get_inventory_report_snapshot(p_month date)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  from public.inventory_report_snapshots s
  where s.period_month = date_trunc('month', p_month)::date;
  return v_data;
end;
$function$;

-- 6) Grants: match the balance-sheet snapshot RPCs (gated fns to authenticated
--    + service_role; the capture helper is intentionally NOT granted).
grant execute on function public.save_inventory_report_snapshot()  to authenticated, service_role;
grant execute on function public.list_inventory_report_snapshots() to authenticated, service_role;
grant execute on function public.get_inventory_report_snapshot(date) to authenticated, service_role;
