-- Round 16.2 — Sale-discount auto-application: line resolver
--
-- Spec: docs/round-16-sale-discounts.md sections 5.2, 5.4, 10
--
-- Function: public.resolve_line_discounts
--
-- Given a line context (product, qty, unit price, customer, warehouse,
-- timestamp) returns a jsonb array of audit-ready rows:
--
--   [
--     { rule_id, rule_kind, percent, amount_cents, cap_hit },
--     ...
--   ]
--
-- amount_cents is NEGATIVE for discounts (positive would be a
-- surcharge — order-level only in this design; see Round 20).
--
-- v1: matches only kind='customer_override'. Subsequent rounds
-- extend the WHERE clause in the rule-walk to add more kinds.
--
-- Stacking: multiplicative. Cap: 30% effective max (running factor
-- floored at 0.70). When the cap fires, all contributing rows are
-- proportionally scaled down so the total still sums to 30%, and
-- every row's cap_hit field flips to true.
--
-- SECURITY DEFINER for consistency with other read-helpers in the
-- project. Function only reads discount_rules; no privilege
-- elevation concerns in v1.

BEGIN;

CREATE OR REPLACE FUNCTION public.resolve_line_discounts(
  p_product_id uuid,
  p_qty numeric,
  p_unit_price_cents int,
  p_customer_id uuid,
  p_source_warehouse_id uuid,
  p_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rules record;
  v_rule_ids uuid[] := ARRAY[]::uuid[];
  v_rule_kinds public.discount_rule_kind[] := ARRAY[]::public.discount_rule_kind[];
  v_rule_percents numeric[] := ARRAY[]::numeric[];
  v_running_factors numeric[] := ARRAY[]::numeric[];
  v_running_factor numeric := 1.0;
  v_cap_factor numeric := 0.70;             -- 30% off max → 70% retained
  v_cap_hit boolean := false;
  v_scale numeric := 1.0;
  v_idx int;
  v_marginal_factor numeric;
  v_marginal_cents int;
  v_prev_factor numeric;
  v_applied jsonb := '[]'::jsonb;
BEGIN
  -- Walk-in (no customer) sales can't match customer_override.
  -- Subsequent rounds will widen this to allow non-customer-scoped
  -- rule kinds even with NULL customer.
  IF p_customer_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Find candidates and remember each rule's contribution. We walk
  -- in deterministic order (priority desc, then created_at asc) so
  -- audit row order is stable across calls.
  FOR v_rules IN
    SELECT id, kind, delta_percent
    FROM public.discount_rules
    WHERE is_active = true
      AND kind = 'customer_override'
      AND scope_customer_id = p_customer_id
      AND (starts_at IS NULL OR starts_at <= p_at)
      AND (ends_at IS NULL OR ends_at >= p_at)
    ORDER BY priority DESC, created_at ASC
  LOOP
    v_rule_ids := v_rule_ids || v_rules.id;
    v_rule_kinds := v_rule_kinds || v_rules.kind;
    v_rule_percents := v_rule_percents || v_rules.delta_percent;
    v_running_factor := v_running_factor * (1.0 - v_rules.delta_percent / 100.0);
    v_running_factors := v_running_factors || v_running_factor;
  END LOOP;

  -- No rules matched → empty array.
  IF array_length(v_rule_ids, 1) IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Cap check. If the running factor went below 0.70, the combined
  -- discount exceeded 30%. Scale every per-rule marginal by the ratio
  -- (post-cap effective discount) / (pre-cap effective discount), so
  -- the audit rows still sum to the line's final discount_cents.
  IF v_running_factor < v_cap_factor THEN
    v_cap_hit := true;
    v_scale := (1.0 - v_cap_factor) / (1.0 - v_running_factor);
  END IF;

  -- Build the audit array. Each row's amount_cents is the marginal
  -- contribution: the difference between the line price BEFORE this
  -- rule and AFTER, multiplied by the scale factor.
  v_prev_factor := 1.0;
  FOR v_idx IN 1..array_length(v_rule_ids, 1) LOOP
    v_marginal_factor := (v_prev_factor - v_running_factors[v_idx]) * v_scale;
    v_marginal_cents := round(p_unit_price_cents::numeric * p_qty * v_marginal_factor)::int;

    v_applied := v_applied || jsonb_build_object(
      'rule_id', v_rule_ids[v_idx],
      'rule_kind', v_rule_kinds[v_idx],
      'percent', v_rule_percents[v_idx],
      'amount_cents', -v_marginal_cents,    -- negative = discount
      'cap_hit', v_cap_hit
    );

    v_prev_factor := v_running_factors[v_idx];
  END LOOP;

  RETURN v_applied;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_line_discounts(
  uuid, numeric, int, uuid, uuid, timestamptz
) TO authenticated;

COMMIT;
