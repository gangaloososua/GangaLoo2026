-- round-85c: RLS policy for discount_rule_bundle_items (mirrors discount_rules_staff_all)
create policy discount_rule_bundle_items_staff_all
  on public.discount_rule_bundle_items
  for all
  to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.auth_user_id = auth.uid() and p.role <> 'customer'::user_role
  ))
  with check (exists (
    select 1 from public.profiles p
    where p.auth_user_id = auth.uid() and p.role <> 'customer'::user_role
  ));
