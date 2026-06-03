-- round-58a-product-direct-discount.sql
-- Per-product "direct discount" (sale price) on products.
-- sale_price_cents = the exact discounted unit price actually charged (NULL = no direct discount)
-- sale_discount_pct = the percent you typed, kept only so the form can re-show "15%" vs a price
-- Purely additive. No view/function changes here.

alter table public.products
  add column if not exists sale_price_cents integer,
  add column if not exists sale_discount_pct numeric(5,2);
