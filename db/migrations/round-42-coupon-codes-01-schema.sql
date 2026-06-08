-- round-42-coupon-codes-01-schema.sql
-- Coupon codes as a new discount_rules kind ('coupon').
-- (Supersedes the first draft: adds STORE + CHANNEL scoping.)
--
-- Decisions agreed with the owner (session 2026-06-07):
--   * New rule kind 'coupon', lives in the existing discount_rules table.
--   * Each coupon has a CODE the customer/seller types at checkout.
--   * Admin picks EITHER a percentage off (delta_percent, 0<x<=100) OR a fixed
--     RD$ amount off (delta_cents, >0) per coupon -- exactly one, both positive.
--     (delta_cents is REUSED from logistics_surcharge as a positive magnitude;
--      for a coupon the application path SUBTRACTS it from the order total.)
--   * Applies to the WHOLE ORDER TOTAL (order-level, its own code path --
--     NOT the per-line resolve_line_discounts function).
--   * SCOPED two ways, BOTH OPTIONAL (blank = applies to all):
--       - STORE   : scope_source_warehouse_id  (matched vs sales.source_warehouse_id)
--       - CHANNEL : scope_channel (type sale_source: 'pos' / 'online')
--                   (matched vs sales.source)
--   * Validity window uses the existing starts_at / ends_at columns.
--   * Usage limit: max_redemptions added now but DORMANT (NULL = unlimited).
--     Counted later from sale_discount_applications by discount_rule_id; no
--     future migration needed to switch it on.
--   * Code uniqueness is per (code, store, channel) among ACTIVE coupons, so the
--     SAME code can exist at different stores / channels, and a retired coupon
--     does not block reusing its code. NULL store/channel ("all") collapse to a
--     sentinel so two "all/all" coupons with the same code still collide.
--
-- IMPORTANT: TWO parts. Adding an enum value must COMMIT before the value can be
-- used in a CHECK, so run Part 1 alone, then run Part 2.

-- =====================================================================
-- PART 1 -- add the enum value (run this ALONE, then run Part 2)
-- =====================================================================
ALTER TYPE public.discount_rule_kind ADD VALUE IF NOT EXISTS 'coupon';


-- =====================================================================
-- PART 2 -- columns, shape check, guards, unique code index
-- =====================================================================
BEGIN;

-- New columns (idempotent). scope_channel reuses the existing sale_source enum.
ALTER TABLE public.discount_rules
  ADD COLUMN IF NOT EXISTS code            text,
  ADD COLUMN IF NOT EXISTS max_redemptions integer,
  ADD COLUMN IF NOT EXISTS scope_channel   public.sale_source;

-- Rebuild the shape check to add the 'coupon' branch.
-- (The five existing branches are unchanged; coupon branch appended.)
-- Store and channel are intentionally NOT required here -- both are optional.
ALTER TABLE public.discount_rules
  DROP CONSTRAINT IF EXISTS discount_rules_shape_check;

ALTER TABLE public.discount_rules
  ADD CONSTRAINT discount_rules_shape_check CHECK (
       (kind = 'bulk'::discount_rule_kind
          AND threshold_qty   IS NOT NULL AND delta_percent IS NOT NULL)
    OR (kind = 'club_tier'::discount_rule_kind
          AND scope_club_tier IS NOT NULL AND delta_percent IS NOT NULL)
    OR (kind = 'promotion'::discount_rule_kind
          AND delta_percent   IS NOT NULL)
    OR (kind = 'customer_override'::discount_rule_kind
          AND scope_customer_id IS NOT NULL AND delta_percent IS NOT NULL)
    OR (kind = 'logistics_surcharge'::discount_rule_kind
          AND delta_cents     IS NOT NULL AND delta_cents > 0)
    OR (kind = 'coupon'::discount_rule_kind
          AND code IS NOT NULL
          AND (
               (delta_percent IS NOT NULL AND delta_cents IS NULL
                  AND delta_percent > 0 AND delta_percent <= 100)
            OR (delta_cents IS NOT NULL AND delta_percent IS NULL
                  AND delta_cents > 0)
          ))
  );

-- max_redemptions, if ever set, must be a positive count.
ALTER TABLE public.discount_rules
  DROP CONSTRAINT IF EXISTS discount_rules_max_redemptions_chk;
ALTER TABLE public.discount_rules
  ADD CONSTRAINT discount_rules_max_redemptions_chk
  CHECK (max_redemptions IS NULL OR max_redemptions > 0);

-- One ACTIVE coupon per (code, store, channel), case-insensitive.
-- NULL store/channel ("all") map to a sentinel so they compare as equal.
CREATE UNIQUE INDEX IF NOT EXISTS discount_rules_coupon_code_uniq
  ON public.discount_rules (
       lower(code),
       COALESCE(scope_source_warehouse_id::text, '*all*'),
       COALESCE(scope_channel::text,             '*all*')
  )
  WHERE kind = 'coupon'::discount_rule_kind AND is_active = true;

COMMIT;
