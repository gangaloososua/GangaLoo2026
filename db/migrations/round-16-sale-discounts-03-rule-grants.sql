-- Round 16.3 — discount_rules write grants
--
-- Spec: docs/round-16-sale-discounts.md
--
-- v1 admin UI writes directly to discount_rules from server actions
-- (not via RPC). The action layer's requireRole(['owner','admin'])
-- is the security boundary; this grant just opens the door so the
-- SSR-authenticated client has the privileges to actually execute
-- the INSERT/UPDATE/DELETE.
--
-- sale_discount_applications stays SELECT-only at this layer —
-- audit rows are written only by SECURITY DEFINER functions (the
-- resolver and the future create_*_order RPCs).

GRANT INSERT, UPDATE, DELETE ON public.discount_rules TO authenticated;
