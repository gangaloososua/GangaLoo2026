-- round-45c-club-membership-discount-foundation.sql
-- Club membership = a flat % for customers whose profiles.is_club_member = true,
-- applied ON TOP of loyalty (the 30% cap is enforced later, where prices are
-- actually figured).
--
-- The is_club_member toggle currently drives nothing in pricing (verified), so
-- this migration is SAFE: it only (1) stores the flat %, and (2) (re)defines a
-- read-only helper that reports it per customer. No pricing path calls the helper
-- yet, so deploying changes no prices. Prices only change in the LATER steps that
-- wire this into checkout / charge / register / grid — and even then only for
-- customers with the toggle ON (just the test customer today).

-- (1) The Club membership flat discount %. Editable later in Store Config.
insert into store_config (key, value, description) values
  ('club_member_pct', to_jsonb(15), 'Club: flat % discount for paid Club members (on top of loyalty)')
on conflict (key) do nothing;

-- (2) Club discount % for a customer: the club_member_pct when they are a customer
--     with the Club toggle ON, otherwise 0.
--     (Replaces the round-45b version, which mistakenly keyed off the loyalty tier.)
create or replace function public.get_customer_club_pct(p_customer_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_role   text;
  v_member boolean;
begin
  if p_customer_id is null then
    return 0;
  end if;

  select role, coalesce(is_club_member, false)
    into v_role, v_member
    from profiles
   where id = p_customer_id;

  if v_role is distinct from 'customer' or v_member is not true then
    return 0;
  end if;

  return cfg_num('club_member_pct', 0);
end;
$function$;

-- get_my_customer_club_pct() from round-45b keeps working (it calls the function
-- above via auth.uid()). Re-grant execute for safety.
grant execute on function public.get_customer_club_pct(uuid) to authenticated;
