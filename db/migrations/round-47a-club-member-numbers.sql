-- round-47a-club-member-numbers.sql
-- Real, sequential Club member numbers (GL-000001, GL-000002, …) assigned at
-- signup so they show on the member's card right away.
--
-- Pieces:
--   * profiles.club_member_no  — the formatted number stored on the profile
--   * club_member_seq          — the counter that hands out the next value
--   * assign_club_member_no()  — assigns the caller's own number (idempotent):
--       returns the existing number if they already have one, otherwise takes
--       the next value, stores it, and returns it. Scoped to auth.uid(), so a
--       caller can only ever number their own profile.
--
-- Only the Club signup calls this (the regular storefront signup does not), so
-- ordinary customers don't consume numbers.

alter table public.profiles
  add column if not exists club_member_no text;

create sequence if not exists public.club_member_seq;

-- No two profiles can share a number.
create unique index if not exists profiles_club_member_no_key
  on public.profiles (club_member_no)
  where club_member_no is not null;

create or replace function public.assign_club_member_no()
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_pid uuid;
  v_no  text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select id, club_member_no
    into v_pid, v_no
    from profiles
   where auth_user_id = v_uid
   limit 1;

  if v_pid is null then
    raise exception 'no profile' using errcode = '22023';
  end if;

  -- Already has a number → return it unchanged (idempotent / safe to re-call).
  if v_no is not null then
    return v_no;
  end if;

  v_no := 'GL-' || lpad(nextval('public.club_member_seq')::text, 6, '0');

  update profiles
     set club_member_no = v_no,
         updated_at = now()
   where id = v_pid;

  return v_no;
end;
$function$;

grant execute on function public.assign_club_member_no() to authenticated;
