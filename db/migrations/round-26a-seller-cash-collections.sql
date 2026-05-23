-- round-26a-seller-cash-collections.sql
-- Seller cash collections — Option 1 ("simple tracking note").
--
-- A seller in the field collects cash from a customer on one of THEIR unpaid
-- orders and logs it here. While the entry is 'held' it touches NOTHING in the
-- books — it is purely a record that this seller is holding the business's
-- cash. When the owner/admin marks it handed in, the same call records the
-- real cash payment on the order via the existing receive_payment engine
-- (so the money books the proven way and the order status updates) and flips
-- the entry to 'handed_in'.
--
-- Conventions copied from create_customer_quick: SECURITY DEFINER,
-- search_path = public, role read from profiles via auth.uid(), 42501 on
-- permission denial, jsonb return.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create table if not exists public.seller_cash_collections (
  id                          uuid primary key default gen_random_uuid(),
  sale_id                     uuid not null references public.sales(id),
  -- The seller holding the cash = the seller on the order.
  seller_id                   uuid not null references public.profiles(id),
  amount_cents                bigint not null check (amount_cents > 0),
  note                        text,
  status                      text not null default 'held'
                                check (status in ('held','handed_in','void')),
  collected_at                timestamptz not null default now(),
  -- Who created the entry (usually the seller; owner/admin may log on behalf).
  logged_by                   uuid references public.profiles(id),
  -- Hand-in bookkeeping (set when reconciled by owner/admin).
  handed_in_at                timestamptz,
  handed_in_by                uuid references public.profiles(id),
  handed_in_money_account_id  uuid references public.money_accounts(id),
  created_at                  timestamptz not null default now()
);

create index if not exists scc_seller_idx on public.seller_cash_collections (seller_id);
create index if not exists scc_sale_idx   on public.seller_cash_collections (sale_id);
create index if not exists scc_status_idx on public.seller_cash_collections (status);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- Writes happen through the SECURITY DEFINER functions below (which bypass
-- RLS). These policies govern direct SELECTs from the app: owner/admin see
-- everything; a seller/distributor sees only their own held/handed rows.

alter table public.seller_cash_collections enable row level security;

drop policy if exists scc_select_staff_or_own on public.seller_cash_collections;
create policy scc_select_staff_or_own
  on public.seller_cash_collections
  for select
  using (
    exists (
      select 1 from public.profiles me
      where me.auth_user_id = auth.uid() and me.role in ('owner','admin')
    )
    or seller_id = (select id from public.profiles where auth_user_id = auth.uid())
  );

drop policy if exists scc_owner_admin_all on public.seller_cash_collections;
create policy scc_owner_admin_all
  on public.seller_cash_collections
  for all
  using (
    exists (
      select 1 from public.profiles me
      where me.auth_user_id = auth.uid() and me.role in ('owner','admin')
    )
  )
  with check (
    exists (
      select 1 from public.profiles me
      where me.auth_user_id = auth.uid() and me.role in ('owner','admin')
    )
  );

-- ---------------------------------------------------------------------------
-- log_seller_cash_collection — seller-callable tracker. Touches NOTHING else.
-- ---------------------------------------------------------------------------

create or replace function public.log_seller_cash_collection(
  p_sale_id uuid,
  p_amount_cents bigint,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $scc_log$
declare
  v_me      uuid;
  v_role    user_role;
  v_sale    record;
  v_already bigint;
  v_avail   bigint;
  v_id      uuid;
begin
  select id, role into v_me, v_role
  from profiles where auth_user_id = auth.uid();

  if v_role is null or v_role not in ('owner','admin','seller','distributor') then
    raise exception 'permission denied: only staff can log collections'
      using errcode = '42501';
  end if;

  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'amount must be greater than zero' using errcode = '22023';
  end if;

  select id, seller_id, total_cents, paid_cents, status
    into v_sale
  from sales where id = p_sale_id;
  if not found then
    raise exception 'order not found' using errcode = '22023';
  end if;

  -- Sellers/distributors may only log against their OWN orders.
  if v_role in ('seller','distributor') and v_sale.seller_id is distinct from v_me then
    raise exception 'permission denied: not your order' using errcode = '42501';
  end if;

  -- Can't collect more than what's still uncovered on the order
  -- (order outstanding minus cash already logged-and-held against it).
  select coalesce(sum(amount_cents), 0) into v_already
  from seller_cash_collections
  where sale_id = p_sale_id and status = 'held';

  v_avail := v_sale.total_cents - v_sale.paid_cents - v_already;
  if v_avail < 0 then v_avail := 0; end if;

  if p_amount_cents > v_avail then
    raise exception 'amount exceeds the % cents still uncovered on this order', v_avail
      using errcode = '22023';
  end if;

  insert into seller_cash_collections
    (sale_id, seller_id, amount_cents, note, status, logged_by)
  values
    (p_sale_id, v_sale.seller_id, p_amount_cents,
     nullif(btrim(coalesce(p_note, '')), ''), 'held', v_me)
  returning id into v_id;

  return (select to_jsonb(c) from seller_cash_collections c where c.id = v_id);
end;
$scc_log$;

-- ---------------------------------------------------------------------------
-- hand_in_seller_cash — owner/admin only. Records the real payment AND
-- flips the entry to handed_in, in one call.
-- ---------------------------------------------------------------------------

create or replace function public.hand_in_seller_cash(
  p_collection_id uuid,
  p_money_account_id uuid,
  p_received_at timestamptz default now(),
  p_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $scc_handin$
declare
  v_me   uuid;
  v_role user_role;
  v_c    record;
begin
  select id, role into v_me, v_role
  from profiles where auth_user_id = auth.uid();

  if v_role is null or v_role not in ('owner','admin') then
    raise exception 'permission denied: only owner/admin can hand in cash'
      using errcode = '42501';
  end if;

  if p_money_account_id is null then
    raise exception 'a money account is required' using errcode = '22023';
  end if;

  select id, sale_id, amount_cents, status
    into v_c
  from seller_cash_collections where id = p_collection_id;
  if not found then
    raise exception 'collection not found' using errcode = '22023';
  end if;
  if v_c.status <> 'held' then
    raise exception 'this collection is already %', v_c.status using errcode = '22023';
  end if;

  -- Record the real cash payment on the order via the proven engine.
  perform public.receive_payment(
    p_money_account_id := p_money_account_id,
    p_method := 'cash',
    p_received_at := coalesce(p_received_at, now()),
    p_reference := p_reference,
    p_allocations := jsonb_build_array(
      jsonb_build_object('sale_id', v_c.sale_id, 'amount_cents', v_c.amount_cents)
    )
  );

  update seller_cash_collections
     set status = 'handed_in',
         handed_in_at = now(),
         handed_in_by = v_me,
         handed_in_money_account_id = p_money_account_id
   where id = p_collection_id;

  return (select to_jsonb(c) from seller_cash_collections c where c.id = p_collection_id);
end;
$scc_handin$;

-- ---------------------------------------------------------------------------
-- Grants — match the authenticated-execute convention of the other RPCs.
-- ---------------------------------------------------------------------------

grant execute on function public.log_seller_cash_collection(uuid, bigint, text) to authenticated;
grant execute on function public.hand_in_seller_cash(uuid, uuid, timestamptz, text) to authenticated;
