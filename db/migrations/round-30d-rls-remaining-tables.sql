-- round-30d-rls-remaining-tables.sql
-- Security sweep, final pass. These 16 public tables had RLS OFF while the
-- 'authenticated' role held full read/insert/update/delete grants. Because
-- 'authenticated' now includes CUSTOMERS, a logged-in customer could read or
-- even modify/delete these rows directly via the database (prices, offers,
-- images, categories, stock transfers, business goals, audit log, etc.).
--
-- Fix: enable RLS on each and add ONE policy that blocks customers while
-- leaving every STAFF role's access exactly as it is today.
-- NOTE: superseded by round-30e (the deny-list here was too loose for tokens
-- with no resolvable role; 30e anchors on a positive staff-profile check).
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
begin
  foreach t in array tbls loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_staff_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated '
      || 'using (auth_role() is distinct from %L) '
      || 'with check (auth_role() is distinct from %L)',
      t || '_staff_all', t, 'customer', 'customer'
    );
  end loop;
end $$;