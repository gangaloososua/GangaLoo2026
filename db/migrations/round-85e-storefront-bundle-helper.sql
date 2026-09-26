-- round-85e: shared ONLINE bundle calculation used by get_storefront_quote
-- and place_storefront_order (so preview and charge never disagree).
create or replace function public._storefront_bundle_allocations(
  p_wh     uuid,
  p_lines  jsonb,
  p_markup numeric default 0
)
returns table (line_idx int, rule_id uuid, discount_cents int)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
#variable_conflict use_column
declare
  n int; a_idx int[]; a_pid uuid[]; a_free int[]; a_unit int[];
  r record; it record;
  v_sets int; v_have int; v_need int; v_units int;
  t_i int[]; t_units int[]; t_val bigint[];
  v_regular bigint; v_price bigint; v_disc bigint; v_given bigint; v_share bigint;
  i int; k int;
begin
  select array_agg((e->>'idx')::int order by ord),
         array_agg((e->>'product_id')::uuid order by ord),
         array_agg(floor((e->>'qty')::numeric)::int order by ord),
         array_agg((e->>'unit_cents')::int order by ord)
    into a_idx, a_pid, a_free, a_unit
    from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) with ordinality as t(e, ord);
  n := coalesce(array_length(a_idx, 1), 0);
  if n = 0 then return; end if;
  for r in
    select d.id, d.delta_cents from discount_rules d
     where d.kind = 'bundle' and d.is_active and d.delta_cents > 0
       and (d.starts_at is null or d.starts_at <= now())
       and (d.ends_at is null or d.ends_at >= now())
       and (d.scope_warehouse_id is null or d.scope_warehouse_id = p_wh)
       and (select count(*) from discount_rule_bundle_items b where b.rule_id = d.id) >= 2
     order by d.priority desc, d.created_at asc
  loop
    v_sets := null;
    for it in select b.product_id, b.qty from discount_rule_bundle_items b where b.rule_id = r.id loop
      v_have := 0;
      for i in 1..n loop
        if a_pid[i] = it.product_id then v_have := v_have + a_free[i]; end if;
      end loop;
      v_sets := least(coalesce(v_sets, v_have / it.qty), v_have / it.qty);
    end loop;
    if v_sets is null or v_sets < 1 then continue; end if;
    t_i := '{}'; t_units := '{}'; t_val := '{}'; v_regular := 0;
    for it in select b.product_id, b.qty from discount_rule_bundle_items b
               where b.rule_id = r.id order by b.product_id loop
      v_need := it.qty * v_sets;
      for i in 1..n loop
        exit when v_need = 0;
        if a_pid[i] <> it.product_id or a_free[i] <= 0 then continue; end if;
        v_units := least(a_free[i], v_need);
        t_i := t_i || i; t_units := t_units || v_units;
        t_val := t_val || (v_units::bigint * a_unit[i]);
        v_regular := v_regular + v_units::bigint * a_unit[i];
        v_need := v_need - v_units;
      end loop;
    end loop;
    v_price := r.delta_cents::bigint;
    if p_markup > 0 then
      v_price := (ceil(v_price::numeric * (1 + p_markup / 100.0) / 2500.0) * 2500)::bigint;
    end if;
    v_disc := v_regular - v_price * v_sets;
    if v_disc <= 0 then continue; end if;
    v_given := 0;
    for k in 1..array_length(t_i, 1) loop
      if k = array_length(t_i, 1) then v_share := v_disc - v_given;
      else v_share := floor(v_disc::numeric * t_val[k] / v_regular)::bigint; end if;
      v_given := v_given + v_share;
      a_free[t_i[k]] := a_free[t_i[k]] - t_units[k];
      line_idx := a_idx[t_i[k]]; rule_id := r.id; discount_cents := v_share::int;
      return next;
    end loop;
  end loop;
end;
$function$;
revoke all on function public._storefront_bundle_allocations(uuid, jsonb, numeric) from public, anon, authenticated;
