-- Round 20.1 - resolve_line_discounts: promotion extension
--
-- Extends the cart-time resolver to enumerate `promotion` rules in
-- addition to club_tier (Round 17), customer_override (Round 16) and
-- bulk (Round 19). All stack multiplicatively, capped at 30% effective
-- per line.
--
-- WHAT PROMOTION CHANGES vs the Round 19 version:
--   * NEW KIND `promotion`: a time-bound % off on a single product, for
--     EVERYONE (including walk-ins), with NO minimum quantity. A "daily
--     deal" is a promotion whose [starts_at, ends_at] window covers one
--     day; a "weekly deal" covers a week. The date window already
--     applies to every kind, so promotion needs no new date handling.
--   * MATCH: kind = 'promotion' AND scope_product_id = p_product_id.
--     No customer, no tier, no threshold. Mirrors lib/discount-rules-
--     resolver.ts exactly.
--   * NO signature change: p_category_id (Round 19) is already present.
--     promotion is product-scoped so it does not use the category arg,
--     but the arg stays for bulk's category match.
--
-- KIND SORT (audit-row order, must match KIND_SORT_KEY in the TS file):
--   club_tier (0) -> customer_override (1) -> bulk (2) -> promotion (3),
--   then priority DESC, then created_at ASC.
--
-- LOCK-STEP: lib/discount-rules-resolver.ts carries the mirror of this
-- logic. Any change here must be reflected there and vice versa.
--
-- The stacking / cap / audit-building logic below is UNCHANGED from the
-- Round 19 version - only the candidate WHERE and the sort CASE differ.

CREATE OR REPLACE FUNCTION public.resolve_line_discounts(
  p_product_id uuid,
  p_qty numeric,
  p_unit_price_cents integer,
  p_customer_id uuid,
  p_source_warehouse_id uuid,
  p_at timestamp with time zone DEFAULT now(),
  p_category_id uuid DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_customer_tier public.club_tier;
  v_rules record;
  v_rule_ids uuid[] := ARRAY[]::uuid[];
  v_rule_kinds public.discount_rule_kind[] := ARRAY[]::public.discount_rule_kind[];
  v_rule_percents numeric[] := ARRAY[]::numeric[];
  v_running_factors numeric[] := ARRAY[]::numeric[];
  v_running_factor numeric := 1.0;
  v_cap_factor numeric := 0.70;             -- 30% off max -> 70% retained
  v_cap_hit boolean := false;
  v_scale numeric := 1.0;
  v_idx int;
  v_marginal_factor numeric;
  v_marginal_cents int;
  v_prev_factor numeric;
  v_applied jsonb := '[]'::jsonb;
BEGIN
  -- NO early walk-in return (since Round 19). bulk and promotion rules
  -- need no customer, so we let the WHERE clause decide per kind. The
  -- customer-dependent kinds (customer_override, club_tier) won't match
  -- when customer/tier is null, exactly as before.

  -- Look up this customer's club_tier once (safe when p_customer_id is
  -- NULL: v_customer_tier stays NULL and club_tier rules can't fire).
  -- NULL or 'none' means club_tier rules can't fire (per Model A).
  SELECT club_tier INTO v_customer_tier
    FROM public.profiles
    WHERE id = p_customer_id;

  -- Find candidates. Order is stable across calls so audit-row order is
  -- reproducible. Kind sort: club_tier (0), customer_override (1),
  -- bulk (2), promotion (3).
  FOR v_rules IN
    SELECT id, kind, delta_percent
    FROM public.discount_rules
    WHERE is_active = true
      AND (
        -- customer_override: scope is the customer id (needs a customer)
        (kind = 'customer_override'
         AND p_customer_id IS NOT NULL
         AND scope_customer_id = p_customer_id)
        OR
        -- club_tier: scope is the customer's current tier; 'none' and
        -- NULL excluded (Model A: not yet enrolled / walk-in).
        (kind = 'club_tier'
         AND v_customer_tier IS NOT NULL
         AND v_customer_tier <> 'none'
         AND scope_club_tier = v_customer_tier)
        OR
        -- bulk: quantity threshold met AND scope matches this line's
        -- product OR its category. No customer required.
        (kind = 'bulk'
         AND threshold_qty IS NOT NULL
         AND p_qty >= threshold_qty
         AND (
           scope_product_id = p_product_id
           OR (scope_category_id IS NOT NULL
               AND p_category_id IS NOT NULL
               AND scope_category_id = p_category_id)
         ))
        OR
        -- 20.1: promotion: time-bound product deal. No customer, no
        -- tier, no threshold -> fires for everyone including walk-ins.
        -- The date window (handled below) makes it daily/weekly.
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

  -- No rules matched -> empty array.
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
$function$;
