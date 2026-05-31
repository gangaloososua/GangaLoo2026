-- round-46d-cleanup-flat-pct.sql
-- Remove the obsolete flat-% Club leftovers from the earlier (wrong) model.
-- The live model is per-product club prices (round-46b/46c), so these are unused:
--   * function get_customer_club_pct(uuid)   -- flat % keyed on is_club_member
--   * function get_my_customer_club_pct()    -- its "my" wrapper (round-45b)
--   * store_config key 'club_member_pct'     -- the stored flat % (15)
--
-- KEEP (do NOT touch): get_customer_tier (loyalty), get_my_is_club_member (used by
-- the storefront grid), get_storefront_quote / place_storefront_order (current
-- checkout, which read is_club_member directly).
--
-- SELF-PROTECTING: the guard below scans every function in the database and
-- ABORTS the whole script if anything still references get_customer_club_pct.
-- If it aborts, nothing is deleted — safe to send the message back to Claude.

-- Guard: refuse to proceed if any other function still calls the old helper.
do $$
declare
  v_count int;
begin
  select count(*) into v_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind = 'f'
    and p.proname not in ('get_customer_club_pct', 'get_my_customer_club_pct')
    and pg_get_functiondef(p.oid) ilike '%get_customer_club_pct%';

  if v_count > 0 then
    raise exception
      'Abort: % other function(s) still reference get_customer_club_pct; not safe to drop. Nothing was deleted.',
      v_count;
  end if;
end $$;

-- Safe to remove. Drop the wrapper first, then the helper, then the setting.
drop function if exists public.get_my_customer_club_pct();
drop function if exists public.get_customer_club_pct(uuid);

delete from store_config where key = 'club_member_pct';
