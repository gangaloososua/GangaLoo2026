-- Round 25g - Commission statements report function.
--
-- Read-only STABLE function backing the Reports > Commission Statements screen.
-- Given a period [p_start, p_end), returns headline totals plus per-role and
-- per-earner breakdowns. All money values are in CENTS.
--
-- Commissions date through sale_item -> sale -> sold_at. VOID commissions are
-- EXCLUDED. Buckets: earned = paid + pending (non-void), paid = status 'paid',
-- owed = status 'pending'. earner_role separates sellers from distributors so
-- the two never blend; earner names resolve via profiles.full_name.

create or replace function public.commissions_report(p_start timestamptz, p_end timestamptz)
returns jsonb language sql stable as $cr$
  with c as (
    select sc.earner_id, sc.earner_role::text as role, sc.amount_cents, sc.status::text as status
    from sale_commissions sc
    join sale_items si on si.id = sc.sale_item_id
    join sales s       on s.id = si.sale_id
    where s.sold_at >= p_start and s.sold_at < p_end
      and sc.status::text <> 'void'
  ),
  per as (
    select coalesce(p.full_name, '(unknown)') as earner,
           c.role,
           coalesce(sum(c.amount_cents), 0)                                     as earned_cents,
           coalesce(sum(c.amount_cents) filter (where c.status = 'paid'), 0)    as paid_cents,
           coalesce(sum(c.amount_cents) filter (where c.status = 'pending'), 0) as owed_cents,
           count(*)                                                             as commissions
    from c
    left join profiles p on p.id = c.earner_id
    group by coalesce(p.full_name, '(unknown)'), c.role
  )
  select jsonb_build_object(
    'earned_cents', (select coalesce(sum(amount_cents), 0) from c),
    'paid_cents',   (select coalesce(sum(amount_cents) filter (where status = 'paid'), 0) from c),
    'owed_cents',   (select coalesce(sum(amount_cents) filter (where status = 'pending'), 0) from c),
    'count',        (select count(*) from c),
    'by_role', coalesce((
      select jsonb_agg(jsonb_build_object(
               'role', role,
               'earned_cents', earned_cents,
               'paid_cents', paid_cents,
               'owed_cents', owed_cents
             ) order by earned_cents desc)
      from (
        select role,
               sum(earned_cents) as earned_cents,
               sum(paid_cents)   as paid_cents,
               sum(owed_cents)   as owed_cents
        from per group by role
      ) q
    ), '[]'::jsonb),
    'by_earner', coalesce((
      select jsonb_agg(jsonb_build_object(
               'earner', earner,
               'role', role,
               'earned_cents', earned_cents,
               'paid_cents', paid_cents,
               'owed_cents', owed_cents,
               'count', commissions
             ) order by earned_cents desc)
      from per
    ), '[]'::jsonb)
  ); $cr$;
