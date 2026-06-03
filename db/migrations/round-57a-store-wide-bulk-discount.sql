-- round-57a-store-wide-bulk-discount.sql
-- Store-wide bulk discounts: a bulk rule with BOTH scope_product_id and
-- scope_category_id NULL now means "applies to every product" (still gated by
-- threshold_qty). Two DB changes, both already applied live; this file is the
-- repo record. Idempotent.
--
-- (1) resolve_line_discounts: the bulk match branch gains a third path —
--     both scopes null = matches any product. Mirrors lib/discount-rules-resolver.ts.
-- (2) discount_rules_shape_check: the bulk clause no longer requires a product
--     or category scope (threshold + percent still required). Other rule kinds
--     are unchanged.

-- ---------------------------------------------------------------------------
-- (1) Matching function (authority at create-sale time)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_line_discounts(p_product_id uuid, p_qty numeric, p_unit_price_cents integer, p_customer_id uuid, p_source_warehouse_id uuid, p_at timestamp with time zone DEFAULT now(), p_category_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_customer_tier public.club_tier;
  v_rules record;
  v_rule_ids uuid[] := ARRAY[]::uuid[];
  v_rule_kinds public.discount_rule_kind[] := ARRAY[]::public.discount_rule_kind[];
  v_rule_percents numeric[] := ARRAY[]::numeric[];
  v_running_factors numeric[] := ARRAY[]::numeric[];
  v_running_factor numeric := 1.0;
  v_cap_factor numeric := 0.70;
  v_cap_hit boolean := false;
  v_scale numeric := 1.0;
  v_idx int;
  v_marginal_factor numeric;
  v_marginal_cents int;
  v_prev_factor numeric;
  v_applied jsonb := '[]'::jsonb;
BEGIN
  SELECT club_tier INTO v_customer_tier
    FROM public.profiles
    WHERE id = p_customer_id;

  FOR v_rules IN
    SELECT id, kind, delta_percent
    FROM public.discount_rules
    WHERE is_active = true
      AND (
        (kind = 'customer_override'
         AND p_customer_id IS NOT NULL
         AND scope_customer_id = p_customer_id)
        OR
        (kind = 'club_tier'
         AND v_customer_tier IS NOT NULL
         AND v_customer_tier <> 'none'
         AND scope_club_tier = v_customer_tier)
        OR
        -- bulk: quantity threshold met AND scope matches this line's
        -- product OR its category OR store-wide (both scopes null).
        (kind = 'bulk'
         AND threshold_qty IS NOT NULL
         AND p_qty >= threshold_qty
         AND (
           scope_product_id = p_product_id
           OR (scope_category_id IS NOT NULL
               AND p_category_id IS NOT NULL
               AND scope_category_id = p_category_id)
           OR (scope_product_id IS NULL
               AND scope_category_id IS NULL)
         ))
        OR
        (kind = 'promotion'
         AND scope_product_id = p_product_id)
      )
      AND (starts_at IS NULL OR starts_at <= p_at)
      AND (ends_at IS NULL OR ends_at >= p_at)
    ORDER BY
      CASE kind
        WHEN 'club_tier' THEN 0
        WHEN 'customer_override' THEN 1
        WHEN 'bulk' THEN 2
        WHEN 'promotion' THEN 3
        ELSE 99
      END,
      priority DESC,
      created_at ASC
  LOOP
    v_rule_ids := v_rule_ids || v_rules.id;
    v_rule_kinds := v_rule_kinds || v_rules.kind;
    v_rule_percents := v_rule_percents || v_rules.delta_percent;
    v_running_factor := v_running_factor * (1.0 - v_rules.delta_percent / 100.0);
    v_running_factors := v_running_factors || v_running_factor;
  END LOOP;

  IF array_length(v_rule_ids, 1) IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  IF v_running_factor < v_cap_factor THEN
    v_cap_hit := true;
    v_scale := (1.0 - v_cap_factor) / (1.0 - v_running_factor);
  END IF;

  v_prev_factor := 1.0;
  FOR v_idx IN 1..array_length(v_rule_ids, 1) LOOP
    v_marginal_factor := (v_prev_factor - v_running_factors[v_idx]) * v_scale;
    v_marginal_cents := round(p_unit_price_cents::numeric * p_qty * v_marginal_factor)::int;
    v_applied := v_applied || jsonb_build_object(
      'rule_id', v_rule_ids[v_idx],
      'rule_kind', v_rule_kinds[v_idx],
      'percent', v_rule_percents[v_idx],
      'amount_cents', -v_marginal_cents,
      'cap_hit', v_cap_hit
    );
    v_prev_factor := v_running_factors[v_idx];
  END LOOP;

  RETURN v_applied;
END;
$$;

-- ---------------------------------------------------------------------------
-- (2) Shape constraint: bulk no longer requires a product/category scope
-- ---------------------------------------------------------------------------
ALTER TABLE public.discount_rules
  DROP CONSTRAINT discount_rules_shape_check;

ALTER TABLE public.discount_rules
  ADD CONSTRAINT discount_rules_shape_check CHECK (
    (
      (kind = 'bulk'::discount_rule_kind
        AND threshold_qty IS NOT NULL
        AND delta_percent IS NOT NULL)
    )
    OR (kind = 'club_tier'::discount_rule_kind
        AND scope_club_tier IS NOT NULL
        AND delta_percent IS NOT NULL)
    OR (kind = 'promotion'::discount_rule_kind
        AND delta_percent IS NOT NULL)
    OR (kind = 'customer_override'::discount_rule_kind
        AND scope_customer_id IS NOT NULL
        AND delta_percent IS NOT NULL)
    OR (kind = 'logistics_surcharge'::discount_rule_kind
        AND delta_cents IS NOT NULL
        AND delta_cents > 0)
  );
