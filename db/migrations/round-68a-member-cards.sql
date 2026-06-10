-- Round 68a — NFC membership cards
-- ============================================================================
-- Maps a physical NFC card's serial number to an existing customer profile,
-- so a tap at the POS identifies the customer. This is ONLY an identification
-- layer: points (profiles.bonus_points), tier (profiles.club_tier) and sales
-- history (sales.customer_id) already exist and are untouched here.
--
-- Access model (matches house style): table is RLS-locked with no policies;
-- all reads/writes go through SECURITY DEFINER functions that gate on
-- auth.uid() -> profiles.role in ('owner','seller'). Because they gate on
-- auth.uid(), these RPCs MUST be called via the regular server client
-- (@/lib/supabase/server), exactly like balance_sheet().
--
-- Card serials are normalised (uppercase hex, separators stripped) on both
-- write and lookup, so "04:1a:2b" and "041A2B" match the same card.
-- ============================================================================

-- ---- Table --------------------------------------------------------------
create table if not exists public.member_cards (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid not null references public.profiles(id) on delete cascade,
  card_uid        text not null,                 -- normalised serial
  label           text,                          -- optional, e.g. "Green card"
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  created_by      uuid references public.profiles(id),
  deactivated_at  timestamptz
);

-- One ACTIVE owner per physical card; deactivated rows are kept for history.
create unique index if not exists member_cards_active_uid_ux
  on public.member_cards (card_uid) where is_active;

create index if not exists member_cards_customer_idx
  on public.member_cards (customer_id);

-- ---- Lock it down -------------------------------------------------------
alter table public.member_cards enable row level security;
revoke all on public.member_cards from anon, authenticated;

-- ---- Helpers ------------------------------------------------------------
create or replace function public._member_card_normalize(p_uid text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(upper(regexp_replace(coalesce(p_uid, ''), '[^0-9A-Fa-f]', '', 'g')), '');
$$;

create or replace function public._member_card_is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where auth_user_id = auth.uid()
      and role in ('owner', 'seller')
      and is_active
  );
$$;

-- ---- Link a card to a customer -----------------------------------------
create or replace function public.link_member_card(
  p_customer_id uuid,
  p_card_uid    text,
  p_label       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     text;
  v_me      uuid;
  v_owner   uuid;
  v_card_id uuid;
begin
  if not public._member_card_is_staff() then
    raise exception 'Not authorized';
  end if;

  v_uid := public._member_card_normalize(p_card_uid);
  if v_uid is null then
    raise exception 'Card serial is empty or unreadable';
  end if;

  -- target must be an existing, active customer
  if not exists (
    select 1 from public.profiles
    where id = p_customer_id and role = 'customer' and is_active
  ) then
    raise exception 'That customer was not found (or is not an active customer)';
  end if;

  -- is this physical card already active for someone?
  select customer_id into v_owner
  from public.member_cards
  where card_uid = v_uid and is_active;

  if v_owner = p_customer_id then
    select id into v_card_id
    from public.member_cards
    where card_uid = v_uid and is_active;
    return jsonb_build_object('status', 'already', 'card_id', v_card_id);
  elsif v_owner is not null then
    raise exception 'That card is already linked to another customer. Deactivate it there first.';
  end if;

  select id into v_me from public.profiles where auth_user_id = auth.uid();

  insert into public.member_cards (customer_id, card_uid, label, created_by)
  values (p_customer_id, v_uid, nullif(btrim(p_label), ''), v_me)
  returning id into v_card_id;

  return jsonb_build_object('status', 'linked', 'card_id', v_card_id);
end;
$$;

-- ---- Deactivate a card (lost / replaced) -------------------------------
create or replace function public.deactivate_member_card(p_card_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hit int;
begin
  if not public._member_card_is_staff() then
    raise exception 'Not authorized';
  end if;

  update public.member_cards
     set is_active = false,
         deactivated_at = now()
   where id = p_card_id and is_active;

  get diagnostics v_hit = row_count;
  return jsonb_build_object('ok', v_hit > 0);
end;
$$;

-- ---- List a customer's cards (for the enroll screen) -------------------
create or replace function public.list_member_cards(p_customer_id uuid)
returns table (
  id             uuid,
  card_uid       text,
  label          text,
  is_active      boolean,
  created_at     timestamptz,
  deactivated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public._member_card_is_staff() then
    raise exception 'Not authorized';
  end if;

  return query
    select mc.id, mc.card_uid, mc.label, mc.is_active, mc.created_at, mc.deactivated_at
    from public.member_cards mc
    where mc.customer_id = p_customer_id
    order by mc.is_active desc, mc.created_at desc;
end;
$$;

-- ---- Find a customer by a tapped card (the POS lookup) ------------------
create or replace function public.find_customer_by_card(p_card_uid text)
returns table (
  card_id        uuid,
  customer_id    uuid,
  full_name      text,
  phone          text,
  is_club_member boolean,
  club_tier      text,
  club_member_no text,
  bonus_points   integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid text;
begin
  if not public._member_card_is_staff() then
    raise exception 'Not authorized';
  end if;

  v_uid := public._member_card_normalize(p_card_uid);
  if v_uid is null then
    return;  -- nothing to match
  end if;

  return query
    select
      mc.id,
      p.id,
      p.full_name,
      p.phone,
      p.is_club_member,
      p.club_tier::text,
      p.club_member_no,
      p.bonus_points
    from public.member_cards mc
    join public.profiles p on p.id = mc.customer_id
    where mc.card_uid = v_uid and mc.is_active
    limit 1;
end;
$$;

-- ---- Grants -------------------------------------------------------------
grant execute on function public.link_member_card(uuid, text, text)  to authenticated, service_role;
grant execute on function public.deactivate_member_card(uuid)        to authenticated, service_role;
grant execute on function public.list_member_cards(uuid)             to authenticated, service_role;
grant execute on function public.find_customer_by_card(text)         to authenticated, service_role;
-- helpers are internal; no direct grants needed (called within the above)

-- End of Round 68a.
