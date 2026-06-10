-- Round 68d — Loyalty points earning on paid sales
-- ============================================================================
-- Awards bonus_points to the attached customer when a sale becomes fully PAID.
--
--   Rate:   store_config key 'loyalty_points_per_100' (jsonb number),
--           = points earned per RD$100 of merchandise. Defaults to 1.
--   Base:   merchandise after discounts = subtotal_cents - discount_cents
--           (shipping and tax are excluded). RD$100 = 10000 cents.
--   When:   status reaches 'paid' AND customer_id is set AND not yet awarded.
--   Guard:  sales.points_awarded_at — set once, so points are granted a single
--           time per sale even across partial-payment completions or re-saves.
--
-- Mechanism is a BEFORE trigger on public.sales. It does NOT touch the
-- confirm_pos_sale engine. SECURITY DEFINER so it can update profiles/read
-- config regardless of who rang up the sale (owner or seller).
--
-- Walk-ins (no customer) earn nothing. Refunds do not claw points back in this
-- version (matches the existing refund, which also leaves payments alone).
-- ============================================================================

-- ---- 1. Idempotency stamp on sales -------------------------------------
alter table public.sales
  add column if not exists points_awarded_at timestamptz;

-- ---- 2. The earn rate as a config setting (default 1) ------------------
insert into public.store_config (key, value, description)
values (
  'loyalty_points_per_100',
  to_jsonb(1),
  'Loyalty points earned per RD$100 of merchandise (after discounts) on a paid sale.'
)
on conflict (key) do nothing;

-- ---- 3. Trigger function ------------------------------------------------
create or replace function public._award_loyalty_points()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rate        numeric;
  v_merch_cents integer;
  v_points      integer;
begin
  -- Only fully-paid sales, with a customer, not already awarded.
  if NEW.status <> 'paid' then
    return NEW;
  end if;
  if NEW.customer_id is null then
    return NEW;
  end if;
  if NEW.points_awarded_at is not null then
    return NEW;  -- already granted
  end if;

  -- Rate: points per RD$100. Stored as a jsonb number; default 1 if missing.
  select (value #>> '{}')::numeric
    into v_rate
    from public.store_config
   where key = 'loyalty_points_per_100';
  if v_rate is null then
    v_rate := 1;
  end if;

  -- Merchandise net of discounts; shipping and tax excluded.
  v_merch_cents := greatest(
    coalesce(NEW.subtotal_cents, 0) - coalesce(NEW.discount_cents, 0),
    0
  );

  v_points := floor((v_merch_cents / 10000.0) * v_rate)::integer;

  if v_points > 0 then
    update public.profiles
       set bonus_points = coalesce(bonus_points, 0) + v_points
     where id = NEW.customer_id;
  end if;

  -- Stamp it regardless, so we never re-evaluate this sale.
  NEW.points_awarded_at := now();
  return NEW;
end;
$$;

-- ---- 4. Trigger ---------------------------------------------------------
drop trigger if exists trg_award_loyalty_points on public.sales;
create trigger trg_award_loyalty_points
  before insert or update of status on public.sales
  for each row
  execute function public._award_loyalty_points();

-- End of Round 68d.
