-- round-25p-create-customer-quick.sql
-- Quick-add a customer from the POS. SECURITY DEFINER so a seller/distributor
-- (not just owner/admin) can create one mid-order despite RLS on profiles -
-- same pattern as confirm_pos_sale. Still gated to staff roles. Creates a
-- minimal customer (name + optional phone/email) with sensible defaults; the
-- full People form handles everything else later. Returns the new customer as
-- jsonb so the POS can select them immediately.
-- Verified reversibly: creates a customer, returns its row; test row deleted.

create or replace function public.create_customer_quick(
  p_full_name text,
  p_phone text default null,
  p_email text default null
) returns jsonb language plpgsql security definer set search_path to 'public' as $ccq$
declare
  v_role user_role;
  v_id uuid;
begin
  select role into v_role from profiles where auth_user_id = auth.uid();
  if v_role is null or v_role not in ('owner','admin','seller','distributor') then
    raise exception 'permission denied: only staff can add customers' using errcode = '42501';
  end if;
  if coalesce(btrim(p_full_name), '') = '' then
    raise exception 'name is required' using errcode = '22023';
  end if;

  insert into profiles (
    full_name, phone, email, role, is_active,
    club_tier, bonus_points, is_club_member, credit_limit_cents
  ) values (
    btrim(p_full_name),
    nullif(btrim(coalesce(p_phone, '')), ''),
    nullif(btrim(coalesce(p_email, '')), ''),
    'customer', true,
    'none', 0, false, 0
  ) returning id into v_id;

  return (
    select jsonb_build_object(
      'id', p.id, 'full_name', p.full_name,
      'email', p.email, 'phone', p.phone, 'club_tier', p.club_tier
    ) from profiles p where p.id = v_id
  );
end; $ccq$;
