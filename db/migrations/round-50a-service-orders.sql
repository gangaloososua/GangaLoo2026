-- round-50a-service-orders.sql
-- ---------------------------------------------------------------------------
-- "Service orders" (personal-shopper / encargos): GangaLoo buys an item from
-- ANOTHER store (Amazon / Temu / Shein / AliExpress / ...) on a client's
-- behalf, then notifies the client to choose store pickup or home delivery.
-- These are a SERVICE, separate from your own product/inventory orders.
--
-- All money is stored in CENTS, same as the rest of the live DB (RD$200 = 20000).
--
-- The PUBLIC client link never touches this table directly. It can only call
-- two locked-down functions (read one order by its unguessable id, and submit
-- a pickup/delivery choice). Client phone numbers and addresses are NOT exposed
-- on the public API.
-- ---------------------------------------------------------------------------

create table if not exists public.service_orders (
  id                    uuid primary key default gen_random_uuid(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  -- who
  client_name           text not null,
  client_phone          text not null,

  -- what / where it came from
  platform              text not null default 'amazon',
  source_ref            text,                                  -- the other store's order ref (e.g. "2888")
  items                 jsonb not null default '[]'::jsonb,    -- [{ "name":"...", "qty":1, "price_cents":0 }]
  description           text,                                  -- used instead of items when not itemizing
  amount_cents          integer not null default 0,            -- manual subtotal, used only when items is empty

  -- money (cents)
  source_shipping_cents integer not null default 0,
  delivery_fee_cents    integer not null default 20000,        -- charged ONLY if the client picks delivery
  gangaloo_fee_cents    integer not null default 0,            -- your service fee
  financing_cents       integer not null default 0,            -- surcharge for a payment plan
  payments              jsonb not null default '[]'::jsonb,    -- [{ "kind":"deposit", "amount_cents":0, "ts":<ms>, "note":"" }]

  -- lifecycle
  stage                 text not null default 'invoice',

  -- the client's fulfilment choice
  fulfilment            text,                                  -- null | 'pickup' | 'delivery'
  delivery_date         date,
  delivery_address      text,
  delivery_note         text,
  delivery_lat          double precision,
  delivery_lng          double precision,

  -- bookkeeping
  timeline              jsonb not null default '[]'::jsonb,    -- [{ "label":"...", "ts":<ms> }]
  internal_notes        text,
  created_by            uuid,                                  -- staff profile id (optional)
  source_sale_id        uuid,                                  -- optional link to a main-admin "service" sale (wired later)

  constraint service_orders_stage_chk
    check (stage in ('invoice','ordered','arrived','notified','responded','ready','completed')),
  constraint service_orders_platform_chk
    check (platform in ('amazon','temu','shein','aliexpress','other')),
  constraint service_orders_fulfilment_chk
    check (fulfilment is null or fulfilment in ('pickup','delivery'))
);

create index if not exists service_orders_stage_idx   on public.service_orders (stage);
create index if not exists service_orders_created_idx on public.service_orders (created_at desc);
create index if not exists service_orders_phone_idx   on public.service_orders (client_phone);

-- keep updated_at fresh on every change
create or replace function public.tg_service_orders_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists service_orders_touch on public.service_orders;
create trigger service_orders_touch
  before update on public.service_orders
  for each row execute function public.tg_service_orders_touch();

-- ---------------------------------------------------------------------------
-- Totals: the single source of truth for the math, so the admin screen, the
-- client page, and any charge can never disagree.
-- ---------------------------------------------------------------------------
create or replace function public.service_order_totals(p_id uuid)
returns jsonb
language plpgsql
stable
as $$
declare
  o public.service_orders%rowtype;
  subtotal        bigint;
  paid            bigint;
  delivery_charge bigint;
  total           bigint;
begin
  select * into o from public.service_orders where id = p_id;
  if not found then
    return null;
  end if;

  if jsonb_array_length(o.items) > 0 then
    select coalesce(sum( coalesce((it->>'qty')::numeric,0) * coalesce((it->>'price_cents')::numeric,0) ), 0)::bigint
      into subtotal
      from jsonb_array_elements(o.items) it;
  else
    subtotal := o.amount_cents;
  end if;

  select coalesce(sum( coalesce((p->>'amount_cents')::numeric,0) ), 0)::bigint
    into paid
    from jsonb_array_elements(o.payments) p;

  delivery_charge := case when o.fulfilment = 'delivery' then o.delivery_fee_cents else 0 end;
  total := subtotal + o.source_shipping_cents + o.gangaloo_fee_cents + o.financing_cents + delivery_charge;

  return jsonb_build_object(
    'subtotal_cents',        subtotal,
    'source_shipping_cents', o.source_shipping_cents,
    'gangaloo_fee_cents',    o.gangaloo_fee_cents,
    'financing_cents',       o.financing_cents,
    'delivery_fee_cents',    o.delivery_fee_cents,
    'delivery_charge_cents', delivery_charge,
    'paid_cents',            paid,
    'total_cents',           total,
    'balance_cents',         greatest(0, total - paid)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- PUBLIC read: returns only what the client needs to see on their link.
-- (No phone, no internal notes, no individual payment rows.)
-- ---------------------------------------------------------------------------
create or replace function public.get_service_order_public(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  o public.service_orders%rowtype;
begin
  select * into o from public.service_orders where id = p_id;
  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'id',               o.id,
    'client_name',      o.client_name,
    'platform',         o.platform,
    'source_ref',       o.source_ref,
    'items',            o.items,
    'description',      o.description,
    'stage',            o.stage,
    'fulfilment',       o.fulfilment,
    'delivery_date',    o.delivery_date,
    'delivery_address', o.delivery_address,
    'delivery_fee_cents', o.delivery_fee_cents,
    'totals',           public.service_order_totals(o.id)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- PUBLIC submit: the client chooses pickup or delivery. Guarded so it can only
-- be used once, and only while the order is arrived/notified.
-- ---------------------------------------------------------------------------
create or replace function public.submit_service_order_response(
  p_id               uuid,
  p_fulfilment       text,
  p_delivery_date    date              default null,
  p_delivery_address text              default null,
  p_delivery_note    text              default null,
  p_lat              double precision  default null,
  p_lng              double precision  default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  o     public.service_orders%rowtype;
  label text;
begin
  if p_fulfilment not in ('pickup','delivery') then
    raise exception 'invalid fulfilment';
  end if;

  select * into o from public.service_orders where id = p_id for update;
  if not found then
    raise exception 'order not found';
  end if;

  -- can only respond once, and only after it has arrived
  if o.fulfilment is not null or o.stage not in ('arrived','notified') then
    raise exception 'order not open for response';
  end if;

  if p_fulfilment = 'delivery' then
    if p_delivery_date is null or coalesce(btrim(p_delivery_address),'') = '' then
      raise exception 'delivery requires a date and address';
    end if;
    label := 'Cliente eligió: entrega a domicilio';
  else
    label := 'Cliente eligió: recoger en tienda';
  end if;

  update public.service_orders
     set fulfilment       = p_fulfilment,
         delivery_date    = case when p_fulfilment = 'delivery' then p_delivery_date    else null end,
         delivery_address = case when p_fulfilment = 'delivery' then p_delivery_address else null end,
         delivery_note    = case when p_fulfilment = 'delivery' then p_delivery_note    else null end,
         delivery_lat     = case when p_fulfilment = 'delivery' then p_lat              else null end,
         delivery_lng     = case when p_fulfilment = 'delivery' then p_lng              else null end,
         stage            = 'responded',
         timeline         = o.timeline || jsonb_build_array(
                              jsonb_build_object('label', label, 'ts', (extract(epoch from now()) * 1000)::bigint)
                            )
   where id = p_id;

  return public.get_service_order_public(p_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Security: lock the table, expose only the two public functions.
-- The admin app reaches the table through the service-role client
-- (createAdminClient), which bypasses RLS.
-- ---------------------------------------------------------------------------
alter table public.service_orders enable row level security;
revoke all on table public.service_orders from anon, authenticated;

revoke all on function public.service_order_totals(uuid) from public;
revoke all on function public.get_service_order_public(uuid) from public;
revoke all on function public.submit_service_order_response(uuid, text, date, text, text, double precision, double precision) from public;

grant execute on function public.get_service_order_public(uuid) to anon, authenticated;
grant execute on function public.submit_service_order_response(uuid, text, date, text, text, double precision, double precision) to anon, authenticated;

-- done.
