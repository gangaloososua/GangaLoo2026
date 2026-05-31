-- round-45b-club-and-loyalty-foundation.sql
-- SUPERSEDES round-45a. Model correction: Club (paid) and loyalty (earned) are
-- SEPARATE and STACK (added, capped 30%) — NOT merged into one ladder.
--
-- This migration is SAFE: it touches no storefront/register pricing path yet, so
-- deploying it changes no real prices. It only:
--   (1) restores get_customer_tier() to PURE loyalty (spend only), undoing the
--       45a merge (which only affected the test customer), and
--   (2) adds two read-only helpers that report a customer's CLUB discount %,
--       sourced from the active club_tier discount RULES — the SAME source the
--       in-person resolver already uses, so online and register will agree.
--
-- The helpers are not called by any pricing path yet; later steps wire them into
-- the online quote/charge, the in-person resolver, and the product grid — each
-- additive on top of loyalty and capped at 30%, tested on a dummy customer.

-- (1) get_customer_tier — PURE loyalty (spend only). Same as round-34a.
create or replace function public.get_customer_tier(p_customer_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_role        text;
  v_sum_cents   bigint := 0;
  v_per_hundred numeric;
  v_points      integer;
  v_t1 integer; v_t2 integer; v_t3 integer; v_t4 integer;
  v_p1 numeric; v_p2 numeric; v_p3 numeric; v_p4 numeric;
  v_idx integer := 0;
  v_name text := '';
  v_pct numeric := 0;
  v_next integer;
  v_to_next integer;
begin
  if p_customer_id is null then
    return jsonb_build_object('tier_index',0,'tier_name','','discount_pct',0,'points',0,'next_points',null,'points_to_next',null);
  end if;

  select role into v_role from profiles where id = p_customer_id;
  if v_role is distinct from 'customer' then
    return jsonb_build_object('tier_index',0,'tier_name','','discount_pct',0,'points',0,'next_points',null,'points_to_next',null);
  end if;

  select coalesce(sum(total_cents), 0) into v_sum_cents
    from sales
   where customer_id = p_customer_id
     and status in ('confirmed','paid','partially_paid')
     and source in ('online','pos')
     and sold_at >= now() - interval '365 days';

  v_per_hundred := cfg_num('ptsPerHundred', 1);
  v_points := floor((v_sum_cents / 100.0) / 100.0 * v_per_hundred)::int;

  v_t1 := cfg_num('tier1_points', 250)::int;
  v_t2 := cfg_num('tier2_points', 500)::int;
  v_t3 := cfg_num('tier3_points', 750)::int;
  v_t4 := cfg_num('tier4_points', 1000)::int;
  v_p1 := cfg_num('tier1_pct', 5);
  v_p2 := cfg_num('tier2_pct', 10);
  v_p3 := cfg_num('tier3_pct', 15);
  v_p4 := cfg_num('tier4_pct', 20);

  if v_points >= v_t4 then
    v_idx := 4; v_name := 'Platinum'; v_pct := v_p4; v_next := null; v_to_next := null;
  elsif v_points >= v_t3 then
    v_idx := 3; v_name := 'Gold'; v_pct := v_p3; v_next := v_t4; v_to_next := v_t4 - v_points;
  elsif v_points >= v_t2 then
    v_idx := 2; v_name := 'Silver'; v_pct := v_p2; v_next := v_t3; v_to_next := v_t3 - v_points;
  elsif v_points >= v_t1 then
    v_idx := 1; v_name := 'Bronze'; v_pct := v_p1; v_next := v_t2; v_to_next := v_t2 - v_points;
  else
    v_idx := 0; v_name := ''; v_pct := 0; v_next := v_t1; v_to_next := v_t1 - v_points;
  end if;

  return jsonb_build_object(
    'tier_index', v_idx,
    'tier_name', v_name,
    'discount_pct', v_pct,
    'points', v_points,
    'next_points', v_next,
    'points_to_next', v_to_next
  );
end;
$function$;

-- (2a) get_customer_club_pct — CLUB discount % for a customer, from club_tier RULES.
--      0 when the customer has no granted tier ('none') or no matching active rule.
--      One rule per tier is expected; if several match, their %s are summed.
create or replace function public.get_customer_club_pct(p_customer_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_role text;
  v_tier public.club_tier;
  v_pct  numeric := 0;
begin
  if p_customer_id is null then
    return 0;
  end if;

  select role, club_tier into v_role, v_tier from profiles where id = p_customer_id;

  if v_role is distinct from 'customer' or v_tier is null or v_tier = 'none' then
    return 0;
  end if;

  select coalesce(sum(delta_percent), 0) into v_pct
    from discount_rules
   where kind = 'club_tier'
     and is_active = true
     and scope_club_tier = v_tier
     and (starts_at is null or starts_at <= now())
     and (ends_at   is null or ends_at   >= now());

  return coalesce(v_pct, 0);
end;
$function$;

-- (2b) get_my_customer_club_pct — the logged-in customer's own Club %, by auth.uid().
create or replace function public.get_my_customer_club_pct()
returns numeric
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    return 0;
  end if;
  select id into v_id from profiles where auth_user_id = auth.uid() limit 1;
  return get_customer_club_pct(v_id);
end;
$function$;

grant execute on function public.get_customer_club_pct(uuid) to authenticated;
grant execute on function public.get_my_customer_club_pct() to authenticated, anon;
