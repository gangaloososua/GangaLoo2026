-- round-36b-requested-items-rls.sql
-- Fixes the owner Transfers screen showing "0 products" for parked requests.
--
-- stock_transfer_requested_items had RLS enabled but no policy, so the screen
-- (which reads as the logged-in user, not via the SECURITY DEFINER functions)
-- got back zero rows. Mirror the exact staff rule used by stock_transfers and
-- stock_transfer_items: any signed-in non-customer can read/write.
--
-- Also (idempotently) ensure the product_id -> products foreign key exists so
-- the screen can read product names alongside each requested line. This was
-- added in a one-off statement during testing; included here so the migration
-- file fully reproduces the state.

begin;

alter table public.stock_transfer_requested_items
  add constraint stock_transfer_requested_items_product_id_fkey
  foreign key (product_id) references public.products(id);

create policy stock_transfer_requested_items_staff_all
  on public.stock_transfer_requested_items
  for all
  to authenticated
  using (
    exists (
      select 1 from profiles p
      where p.auth_user_id = auth.uid()
        and p.role <> 'customer'::user_role
    )
  )
  with check (
    exists (
      select 1 from profiles p
      where p.auth_user_id = auth.uid()
        and p.role <> 'customer'::user_role
    )
  );

notify pgrst, 'reload schema';

commit;
