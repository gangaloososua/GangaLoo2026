-- round-45a-granted-club-tier.sql
-- Paid Club = a manually GRANTED loyalty tier.
--
-- Extends get_customer_tier() so a customer's EFFECTIVE tier is the HIGHER of:
--   (a) the tier they EARNED by spending  (existing trailing-365-day points), and
--   (b) the tier GRANTED by hand in the admin People form (profiles.club_tier).
--
-- This lets a paying Club member get their discount immediately, without having
-- to spend for it. The online storefront already calls get_customer_tier() for
-- both the checkout quote and the actual charge, so once this function honors a
-- granted tier, online checkout + charge honor it automatically — no app code
-- change needed for those two.
--
-- Percentages stay the existing store_config keys tier1_pct..tier4_pct
-- (5 / 10 / 15 / 20). Nothing about point math, thresholds, or stacking changes.
--
-- SAFE TO DEPLOY: output is byte-for-byte identical for any customer whose
-- profiles.club_tier is NULL or 'none' (i.e. everyone today), because
-- greatest(earned, 0) = earned. Prices only change after you grant a tier.
--
-- IN-PERSON PARITY (separate, one-time admin task, not in this file):
-- the register/admin-order discount comes from club_tier discount RULES. For the
-- register to match the online %s, create four club-tier rules in the admin
-- (Discount rules > New > Club tier) at Bronze 5, Silver 10, Gold 15, Platinum 20.

create or replace function public.get_customer_tier(p_customer_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_role        text;
  v_granted     public.club_tier;
  v_granted_idx integer := 0;
  v_sum_cents   bigint := 0;
  v_per_hundred numeric;
  v_points      integer;
  v_t1 integer; v_t2 integer; v_t3 integer; v_t4 integer;
  v_p1 numeric; v_p2 numeric; v_p3 numeric; v_p4 numeric;
  v_earned_idx  integer := 0;
  v_idx         integer := 0;
  v_name        text := '';
  v_pct         numeric := 0;
  v_next        integer;
  v_to_next     integer;
begin
  if p_customer_id is null then
    return jsonb_build_object('tier_index',0,'tier_name','','discount_pct',0,'points',0,'next_points',null,'points_to_next',null,'earned_tier_index',0,'granted_tier_index',0);
  end if;

  -- Role + the manually-granted tier, read together.
  select role, club_tier into v_role, v_granted from profiles where id = p_customer_id;

  -- Staff / owner / seller / distributor never earn or get tiers.
  if v_role is distinct from 'customer' then
    return jsonb_build_object('tier_index',0,'tier_name','','discount_pct',0,'points',0,'next_points',null,'points_to_next',null,'earned_tier_index',0,'granted_tier_index',0);
  end if;

  -- Map the granted tier to an index. NULL or 'none' => 0 (not enrolled).
  v_granted_idx := case v_granted
    when 'platinum' then 4
    when 'gold'     then 3
    when 'silver'   then 2
    when 'bronze'   then 1
    else 0
  end;

  -- Points earned from trailing-365-day spend (online + POS, real sales only).
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

  -- Tier earned purely by spend.
  if    v_points >= v_t4 then v_earned_idx := 4;
  elsif v_points >= v_t3 then v_earned_idx := 3;
  elsif v_points >= v_t2 then v_earned_idx := 2;
  elsif v_points >= v_t1 then v_earned_idx := 1;
  else                        v_earned_idx := 0;
  end if;

  -- Effective tier = the higher of earned and granted, so a paid member is
  -- never worse off than what their spending already earns them.
  v_idx := greatest(v_earned_idx, v_granted_idx);

  -- Name / discount % / next-threshold for the effective tier.
  if    v_idx = 4 then v_name := 'Platinum'; v_pct := v_p4; v_next := null; v_to_next := null;
  elsif v_idx = 3 then v_name := 'Gold';     v_pct := v_p3; v_next := v_t4; v_to_next := greatest(v_t4 - v_points, 0);
  elsif v_idx = 2 then v_name := 'Silver';   v_pct := v_p2; v_next := v_t3; v_to_next := greatest(v_t3 - v_points, 0);
  elsif v_idx = 1 then v_name := 'Bronze';   v_pct := v_p1; v_next := v_t2; v_to_next := greatest(v_t2 - v_points, 0);
  else                 v_name := '';         v_pct := 0;    v_next := v_t1; v_to_next := greatest(v_t1 - v_points, 0);
  end if;

  return jsonb_build_object(
    'tier_index', v_idx,
    'tier_name', v_name,
    'discount_pct', v_pct,
    'points', v_points,
    'next_points', v_next,
    'points_to_next', v_to_next,
    'earned_tier_index', v_earned_idx,
    'granted_tier_index', v_granted_idx
  );
end;
$function$;
