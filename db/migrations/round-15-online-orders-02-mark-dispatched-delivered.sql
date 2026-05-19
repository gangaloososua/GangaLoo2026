-- Round 15.2.2 — mark_dispatched + mark_delivered
--
-- Two small RPCs advancing tracking_status on online sales. Neither
-- touches sale_status (payments drive that via separate sale_payments
-- inserts). Both RBAC-gated to owner/admin.
--
-- mark_dispatched: delivery method only; received -> dispatched
-- mark_delivered:  any fulfillment method; received|dispatched -> delivered

-- ----------------------------------------------------------------------
-- mark_dispatched
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_dispatched(
  p_sale_id uuid,
  p_tracking_number text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_role user_role;
  v_source sale_source;
  v_fulfillment fulfillment_method;
  v_tracking_status text;
  v_sale_status sale_status;
BEGIN
  -- RBAC
  SELECT role INTO v_user_role
    FROM profiles WHERE auth_user_id = auth.uid();
  IF v_user_role IS NULL OR v_user_role NOT IN ('owner','admin') THEN
    RAISE EXCEPTION 'permission denied: only owner/admin can dispatch online orders'
      USING ERRCODE = '42501';
  END IF;

  -- Load + guard
  SELECT source, fulfillment_method, tracking_status, status
    INTO v_source, v_fulfillment, v_tracking_status, v_sale_status
    FROM sales WHERE id = p_sale_id;

  IF v_source IS NULL THEN
    RAISE EXCEPTION 'sale % not found', p_sale_id USING ERRCODE = 'P0002';
  END IF;
  IF v_source <> 'online' THEN
    RAISE EXCEPTION 'mark_dispatched: sale % is not an online order (source=%)',
      p_sale_id, v_source USING ERRCODE = '22023';
  END IF;
  IF v_fulfillment <> 'delivery' THEN
    RAISE EXCEPTION 'mark_dispatched: sale % is fulfillment_method=% (delivery required)',
      p_sale_id, v_fulfillment USING ERRCODE = '22023';
  END IF;
  IF v_tracking_status IS DISTINCT FROM 'received' THEN
    RAISE EXCEPTION 'mark_dispatched: sale % has tracking_status=%, expected received',
      p_sale_id, v_tracking_status USING ERRCODE = '22023';
  END IF;
  IF v_sale_status IN ('cancelled','refunded') THEN
    RAISE EXCEPTION 'mark_dispatched: sale % is %, cannot dispatch',
      p_sale_id, v_sale_status USING ERRCODE = '22023';
  END IF;

  UPDATE sales SET
    tracking_status = 'dispatched',
    dispatched_at   = now(),
    tracking_number = COALESCE(NULLIF(p_tracking_number, ''), tracking_number),
    updated_at      = now()
  WHERE id = p_sale_id;
END;
$function$;

-- ----------------------------------------------------------------------
-- mark_delivered
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_delivered(
  p_sale_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_role user_role;
  v_source sale_source;
  v_tracking_status text;
  v_sale_status sale_status;
BEGIN
  -- RBAC
  SELECT role INTO v_user_role
    FROM profiles WHERE auth_user_id = auth.uid();
  IF v_user_role IS NULL OR v_user_role NOT IN ('owner','admin') THEN
    RAISE EXCEPTION 'permission denied: only owner/admin can mark online orders delivered'
      USING ERRCODE = '42501';
  END IF;

  -- Load + guard
  SELECT source, tracking_status, status
    INTO v_source, v_tracking_status, v_sale_status
    FROM sales WHERE id = p_sale_id;

  IF v_source IS NULL THEN
    RAISE EXCEPTION 'sale % not found', p_sale_id USING ERRCODE = 'P0002';
  END IF;
  IF v_source <> 'online' THEN
    RAISE EXCEPTION 'mark_delivered: sale % is not an online order (source=%)',
      p_sale_id, v_source USING ERRCODE = '22023';
  END IF;
  IF v_tracking_status NOT IN ('received','dispatched') THEN
    RAISE EXCEPTION 'mark_delivered: sale % has tracking_status=%, expected received or dispatched',
      p_sale_id, v_tracking_status USING ERRCODE = '22023';
  END IF;
  IF v_sale_status IN ('cancelled','refunded') THEN
    RAISE EXCEPTION 'mark_delivered: sale % is %, cannot deliver',
      p_sale_id, v_sale_status USING ERRCODE = '22023';
  END IF;

  UPDATE sales SET
    tracking_status = 'delivered',
    delivered_at    = now(),
    updated_at      = now()
  WHERE id = p_sale_id;
END;
$function$;