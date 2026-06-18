-- ============================================================================
-- Round 76a: Automatic purchase-order numbers ("Order-1993", "Order-1994", ...).
--
-- GOAL (owner): give each NEW purchase order a sequential human-readable number,
-- shown in the Purchases list Reference column. Numbering continues from the
-- owner's manual cross-reference numbers, so it starts at 1993.
--
-- DESIGN (mirrors the existing sales_fac_seq -> FAC-#### pattern):
--   * New column  purchase_orders.order_no text  (e.g. 'Order-1993'). NULL on the
--     245 existing orders by decision (only new orders get a number going forward).
--   * New sequence purchase_order_seq starting at 1993.
--   * A BEFORE INSERT trigger stamps order_no = 'Order-' || nextval(seq) whenever
--     a new order is created and order_no was not supplied. Hands-off: the create
--     flow needs no code change.
--   * legacy_id (the owner's manual numbers) is UNTOUCHED and stays usable.
--
-- SAFETY: purely additive. No existing row is modified. CREATE ... IF NOT EXISTS
-- everywhere; safe to re-run.
-- ============================================================================

-- 1) The column (nullable; old orders stay blank).
alter table public.purchase_orders
  add column if not exists order_no text;

-- 2) The sequence. Starts at 1993 so the first new order is Order-1993.
create sequence if not exists public.purchase_order_seq
  as bigint
  start with 1993
  increment by 1
  no maxvalue
  no cycle;

-- 3) The stamping function: only fills order_no when it was left empty.
create or replace function public._stamp_purchase_order_no()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if new.order_no is null or btrim(new.order_no) = '' then
    new.order_no := 'Order-' || nextval('public.purchase_order_seq')::text;
  end if;
  return new;
end;
$function$;

-- 4) The trigger: fire before each insert.
drop trigger if exists trg_stamp_purchase_order_no on public.purchase_orders;
create trigger trg_stamp_purchase_order_no
  before insert on public.purchase_orders
  for each row
  execute function public._stamp_purchase_order_no();

-- ============================================================================
-- End round 76a.
-- ============================================================================
