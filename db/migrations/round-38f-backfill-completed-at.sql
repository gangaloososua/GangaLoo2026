-- round-38f-backfill-completed-at.sql
-- Backfill completed_at on migrated 'complete' orders that never received a
-- completion date during the data import. Uses each order's received_at
-- (its arrival date) as the completion date -- the owner's chosen rule.
--
-- Scope is deliberately narrow:
--   * status = 'complete' AND completed_at IS NULL  -> only fills blanks
--   * leaves cancelled / lost orders untouched (they carry completed_at
--     with status <> 'complete' and must NOT be changed)
--   * leaves already-dated complete orders untouched
--   * received_at IS NOT NULL guard: all 182 targets were confirmed to have
--     an arrival date, so nothing gets blanked even if scope shifts later.
--
-- Idempotent: re-running changes nothing (completed_at is no longer null).

update public.purchase_orders
set    completed_at = received_at
where  status = 'complete'
  and  completed_at is null
  and  received_at is not null;
