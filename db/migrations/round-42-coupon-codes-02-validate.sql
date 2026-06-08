-- round-42-coupon-codes-02-validate.sql
-- The coupon "checker": the single source of truth for whether a typed code is
-- valid for a given sale, and how much it takes off.
--
-- Order-level by design (NOT part of resolve_line_discounts, which is per-line).
--
-- INPUTS:
--   p_code                 the code the customer/seller typed (case-insensitive)
--   p_source_warehouse_id  the sale's store (sales.source_warehouse_id), or NULL
--   p_channel              'pos' or 'online' (sales.source)
--   p_base_cents           the amount the coupon is taken off (the CALLER decides
--                          what base to pass -- e.g. merchandise subtotal). The
--                          function stays neutral about subtotal-vs-total so the
--                          checkout step can pass whatever your order math uses.
--   p_at                   evaluation time (defaults to now())
--
-- RETURNS exactly one row:
--   rule_id, name, delta_percent, delta_cents  -- the matched coupon (NULL if none)
--   discount_cents                              -- amount off, floored at base, >=0
--   reason                                      -- 'ok' | 'empty_code' | 'invalid'
--
-- MATCHING: a coupon matches when active, within its date window, and its store
-- and channel are either blank (=all) or equal the sale's. When more than one
-- active coupon shares the code and matches, the MOST SPECIFIC wins
-- (store+channel beats one-of beats all). Ties break on most-recently-created.
-- (Say the word if you'd rather "biggest discount wins" -- it's one line.)

CREATE OR REPLACE FUNCTION public.validate_coupon(
  p_code                text,
  p_source_warehouse_id uuid,
  p_channel             public.sale_source,
  p_base_cents          integer,
  p_at                  timestamptz DEFAULT now()
)
RETURNS TABLE (
  rule_id        uuid,
  name           text,
  delta_percent  numeric,
  delta_cents    integer,
  discount_cents integer,
  reason         text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_code text := lower(btrim(coalesce(p_code, '')));
  v_base integer := greatest(coalesce(p_base_cents, 0), 0);
  v_rule record;
  v_disc integer;
BEGIN
  IF v_code = '' THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::numeric, NULL::integer, 0, 'empty_code';
    RETURN;
  END IF;

  SELECT dr.id, dr.name, dr.delta_percent, dr.delta_cents
    INTO v_rule
  FROM public.discount_rules dr
  WHERE dr.kind = 'coupon'::public.discount_rule_kind
    AND dr.is_active = true
    AND lower(dr.code) = v_code
    AND (dr.starts_at IS NULL OR dr.starts_at <= p_at)
    AND (dr.ends_at   IS NULL OR p_at <= dr.ends_at)
    AND (dr.scope_source_warehouse_id IS NULL
         OR dr.scope_source_warehouse_id = p_source_warehouse_id)
    AND (dr.scope_channel IS NULL
         OR dr.scope_channel = p_channel)
  ORDER BY
    ( (dr.scope_source_warehouse_id IS NOT NULL)::int
    + (dr.scope_channel IS NOT NULL)::int ) DESC,
    dr.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::numeric, NULL::integer, 0, 'invalid';
    RETURN;
  END IF;

  IF v_rule.delta_percent IS NOT NULL THEN
    v_disc := floor(v_base * v_rule.delta_percent / 100.0)::int;
  ELSE
    v_disc := least(v_rule.delta_cents, v_base);
  END IF;
  IF v_disc < 0 THEN v_disc := 0; END IF;

  RETURN QUERY SELECT v_rule.id, v_rule.name, v_rule.delta_percent,
                      v_rule.delta_cents, v_disc, 'ok';
END;
$$;

GRANT EXECUTE ON FUNCTION
  public.validate_coupon(text, uuid, public.sale_source, integer, timestamptz)
  TO authenticated, anon;
