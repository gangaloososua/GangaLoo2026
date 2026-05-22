-- Round 25i - Set Account Opening (Ajustar saldo / Recalcular)
--
-- Owner-gated WRITE function for the account-statement modal. Sets an account's
-- starting saldo (initial_balance_cents) and re-syncs the stored balance_cents
-- to opening + sum(movements) - the equivalent of the old system's "Recalcular".
-- This is the one deliberate exception to the rule that nothing edits
-- initial_balance_cents / balance_cents directly; it's the reconcile feature
-- the owner asked for to absorb migration drift.
--
-- SECURITY DEFINER + an explicit owner check: only the business owner may run
-- it. Money in CENTS (bigint). The is_initial opening row (if any) is excluded
-- from the movements sum since the opening is carried in initial_balance_cents.

create or replace function public.set_account_opening(
  p_account_id uuid,
  p_opening_cents bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $sao$
declare
  v_is_owner boolean;
  v_movements_sum bigint;
  v_new_balance bigint;
begin
  -- Owner gate: only the business owner may adjust an account's saldo.
  select exists (
    select 1 from profiles
    where auth_user_id = auth.uid() and role = 'owner'
  ) into v_is_owner;

  if not coalesce(v_is_owner, false) then
    raise exception 'not authorized';
  end if;

  -- Sum of all real movements (the is_initial opening row, if any, excluded).
  select coalesce(sum(amount_cents), 0) into v_movements_sum
  from transactions
  where money_account_id = p_account_id
    and coalesce(is_initial, false) = false;

  v_new_balance := p_opening_cents + v_movements_sum;

  update money_accounts
  set initial_balance_cents = p_opening_cents,
      balance_cents = v_new_balance
  where id = p_account_id;

  if not found then
    raise exception 'account not found';
  end if;

  return jsonb_build_object(
    'account_id', p_account_id,
    'opening_cents', p_opening_cents,
    'movements_sum_cents', v_movements_sum,
    'balance_cents', v_new_balance
  );
end; $sao$;
