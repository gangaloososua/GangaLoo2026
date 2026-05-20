-- Round 17.2 — resolve_line_discounts: club_tier extension
--
-- Extends the cart-time resolver to enumerate club_tier rules in
-- addition to customer_override rules. Both stack multiplicatively
-- per the 30%-cap engine; nothing about the stacking math changes.
--
-- Matching:
--   * customer_override: scope_customer_id = p_customer_id   (Round 16)
--   * club_tier:         scope_club_tier   = customer.club_tier
--                                            (looked up from profiles)
--                        AND customer.club_tier != 'none'
--                        (Model A: 'none' = not enrolled, can't get
--                        discounts. Admin UI also blocks 'none' in
--                        the rule builder, but this guard keeps the
--                        resolver correct independently.)
--
-- Ordering (audit-row stability — first row stacks first):
--   1. kind sort key: club_tier (0) before customer_override (1)
--      so tier discount lands first, override layers on top.
--   2. priority DESC (existing tiebreaker within a kind)
--   3. created_at ASC (existing final tiebreaker)
--
-- Walk-in (NULL customer) still returns []. Both rule kinds need
-- a customer to match, so the NULL guard at the top is unchanged.

CREATE OR REPLACE FUNCTION public.resolve_line_discounts(
  p_product_id uuid,
  p_qty numeric,
  p_unit_price_cents integer,
  p_customer_id uuid,
  p_source_warehouse_id uuid,
  p_at timestamp with time zone DEFAULT now()
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
  v_cap_factor numeric := 0.70;             -- 30% off max → 70% retained
  v_cap_hit boolean := false;
  v_scale numeric := 1.0;
  v_idx int;
  v_marginal_factor numeric;
  v_marginal_cents int;
  v_prev_factor numeric;
  v_applied jsonb := '[]'::jsonb;
BEGIN
  -- Walk-in (no customer) sales can't match customer_override or
  -- club_tier. Both currently-supported kinds need a customer.
  IF p_customer_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  -- 17.2: Look up this customer's club_tier once. NULL or 'none' means
  -- club_tier rules can't fire for them (per Model A).
  SELECT club_tier INTO v_customer_tier
    FROM public.profiles
    WHERE id = p_customer_id;

  -- Find candidates. Order is stable across calls so audit-row order
  -- is reproducible. club_tier sorts BEFORE customer_override (kind
  -- sort key 0 vs 1) so the tier discount stacks first.
  FOR v_rules IN
    SELECT id, kind, delta_percent
    FROM public.discount_rules
    WHERE is_active = true
      AND (
        -- customer_override: scope is the customer id
        (kind = 'customer_override' AND scope_customer_id = p_customer_id)
        OR
        -- 17.2: club_tier: scope is the customer's current tier, and
        -- 'none' is excluded (Model A: not yet enrolled).
        (kind = 'club_tier'
         AND v_customer_tier IS NOT NULL
         AND v_customer_tier <> 'none'
         AND scope_club_tier = v_customer_tier)
      )
      AND (starts_at IS NULL OR starts_at <= p_at)
      AND (ends_at IS NULL OR ends_at >= p_at)
    ORDER BY
      CASE kind WHEN 'club_tier' THEN 0 ELSE 1 END,
      priority DESC,
      created_at ASC
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
$function$;
