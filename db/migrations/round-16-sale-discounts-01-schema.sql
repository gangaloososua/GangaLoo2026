-- Round 16.1 — Sale-discount auto-application: schema
--
-- Spec: docs/round-16-sale-discounts.md sections 4.1, 4.2, 4.3
--
-- Adds:
--   - public.discount_rule_kind enum (5 values)
--   - public.discount_rules table (polymorphic via CHECK constraint)
--   - public.sale_discount_applications audit table
--
-- No changes to existing tables. sale_items.discount_cents and
-- sales.discount_cents retain their current meaning as the final
-- after-rules amount; audit table is the source of truth for which
-- rules contributed.

BEGIN;

-- ============================================================
-- 1. Enum
-- ============================================================

CREATE TYPE public.discount_rule_kind AS ENUM (
  'bulk',
  'club_tier',
  'promotion',
  'customer_override',
  'logistics_surcharge'
);

-- ============================================================
-- 2. discount_rules
-- ============================================================

CREATE TABLE public.discount_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind public.discount_rule_kind NOT NULL,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,

  -- Time window (optional; promotion uses it; nulls = open-ended)
  starts_at timestamptz,
  ends_at timestamptz,

  -- Scope filters (any combination, depending on kind)
  scope_product_id uuid REFERENCES public.products(id),
  scope_category_id uuid REFERENCES public.categories(id),
  scope_warehouse_id uuid REFERENCES public.warehouses(id),
  scope_club_tier public.club_tier,
  scope_customer_id uuid REFERENCES public.profiles(id),
  scope_source_warehouse_id uuid REFERENCES public.warehouses(id),
  scope_fulfillment_warehouse_id uuid REFERENCES public.warehouses(id),

  -- Trigger / amount fields
  threshold_qty numeric,
  delta_percent numeric,                 -- 5.0 = 5% off
  delta_cents int,                       -- positive only (surcharges)

  priority int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),

  -- Required-fields shape check per kind. Each kind has its own
  -- minimum set of NOT NULL fields; the CHECK enforces them.
  CONSTRAINT discount_rules_shape_check CHECK (
    (kind = 'bulk'
      AND threshold_qty IS NOT NULL
      AND delta_percent IS NOT NULL
      AND (scope_product_id IS NOT NULL OR scope_category_id IS NOT NULL))
    OR (kind = 'club_tier'
      AND scope_club_tier IS NOT NULL
      AND delta_percent IS NOT NULL)
    OR (kind = 'promotion'
      AND delta_percent IS NOT NULL)
    OR (kind = 'customer_override'
      AND scope_customer_id IS NOT NULL
      AND delta_percent IS NOT NULL)
    OR (kind = 'logistics_surcharge'
      AND delta_cents IS NOT NULL
      AND delta_cents > 0)
  ),

  -- Sanity: if both date bounds set, start must be before end
  CONSTRAINT discount_rules_date_order_check CHECK (
    starts_at IS NULL
    OR ends_at IS NULL
    OR starts_at <= ends_at
  )
);

CREATE INDEX discount_rules_active_idx
  ON public.discount_rules(kind, is_active)
  WHERE is_active = true;

CREATE INDEX discount_rules_scope_product_idx
  ON public.discount_rules(scope_product_id)
  WHERE scope_product_id IS NOT NULL AND is_active = true;

CREATE INDEX discount_rules_scope_customer_idx
  ON public.discount_rules(scope_customer_id)
  WHERE scope_customer_id IS NOT NULL AND is_active = true;

CREATE INDEX discount_rules_scope_category_idx
  ON public.discount_rules(scope_category_id)
  WHERE scope_category_id IS NOT NULL AND is_active = true;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.discount_rules_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER discount_rules_updated_at_trg
  BEFORE UPDATE ON public.discount_rules
  FOR EACH ROW EXECUTE FUNCTION public.discount_rules_set_updated_at();

-- ============================================================
-- 3. sale_discount_applications (audit)
-- ============================================================

CREATE TABLE public.sale_discount_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid REFERENCES public.sales(id) ON DELETE CASCADE,
  sale_item_id uuid REFERENCES public.sale_items(id) ON DELETE CASCADE,
  discount_rule_id uuid REFERENCES public.discount_rules(id),
  is_manual boolean NOT NULL DEFAULT false,
  rule_kind public.discount_rule_kind,
  percent numeric,
  amount_cents int NOT NULL,             -- negative for discount, positive for surcharge
  cap_hit boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),

  -- Either line-level OR order-level (XOR)
  CONSTRAINT sda_target_check CHECK (
    (sale_item_id IS NOT NULL AND sale_id IS NULL)
    OR (sale_item_id IS NULL AND sale_id IS NOT NULL)
  ),
  -- Manual entries have no rule; rule-based entries are not manual
  CONSTRAINT sda_source_check CHECK (
    (is_manual = true AND discount_rule_id IS NULL)
    OR (is_manual = false AND discount_rule_id IS NOT NULL)
  )
);

CREATE INDEX sda_sale_idx
  ON public.sale_discount_applications(sale_id)
  WHERE sale_id IS NOT NULL;

CREATE INDEX sda_sale_item_idx
  ON public.sale_discount_applications(sale_item_id)
  WHERE sale_item_id IS NOT NULL;

CREATE INDEX sda_rule_idx
  ON public.sale_discount_applications(discount_rule_id)
  WHERE discount_rule_id IS NOT NULL;

-- ============================================================
-- 4. Permissions
-- ============================================================

-- Both tables follow the project convention: owner+admin manage
-- via server actions; the RBAC gating is at the action layer
-- (requireRole(['owner','admin'])). The tables themselves are
-- accessible to authenticated users for read; writes go through
-- SECURITY DEFINER functions in later sub-rounds.

GRANT SELECT ON public.discount_rules TO authenticated;
GRANT SELECT ON public.sale_discount_applications TO authenticated;

COMMIT;
