-- round-26e-account-transfers.sql
-- Move money between two money accounts (a "Transferencia").
--
-- A transfer is value-neutral: it does not earn or spend, it just moves money
-- from one account to another. We record it as one account_transfers row plus
-- TWO ledger postings through the existing post_transaction engine:
--   - source account:      -amount   (money out)
--   - destination account:  +amount   (money in)
-- Both legs use the existing 'Account Transfers' category (type = asset), so
-- they stay out of income/expense reports. The link between the two legs lives
-- on the account_transfers row (out_transaction_id / in_transaction_id); we do
-- NOT use transactions.source_transfer_id because that FK points at
-- stock_transfers. (The legs therefore post as is_manual = true, which is
-- correct — they're manually-entered transfers, identifiable by category.)
--
-- Owner/admin only (post_transaction enforces this again on each leg).
-- Source is allowed to go negative (no balance guard), matching post_transaction.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create table if not exists public.account_transfers (
  id                  uuid primary key default gen_random_uuid(),
  from_account_id     uuid not null references public.money_accounts(id),
  to_account_id       uuid not null references public.money_accounts(id),
  amount_cents        bigint not null check (amount_cents > 0),
  scope               account_scope not null,
  occurred_at         timestamptz not null default now(),
  description         text,
  out_transaction_id  uuid references public.transactions(id),
  in_transaction_id   uuid references public.transactions(id),
  created_by          uuid references public.profiles(id),
  created_at          timestamptz not null default now(),
  check (from_account_id <> to_account_id)
);

create index if not exists acct_xfer_from_idx on public.account_transfers (from_account_id);
create index if not exists acct_xfer_to_idx   on public.account_transfers (to_account_id);
create index if not exists acct_xfer_when_idx on public.account_transfers (occurred_at);

alter table public.account_transfers enable row level security;

drop policy if exists acct_xfer_owner_admin_all on public.account_transfers;
create policy acct_xfer_owner_admin_all
  on public.account_transfers
  for all
  using (
    exists (select 1 from public.profiles me
            where me.auth_user_id = auth.uid() and me.role in ('owner','admin'))
  )
  with check (
    exists (select 1 from public.profiles me
            where me.auth_user_id = auth.uid() and me.role in ('owner','admin'))
  );

-- ---------------------------------------------------------------------------
-- transfer_between_accounts
-- ---------------------------------------------------------------------------
-- The 'Account Transfers' category id is fixed (asset type), seeded already:
--   e9e42787-320e-40f4-98a8-008aa9379ef8

create or replace function public.transfer_between_accounts(
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_amount_cents bigint,
  p_scope account_scope,
  p_occurred_at timestamptz default now(),
  p_description text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $xfer$
declare
  v_me        uuid;
  v_role      user_role;
  v_cat       uuid := 'e9e42787-320e-40f4-98a8-008aa9379ef8';
  v_transfer  uuid;
  v_from_name text;
  v_to_name   text;
  v_desc      text;
  v_out       jsonb;
  v_in        jsonb;
  v_when      timestamptz := coalesce(p_occurred_at, now());
begin
  select id, role into v_me, v_role
  from profiles where auth_user_id = auth.uid();
  if v_role is null or v_role not in ('owner','admin') then
    raise exception 'permission denied: only owner/admin can transfer money'
      using errcode = '42501';
  end if;

  if p_from_account_id is null or p_to_account_id is null then
    raise exception 'both accounts are required' using errcode = '22023';
  end if;
  if p_from_account_id = p_to_account_id then
    raise exception 'source and destination must be different' using errcode = '22023';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'amount must be greater than zero' using errcode = '22023';
  end if;
  if p_scope is null then
    raise exception 'scope is required' using errcode = '22023';
  end if;

  select name into v_from_name from money_accounts where id = p_from_account_id;
  if v_from_name is null then raise exception 'source account not found' using errcode = '22023'; end if;
  select name into v_to_name from money_accounts where id = p_to_account_id;
  if v_to_name is null then raise exception 'destination account not found' using errcode = '22023'; end if;

  v_desc := coalesce(nullif(btrim(p_description), ''),
                     format('Transferencia: %s → %s', v_from_name, v_to_name));

  -- Create the transfer header first so both legs can link to it.
  insert into account_transfers
    (from_account_id, to_account_id, amount_cents, scope, occurred_at, description, created_by)
  values
    (p_from_account_id, p_to_account_id, p_amount_cents, p_scope, v_when, v_desc, v_me)
  returning id into v_transfer;

  -- Leg 1: money OUT of the source (negative).
  v_out := post_transaction(jsonb_build_object(
    'money_account_id', p_from_account_id,
    'category_id', v_cat,
    'amount_cents', -p_amount_cents,
    'scope', p_scope,
    'occurred_at', v_when,
    'description', v_desc
  ));

  -- Leg 2: money IN to the destination (positive).
  v_in := post_transaction(jsonb_build_object(
    'money_account_id', p_to_account_id,
    'category_id', v_cat,
    'amount_cents', p_amount_cents,
    'scope', p_scope,
    'occurred_at', v_when,
    'description', v_desc
  ));

  update account_transfers
     set out_transaction_id = (v_out->>'transaction_id')::uuid,
         in_transaction_id  = (v_in->>'transaction_id')::uuid
   where id = v_transfer;

  return (select to_jsonb(t) from account_transfers t where t.id = v_transfer);
end;
$xfer$;

grant execute on function public.transfer_between_accounts(uuid, uuid, bigint, account_scope, timestamptz, text) to authenticated;
