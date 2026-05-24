-- round-29a-customer-profile.sql
-- Customer accounts, step 1: safe profile creation/linking for self-signup.
--
-- upsert_customer_profile(name, phone): called right after a customer signs up.
--   * Acts ONLY on the calling user's own auth.uid() — cannot touch anyone else.
--   * Forces role='customer' on new profiles (no privilege escalation possible).
--   * If the phone already belongs to a *guest customer* profile we created at
--     checkout, links that profile to the new login (so history merges).
--   * If the phone belongs to staff (or another login), REFUSES — raises
--     'phone_in_use' rather than linking or duplicating.
--
-- get_my_customer_profile(): returns the caller's own profile as jsonb, or null.
--
-- Both SECURITY DEFINER but scoped strictly to the caller. Safe to re-run.

create or replace function public.upsert_customer_profile(
  p_name text,
  p_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_name text := nullif(trim(p_name), '');
  v_phone text := nullif(trim(p_phone), '');
  v_pid uuid;
  v_prole user_role;
  v_plinked uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if v_name is null then
    raise exception 'name is required' using errcode = '22023';
  end if;

  select email into v_email from auth.users where id = v_uid;

  -- Already linked to this login → just update details.
  select id into v_pid from profiles where auth_user_id = v_uid limit 1;
  if found then
    update profiles
       set full_name = v_name,
           email = coalesce(v_email, email),
           phone = coalesce(v_phone, phone),
           updated_at = now()
     where id = v_pid;
    return jsonb_build_object('ok', true, 'profile_id', v_pid, 'linked', true);
  end if;

  -- Phone already on file?
  if v_phone is not null then
    select id, role, auth_user_id
      into v_pid, v_prole, v_plinked
      from profiles where phone = v_phone limit 1;
    if found then
      -- Never attach to a non-customer, or to a profile owned by another login.
      if v_prole <> 'customer'
         or (v_plinked is not null and v_plinked <> v_uid) then
        raise exception 'phone_in_use' using errcode = '23505';
      end if;
      update profiles
         set auth_user_id = v_uid,
             full_name = v_name,
             email = coalesce(v_email, email),
             updated_at = now()
       where id = v_pid;
      return jsonb_build_object('ok', true, 'profile_id', v_pid, 'merged', true);
    end if;
  end if;

  -- Fresh customer profile.
  insert into profiles (auth_user_id, full_name, email, phone, role)
  values (v_uid, v_name, v_email, v_phone, 'customer')
  returning id into v_pid;
  return jsonb_build_object('ok', true, 'profile_id', v_pid, 'created', true);
end;
$$;

grant execute on function public.upsert_customer_profile(text, text) to authenticated;

create or replace function public.get_my_customer_profile()
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select case
    when auth.uid() is null then null
    else (
      select jsonb_build_object(
        'full_name', full_name,
        'email', email,
        'phone', phone,
        'role', role
      )
      from profiles
      where auth_user_id = auth.uid()
      limit 1
    )
  end;
$$;

grant execute on function public.get_my_customer_profile() to authenticated, anon;
