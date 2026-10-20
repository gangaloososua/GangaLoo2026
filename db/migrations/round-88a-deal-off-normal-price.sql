-- round-88a: while a product has a LIVE promotion (deal), the deal % comes
-- off the NORMAL store price (override else base); the product's Sale price is
-- ignored. Club members pay the lower of (deal price) and (club price - tier).
-- Owner decision 2026-10-20. Products without a live deal: unchanged.
-- Patches 2 lines in each live function; stops if a line isn't found once.
do $$
declare
  r record;
  d text;
begin
  for r in
    select * from (values
      ('public.get_storefront_quote(jsonb)',
       'v_unit_list := round(v_list_normal * (1 - v_deal_frac))::int;',
       'v_unit_list := round((case when coalesce(v_pct, 0) > 0 then coalesce(v_override, v_base) else v_list_normal end) * (1 - v_deal_frac))::int; -- round-88a: deal off normal price'),
      ('public.place_storefront_order(jsonb)',
       'v_unit_list := round(v_list_normal * (1 - v_deal_frac))::int;',
       'v_unit_list := round((case when coalesce(v_pct, 0) > 0 then coalesce(v_override, v_base) else v_list_normal end) * (1 - v_deal_frac))::int; -- round-88a: deal off normal price'),
      ('public.get_storefront_quote(jsonb)',
       'v_unit_mem  := round(v_mem_normal  * (1 - v_total_frac))::int;',
       'v_unit_mem  := case when coalesce(v_pct, 0) > 0 then least(round(coalesce(v_override, v_base) * (1 - v_total_frac)), case when v_is_member and v_club is not null and v_club > 0 then round(v_club * (1 - least(0.30, v_tier_pct / 100.0))) end)::int else round(v_mem_normal * (1 - v_total_frac))::int end; -- round-88a: deal off normal price, members get the lower of deal/club'),
      ('public.place_storefront_order(jsonb)',
       'v_unit      := round(v_mem_normal  * (1 - v_total_frac))::int;',
       'v_unit      := case when coalesce(v_pct, 0) > 0 then least(round(coalesce(v_override, v_base) * (1 - v_total_frac)), case when v_is_member and v_club is not null and v_club > 0 then round(v_club * (1 - least(0.30, v_tier_pct / 100.0))) end)::int else round(v_mem_normal * (1 - v_total_frac))::int end; -- round-88a: deal off normal price, members get the lower of deal/club')
    ) as t(sig, old_line, new_line)
  loop
    d := pg_get_functiondef(r.sig::regprocedure);
    if (length(d) - length(replace(d, r.old_line, ''))) / length(r.old_line) <> 1 then
      raise exception 'Stopped: line not found exactly once in %: %', r.sig, r.old_line;
    end if;
    execute replace(d, r.old_line, r.new_line);
  end loop;
end $$;
