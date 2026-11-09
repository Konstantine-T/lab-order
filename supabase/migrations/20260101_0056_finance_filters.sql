


-- ── 1. Lab: the rows every lab finance function reads ────────────────────
drop function if exists public._lab_receivables_rows(
  uuid, text, text, text, text[], date, date, boolean, numeric, numeric);
drop function if exists public._lab_receivables_rows(
  uuid, text, text, text, text[], date, date, boolean, numeric, numeric, text[]);

create function public._lab_receivables_rows(
  p_lab_id          uuid,
  p_search          text    default null,
  p_recipient_type  text    default null,
  p_customer_id     text    default null,
  p_statuses        text[]  default null,
  p_date_from       date    default null,
  p_date_to         date    default null,
  p_overdue_only    boolean default false,
  p_min_amount      numeric default null,
  p_max_amount      numeric default null,
  p_order_statuses  text[]  default null
)
returns table (
  order_id            uuid,
  order_code          text,
  order_status        text,
  customer_type       text,
  customer_id         text,
  customer_name       text,
  doctor_name         text,
  service_name        text,
  patient_name        text,
  final_total         numeric,
  paid_total          numeric,
  outstanding         numeric,
  payment_status      text,
  confirmed_due_date  date,
  requested_due_date  date,
  confirmed_due_time  time,
  requested_due_time  time,
  created_at          timestamptz,
  completed_at        timestamptz
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
-- Prefer table columns over the OUT-parameter names on any ambiguity.
#variable_conflict use_column
begin
  if not public.current_user_owns_lab(p_lab_id) then
    raise exception 'not_your_lab';
  end if;

  return query
  with base as (
    select
      o.id                                        as order_id,
      o.order_code                                as order_code,
      o.status::text                              as order_status,
      o.invoice_recipient_type::text              as customer_type,
      case when o.invoice_recipient_type = 'DOCTOR'
           then o.doctor_id::text
           -- 0048: a buying lab is one customer, keyed by its lab id.
           when o.invoice_recipient_type::text = 'LAB'
           then coalesce(o.buyer_lab_id::text,
                         nullif(o.invoice_recipient_snapshot->>'lab_id', ''),
                         'unknown')
           else coalesce(
                  nullif(o.invoice_recipient_snapshot->>'identification_code', ''),
                  o.invoice_recipient_snapshot->>'name',
                  'unknown')
      end                                         as customer_id,
      coalesce(
        nullif(o.invoice_recipient_snapshot->>'name', ''),
        nullif(trim(coalesce(o.doctor_snapshot->>'first_name','') || ' ' ||
                    coalesce(o.doctor_snapshot->>'last_name','')), ''),
        '—')                                      as customer_name,
      nullif(trim(coalesce(o.doctor_snapshot->>'first_name','') || ' ' ||
                  coalesce(o.doctor_snapshot->>'last_name','')), '')
                                                  as doctor_name,
      coalesce(o.service_snapshot->>'name', '')   as service_name,
      -- 0048: a purchase may have no patient; its case reference stands in.
      coalesce(
        nullif(trim(coalesce(pt.first_name, '') || ' ' || coalesce(pt.last_name, '')), ''),
        nullif(trim(o.patient_reference), ''))    as patient_name,
      o.final_total                               as final_total,
      o.paid_total                                as paid_total,
      greatest(o.final_total - o.paid_total, 0)   as outstanding,
      case when o.paid_total <= 0                 then 'UNPAID'
           when o.paid_total < o.final_total      then 'PARTIALLY_PAID'
           else 'PAID' end                        as payment_status,
      o.confirmed_due_date                        as confirmed_due_date,
      o.requested_due_date                        as requested_due_date,
      o.confirmed_due_time                        as confirmed_due_time,
      o.requested_due_time                        as requested_due_time,
      o.created_at                                as created_at,
      o.completed_at                              as completed_at
    from public.orders o
    left join public.patients pt on pt.id = o.patient_id
    where o.lab_id = p_lab_id
      and o.status <> 'CANCELLED'
      and o.final_total is not null
  )
  select b.order_id, b.order_code, b.order_status, b.customer_type, b.customer_id,
         b.customer_name, b.doctor_name, b.service_name, b.patient_name,
         b.final_total, b.paid_total, b.outstanding, b.payment_status,
         b.confirmed_due_date, b.requested_due_date,
         b.confirmed_due_time, b.requested_due_time,
         b.created_at, b.completed_at
  from base b
  where (p_search is null or p_search = ''
         or b.order_code ilike '%' || p_search || '%'
         or b.customer_name ilike '%' || p_search || '%')
    and (p_recipient_type is null or b.customer_type = p_recipient_type)
    and (p_customer_id is null or b.customer_id = p_customer_id)
    and (p_statuses is null or b.payment_status = any(p_statuses))
    and (p_order_statuses is null or b.order_status = any(p_order_statuses))
    -- "Completed on", in Tbilisi. Not completed = no date = out of any range.
    and (p_date_from is null
         or (b.completed_at at time zone 'Asia/Tbilisi')::date >= p_date_from)
    and (p_date_to is null
         or (b.completed_at at time zone 'Asia/Tbilisi')::date <= p_date_to)
    and (not coalesce(p_overdue_only, false)
         or (b.confirmed_due_date is not null
             and b.confirmed_due_date < current_date
             and b.outstanding > 0))
    and (p_min_amount is null or b.outstanding >= p_min_amount)
    and (p_max_amount is null or b.outstanding <= p_max_amount);
end $function$;


-- ── 2. Lab: per customer ─────────────────────────────────────────────────
drop function if exists public.lab_receivables_by_customer(
  uuid, text, text, text, text[], date, date, boolean, numeric, numeric);
drop function if exists public.lab_receivables_by_customer(
  uuid, text, text, text, text[], date, date, boolean, numeric, numeric, text[]);

create function public.lab_receivables_by_customer(
  p_lab_id          uuid,
  p_search          text    default null,
  p_recipient_type  text    default null,
  p_customer_id     text    default null,
  p_statuses        text[]  default null,
  p_date_from       date    default null,
  p_date_to         date    default null,
  p_overdue_only    boolean default false,
  p_min_amount      numeric default null,
  p_max_amount      numeric default null,
  p_order_statuses  text[]  default null
)
returns table (
  customer_type     text,
  customer_id       text,
  customer_name     text,
  order_count       bigint,
  total_billed      numeric,
  total_paid        numeric,
  total_outstanding numeric
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select r.customer_type,
         r.customer_id,
         max(r.customer_name)  as customer_name,
         count(*)              as order_count,
         sum(r.final_total)    as total_billed,
         sum(r.paid_total)     as total_paid,
         sum(r.outstanding)    as total_outstanding
  from public._lab_receivables_rows(
         p_lab_id         => p_lab_id,
         p_search         => p_search,
         p_recipient_type => p_recipient_type,
         p_customer_id    => p_customer_id,
         p_statuses       => p_statuses,
         p_date_from      => p_date_from,
         p_date_to        => p_date_to,
         p_overdue_only   => p_overdue_only,
         p_min_amount     => p_min_amount,
         p_max_amount     => p_max_amount,
         p_order_statuses => p_order_statuses) r
  group by r.customer_type, r.customer_id
  order by sum(r.outstanding) desc;
$function$;


-- ── 3. Lab: one page of orders ───────────────────────────────────────────
drop function if exists public.lab_receivables_list(
  uuid, text, text, text, text[], date, date, boolean, numeric, numeric,
  text, integer, integer);
drop function if exists public.lab_receivables_list(
  uuid, text, text, text, text[], date, date, boolean, numeric, numeric,
  text[], text, integer, integer);

create function public.lab_receivables_list(
  p_lab_id          uuid,
  p_search          text    default null,
  p_recipient_type  text    default null,
  p_customer_id     text    default null,
  p_statuses        text[]  default null,
  p_date_from       date    default null,
  p_date_to         date    default null,
  p_overdue_only    boolean default false,
  p_min_amount      numeric default null,
  p_max_amount      numeric default null,
  p_order_statuses  text[]  default null,
  p_sort            text    default 'created_desc',
  p_limit           integer default 25,
  p_offset          integer default 0
)
returns table (
  order_id            uuid,
  order_code          text,
  order_status        text,
  customer_type       text,
  customer_id         text,
  customer_name       text,
  doctor_name         text,
  service_name        text,
  patient_name        text,
  final_total         numeric,
  paid_total          numeric,
  outstanding         numeric,
  payment_status      text,
  confirmed_due_date  date,
  requested_due_date  date,
  confirmed_due_time  time,
  requested_due_time  time,
  created_at          timestamptz,
  completed_at        timestamptz,
  total_count         bigint
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with rows as (
    select * from public._lab_receivables_rows(
      p_lab_id         => p_lab_id,
      p_search         => p_search,
      p_recipient_type => p_recipient_type,
      p_customer_id    => p_customer_id,
      p_statuses       => p_statuses,
      p_date_from      => p_date_from,
      p_date_to        => p_date_to,
      p_overdue_only   => p_overdue_only,
      p_min_amount     => p_min_amount,
      p_max_amount     => p_max_amount,
      p_order_statuses => p_order_statuses)
  )
  select r.order_id, r.order_code, r.order_status, r.customer_type, r.customer_id,
         r.customer_name, r.doctor_name, r.service_name, r.patient_name,
         r.final_total, r.paid_total, r.outstanding, r.payment_status,
         r.confirmed_due_date, r.requested_due_date,
         r.confirmed_due_time, r.requested_due_time,
         r.created_at, r.completed_at,
         count(*) over() as total_count
  from rows r
  order by
    case when p_sort = 'created_asc'      then r.created_at end asc  nulls last,
    case when p_sort = 'created_desc'     then r.created_at end desc nulls last,
    case when p_sort = 'outstanding_desc' then r.outstanding end desc nulls last,
    case when p_sort = 'outstanding_asc'  then r.outstanding end asc  nulls last,
    case when p_sort = 'due_asc'          then r.confirmed_due_date end asc  nulls last,
    case when p_sort = 'due_desc'         then r.confirmed_due_date end desc nulls last,
    -- Not completed has no finish date: last either way.
    case when p_sort = 'completed_desc'   then r.completed_at end desc nulls last,
    case when p_sort = 'completed_asc'    then r.completed_at end asc  nulls last,
    r.created_at desc
  limit  greatest(coalesce(p_limit, 25), 0)
  offset greatest(coalesce(p_offset, 0), 0);
$function$;


-- ── 4. Clinic: per doctor ────────────────────────────────────────────────
drop function if exists public.clinic_payables_by_doctor(
  text, uuid, uuid, text, text[], date, date, boolean, numeric, numeric);
drop function if exists public.clinic_payables_by_doctor(
  text, uuid, uuid, text, text[], date, date, boolean, numeric, numeric, text[]);

create function public.clinic_payables_by_doctor(
  p_search          text    default null,
  p_doctor_id       uuid    default null,
  p_lab_id          uuid    default null,
  p_recipient_type  text    default null,
  p_statuses        text[]  default null,
  p_date_from       date    default null,
  p_date_to         date    default null,
  p_overdue_only    boolean default false,
  p_min_amount      numeric default null,
  p_max_amount      numeric default null,
  p_order_statuses  text[]  default null
)
returns table (
  doctor_id         uuid,
  doctor_name       text,
  order_count       bigint,
  total_billed      numeric,
  total_paid        numeric,
  total_outstanding numeric
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with scope as (
    select
      o.doctor_id,
      trim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')) as doctor_name,
      -- What the lab will actually charge: its confirmed figure once it exists,
      -- the doctor-facing estimate until then, and 0 for a service priced in
      -- the lab's own words that has not been quoted yet (0023/LAB_DESCRIBED).
      coalesce(o.final_total, o.generated_total, 0) as billed,
      coalesce(o.paid_total, 0)                     as paid,
      o.status,
      o.confirmed_due_date,
      o.payment_status,
      o.invoice_recipient_type,
      o.created_at,
      o.completed_at,
      o.order_code,
      o.lab_id,
      coalesce(nullif(o.service_snapshot->>'name', ''), ls.name, '')          as service_name,
      coalesce(nullif(o.lab_snapshot->>'public_name', ''), l.public_name, '') as lab_name,
      trim(coalesce(pt.first_name, '') || ' ' || coalesce(pt.last_name, ''))  as patient_name
    from public.orders o
    join public.doctor_profiles dp on dp.id = o.doctor_id
    join public.users u            on u.id = dp.user_id
    left join public.labs l         on l.id = o.lab_id
    left join public.lab_services ls on ls.id = o.lab_service_id
    left join public.patients pt     on pt.id = o.patient_id
    where o.clinic_id is not null
      and o.clinic_id = public.current_admin_clinic_id()
      -- 0056: a cancelled order owes nothing, estimate or not.
      and o.status <> 'CANCELLED'
  )
  select
    s.doctor_id,
    s.doctor_name,
    count(*)::bigint                     as order_count,
    sum(s.billed)::numeric               as total_billed,
    sum(s.paid)::numeric                 as total_paid,
    sum(s.billed - s.paid)::numeric      as total_outstanding
  from scope s
  where (p_doctor_id      is null or s.doctor_id = p_doctor_id)
    and (p_lab_id         is null or s.lab_id = p_lab_id)
    and (p_recipient_type is null or s.invoice_recipient_type::text = p_recipient_type)
    and (p_statuses       is null or s.payment_status::text = any(p_statuses))
    and (p_order_statuses is null or s.status::text = any(p_order_statuses))
    -- "Completed on", in Tbilisi. Not completed = no date = out of any range.
    and (p_date_from      is null
         or (s.completed_at at time zone 'Asia/Tbilisi')::date >= p_date_from)
    and (p_date_to        is null
         or (s.completed_at at time zone 'Asia/Tbilisi')::date <= p_date_to)
    and (not p_overdue_only or (
          s.confirmed_due_date is not null
          and s.confirmed_due_date < current_date
          and (s.billed - s.paid) > 0))
    and (p_min_amount     is null or (s.billed - s.paid) >= p_min_amount)
    and (p_max_amount     is null or (s.billed - s.paid) <= p_max_amount)
    and (p_search is null or (
          s.order_code   ilike '%' || p_search || '%' or
          s.doctor_name  ilike '%' || p_search || '%' or
          s.patient_name ilike '%' || p_search || '%' or
          s.lab_name     ilike '%' || p_search || '%' or
          s.service_name ilike '%' || p_search || '%'))
  group by s.doctor_id, s.doctor_name
  order by total_outstanding desc, s.doctor_name;
$$;


-- ── 5. Clinic: one page of orders ────────────────────────────────────────
drop function if exists public.clinic_payables_list(
  text, uuid, uuid, text, text[], date, date, boolean, numeric, numeric,
  text, integer, integer);
drop function if exists public.clinic_payables_list(
  text, uuid, uuid, text, text[], date, date, boolean, numeric, numeric,
  text[], text, integer, integer);

create function public.clinic_payables_list(
  p_search          text    default null,
  p_doctor_id       uuid    default null,
  p_lab_id          uuid    default null,
  p_recipient_type  text    default null,
  p_statuses        text[]  default null,
  p_date_from       date    default null,
  p_date_to         date    default null,
  p_overdue_only    boolean default false,
  p_min_amount      numeric default null,
  p_max_amount      numeric default null,
  p_order_statuses  text[]  default null,
  p_sort            text    default 'created_desc',
  p_limit           integer default 25,
  p_offset          integer default 0
)
returns table (
  order_id            uuid,
  order_code          text,
  order_status        text,
  doctor_id           uuid,
  doctor_name         text,
  lab_id              uuid,
  lab_name            text,
  patient_name        text,
  service_name        text,
  recipient_type      text,
  billed              numeric,
  paid_total          numeric,
  outstanding         numeric,
  payment_status      text,
  confirmed_due_date  date,
  requested_due_date  date,
  confirmed_due_time  time,
  requested_due_time  time,
  created_at          timestamptz,
  completed_at        timestamptz,
  total_count         bigint
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with scope as (
    select
      o.id,
      o.order_code,
      o.status,
      o.doctor_id,
      trim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, ''))    as doctor_name,
      o.lab_id,
      coalesce(nullif(o.lab_snapshot->>'public_name', ''), l.public_name, '') as lab_name,
      trim(coalesce(pt.first_name, '') || ' ' || coalesce(pt.last_name, ''))  as patient_name,
      coalesce(nullif(o.service_snapshot->>'name', ''), ls.name, '')          as service_name,
      o.invoice_recipient_type,
      coalesce(o.final_total, o.generated_total, 0) as billed,
      coalesce(o.paid_total, 0)                     as paid,
      o.payment_status,
      o.confirmed_due_date,
      o.requested_due_date,
      o.confirmed_due_time,
      o.requested_due_time,
      o.created_at,
      o.completed_at
    from public.orders o
    join public.doctor_profiles dp on dp.id = o.doctor_id
    join public.users u            on u.id = dp.user_id
    left join public.labs l          on l.id = o.lab_id
    left join public.lab_services ls on ls.id = o.lab_service_id
    left join public.patients pt     on pt.id = o.patient_id
    where o.clinic_id is not null
      and o.clinic_id = public.current_admin_clinic_id()
      -- 0056: a cancelled order owes nothing, estimate or not.
      and o.status <> 'CANCELLED'
  ),
  filtered as (
    select * from scope s
    where (p_doctor_id      is null or s.doctor_id = p_doctor_id)
      and (p_lab_id         is null or s.lab_id = p_lab_id)
      and (p_recipient_type is null or s.invoice_recipient_type::text = p_recipient_type)
      and (p_statuses       is null or s.payment_status::text = any(p_statuses))
      and (p_order_statuses is null or s.status::text = any(p_order_statuses))
      -- "Completed on", in Tbilisi. Not completed = no date = out of any range.
      and (p_date_from      is null
           or (s.completed_at at time zone 'Asia/Tbilisi')::date >= p_date_from)
      and (p_date_to        is null
           or (s.completed_at at time zone 'Asia/Tbilisi')::date <= p_date_to)
      and (not p_overdue_only or (
            s.confirmed_due_date is not null
            and s.confirmed_due_date < current_date
            and (s.billed - s.paid) > 0))
      and (p_min_amount     is null or (s.billed - s.paid) >= p_min_amount)
      and (p_max_amount     is null or (s.billed - s.paid) <= p_max_amount)
      and (p_search is null or (
            s.order_code   ilike '%' || p_search || '%' or
            s.doctor_name  ilike '%' || p_search || '%' or
            s.patient_name ilike '%' || p_search || '%' or
            s.lab_name     ilike '%' || p_search || '%' or
            s.service_name ilike '%' || p_search || '%'))
  )
  select
    f.id,
    f.order_code,
    f.status::text,
    f.doctor_id,
    f.doctor_name,
    f.lab_id,
    f.lab_name,
    f.patient_name,
    f.service_name,
    f.invoice_recipient_type::text,
    f.billed,
    f.paid,
    (f.billed - f.paid) as outstanding,
    f.payment_status::text,
    f.confirmed_due_date,
    f.requested_due_date,
    f.confirmed_due_time,
    f.requested_due_time,
    f.created_at,
    f.completed_at,
    count(*) over ()::bigint as total_count
  from filtered f
  order by
    case when p_sort = 'created_desc'     then f.created_at end desc,
    case when p_sort = 'created_asc'      then f.created_at end asc,
    case when p_sort = 'outstanding_desc' then (f.billed - f.paid) end desc,
    case when p_sort = 'outstanding_asc'  then (f.billed - f.paid) end asc,
    -- NULLS LAST on both due-date sorts: an order with no confirmed date is
    -- not "due first", it is simply not scheduled yet.
    case when p_sort = 'due_asc'          then f.confirmed_due_date end asc nulls last,
    case when p_sort = 'due_desc'         then f.confirmed_due_date end desc nulls last,
    -- Not completed has no finish date: last either way.
    case when p_sort = 'completed_desc'   then f.completed_at end desc nulls last,
    case when p_sort = 'completed_asc'    then f.completed_at end asc  nulls last,
    f.created_at desc
  limit  greatest(p_limit, 1)
  offset greatest(p_offset, 0);
$$;


-- ── 6. Grants ────────────────────────────────────────────────────────────
-- The helper: no client. The wrappers call it as its owner.
revoke all on function public._lab_receivables_rows(
  uuid, text, text, text, text[], date, date, boolean, numeric, numeric, text[]
) from public, anon, authenticated;

revoke all on function public.lab_receivables_by_customer(
  uuid, text, text, text, text[], date, date, boolean, numeric, numeric, text[]
) from public, anon;
grant execute on function public.lab_receivables_by_customer(
  uuid, text, text, text, text[], date, date, boolean, numeric, numeric, text[]
) to authenticated;

revoke all on function public.lab_receivables_list(
  uuid, text, text, text, text[], date, date, boolean, numeric, numeric,
  text[], text, integer, integer
) from public, anon;
grant execute on function public.lab_receivables_list(
  uuid, text, text, text, text[], date, date, boolean, numeric, numeric,
  text[], text, integer, integer
) to authenticated;

revoke all on function public.clinic_payables_by_doctor(
  text, uuid, uuid, text, text[], date, date, boolean, numeric, numeric, text[]
) from public, anon;
grant execute on function public.clinic_payables_by_doctor(
  text, uuid, uuid, text, text[], date, date, boolean, numeric, numeric, text[]
) to authenticated;

revoke all on function public.clinic_payables_list(
  text, uuid, uuid, text, text[], date, date, boolean, numeric, numeric,
  text[], text, integer, integer
) from public, anon;
grant execute on function public.clinic_payables_list(
  text, uuid, uuid, text, text[], date, date, boolean, numeric, numeric,
  text[], text, integer, integer
) to authenticated;

-- PostgREST reads the new signatures now rather than on its next reload.
notify pgrst, 'reload schema';


-- ---------------------------------------------------------------------------
-- Verify (every one should be true):
-- ---------------------------------------------------------------------------
--   -- One function per name: no overload left behind.
--   select proname, count(*) = 1 from pg_proc
--    where pronamespace = 'public'::regnamespace
--      and proname in ('_lab_receivables_rows', 'lab_receivables_by_customer',
--                      'lab_receivables_list', 'clinic_payables_by_doctor',
--                      'clinic_payables_list')
--    group by proname;                                   -- five rows, all true
--
--   select not has_function_privilege('authenticated',
--            'public._lab_receivables_rows(uuid,text,text,text,text[],date,date,boolean,numeric,numeric,text[])', 'execute')
--      and not has_function_privilege('anon',
--            'public.lab_receivables_list(uuid,text,text,text,text[],date,date,boolean,numeric,numeric,text[],text,integer,integer)', 'execute')
--      and has_function_privilege('authenticated',
--            'public.lab_receivables_list(uuid,text,text,text,text[],date,date,boolean,numeric,numeric,text[],text,integer,integer)', 'execute')
--      and has_function_privilege('authenticated',
--            'public.clinic_payables_list(text,uuid,uuid,text,text[],date,date,boolean,numeric,numeric,text[],text,integer,integer)', 'execute');
--
--   -- As a lab owner, in a transaction you roll back:
--   --   begin;
--   --   select set_config('request.jwt.claims', '{"sub":"<lab owner uuid>"}', true);
--   --   set local role authenticated;
--   --   select order_code, order_status, patient_name, completed_at, outstanding, total_count
--   --     from public.lab_receivables_list('<lab id>',
--   --            p_order_statuses => array['SENT_TO_CLINIC','COMPLETED'],
--   --            p_sort => 'completed_desc');           -- only those two statuses
--   --   select * from public.lab_receivables_by_customer('<lab id>',
--   --            p_order_statuses => array['COMPLETED'],
--   --            p_date_from => '2026-10-01', p_date_to => '2026-10-31');
--   --                                                 -- completed in October only
--   --   select * from public.lab_receivables_list('<another lab id>');
--   --                                                 -- ERROR: not_your_lab
--   --   select * from public._lab_receivables_rows('<lab id>');
--   --                                                 -- ERROR: permission denied
--   --   rollback;
--
--   -- As a clinic admin, the same way:
--   --   select order_code, order_status, completed_at, billed, outstanding
--   --     from public.clinic_payables_list(p_order_statuses => array['COMPLETED']);
--   --   select * from public.clinic_payables_by_doctor(p_order_statuses => array['SENT_TO_CLINIC']);
--   --   select count(*) = 0 from public.clinic_payables_list(p_limit => 500)
--   --    where order_status = 'CANCELLED';                -- true
--   --   -- every row's order has clinic_id = the admin's clinic (the RPC
--   --   -- scopes it; a doctor or lab owner calling it gets no rows)
--
--   -- The Tbilisi day: an order completed at 2026-11-04 21:30 UTC
--   -- (2026-11-05 01:30 in Tbilisi) is in a range of 2026-11-05 and not in
--   -- one of 2026-11-04.
--   select ('2026-11-04 21:30+00'::timestamptz at time zone 'Asia/Tbilisi')::date
--          = '2026-11-05';                               -- true
-- ---------------------------------------------------------------------------
