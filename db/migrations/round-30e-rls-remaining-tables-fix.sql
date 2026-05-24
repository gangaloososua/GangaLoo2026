-- round-30e-rls-remaining-tables-fix.sql
-- Tightens round-30d. The previous policy used "role is not 'customer'", which
-- let through any logged-in session whose role could NOT be resolved. This
-- version requires the caller to actually have a profile whose role is OTHER
-- than 'customer' (a real staff member): allows every staff role, blocks
-- customers, and blocks any unidentified / profile-less session.
--
-- ROLLBACK: for any table T, alter table public.T disable row level security;

do $$
declare
  t text;
  tbls text[] := array[
    '_xfer_out','account_categories','audit_log','categories','discount_rules',
    'monthly_goals','pos_locations','pos_shelf_assignments','product_categories',
    'product_images','product_warehouse_settings','sale_discount_applications',
    'stock_transfer_items','stock_transfers','warehouse_categories','warehouse_offers'
  ];
  cond text := 'exists (select 1 from public.profiles p '
            || 'where p.auth_user_id = auth.uid() '
            || 'and p.role <> ''customer''::user_role)';
begin
  foreach t in array tbls loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_staff_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (%s) with check (%s)',
      t || '_staff_all', t, cond, cond
    );
  end loop;
end $$;