-- ---------------------------------------------------------------------------
-- 0024 — Finances for the clinic.
--
-- The lab has `lab_receivables_by_customer` / `lab_receivables_list`: money
-- owed *to* it. The clinic needs the mirror image — money its doctors owe out
-- to labs — with the dimension that matters on this side being the doctor
-- rather than the customer.
--
-- Both functions are SECURITY DEFINER for the same reason the lab's are: they
-- aggregate across rows the caller can read individually, and doing that under
-- RLS row-by-row is both slower and easy to get subtly wrong. Authorization is
-- therefore explicit and identical in both: the caller must be a clinic admin,
-- and every row is constrained to doctors linked to *their* clinic via
-- current_admin_clinic_id(). A caller who is not a clinic admin gets an empty
-- result, never another clinic's numbers.
--
-- Read-only by design. Recording a payment stays with the lab: it is the
-- creditor, and letting the debtor mark its own invoices paid would make
-- `paid_total` mean two different things depending on who wrote it.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1) Per-doctor rollup over the filtered set.
-- ---------------------------------------------------------------------------
create or replace function public.clinic_payables_by_doctor(
  p_search          text    default null,
  p_doctor_id       uuid    default null,
  p_lab_id          uuid    default null,
  p_recipient_type  text    default null,
  p_statuses        text[]  default null,
  p_date_from       date    default null,
  p_date_to         date    default null,
  p_overdue_only    boolean default false,
  p_min_amount      numeric default null,
  p_max_amount      numeric default null
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
      o.confirmed_due_date,
      o.payment_status,
      o.invoice_recipient_type,
      o.created_at,
      o.order_code,
      o.lab_id,
      coalesce(ls.name, '')                                                   as service_name,
      coalesce(l.public_name, '')                                             as lab_name,
      trim(coalesce(pt.first_name, '') || ' ' || coalesce(pt.last_name, ''))  as patient_name
    from public.orders o
    join public.doctor_profiles dp on dp.id = o.doctor_id
    join public.users u            on u.id = dp.user_id
    left join public.labs l         on l.id = o.lab_id
    left join public.lab_services ls on ls.id = o.lab_service_id
    left join public.patients pt     on pt.id = o.patient_id
    where dp.clinic_id is not null
      and dp.clinic_id = public.current_admin_clinic_id()
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
    and (p_date_from      is null or s.created_at >= p_date_from::timestamptz)
    and (p_date_to        is null or s.created_at < (p_date_to + 1)::timestamptz)
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

grant execute on function public.clinic_payables_by_doctor(
  text, uuid, uuid, text, text[], date, date, boolean, numeric, numeric
) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) One page of payable orders. `total_count` rides along on every row so the
--    paginator knows the filtered size without a second round trip — same
--    contract as lab_receivables_list.
-- ---------------------------------------------------------------------------
create or replace function public.clinic_payables_list(
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
  created_at          timestamptz,
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
      coalesce(l.public_name, '')                                             as lab_name,
      trim(coalesce(pt.first_name, '') || ' ' || coalesce(pt.last_name, ''))  as patient_name,
      coalesce(ls.name, '')                                                   as service_name,
      o.invoice_recipient_type,
      coalesce(o.final_total, o.generated_total, 0) as billed,
      coalesce(o.paid_total, 0)                     as paid,
      o.payment_status,
      o.confirmed_due_date,
      o.requested_due_date,
      o.created_at
    from public.orders o
    join public.doctor_profiles dp on dp.id = o.doctor_id
    join public.users u            on u.id = dp.user_id
    left join public.labs l          on l.id = o.lab_id
    left join public.lab_services ls on ls.id = o.lab_service_id
    left join public.patients pt     on pt.id = o.patient_id
    where dp.clinic_id is not null
      and dp.clinic_id = public.current_admin_clinic_id()
  ),
  filtered as (
    select * from scope s
    where (p_doctor_id      is null or s.doctor_id = p_doctor_id)
      and (p_lab_id         is null or s.lab_id = p_lab_id)
      and (p_recipient_type is null or s.invoice_recipient_type::text = p_recipient_type)
      and (p_statuses       is null or s.payment_status::text = any(p_statuses))
      and (p_date_from      is null or s.created_at >= p_date_from::timestamptz)
      and (p_date_to        is null or s.created_at < (p_date_to + 1)::timestamptz)
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
    f.created_at,
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
    f.created_at desc
  limit  greatest(p_limit, 1)
  offset greatest(p_offset, 0);
$$;

grant execute on function public.clinic_payables_list(
  text, uuid, uuid, text, text[], date, date, boolean, numeric, numeric, text, integer, integer
) to authenticated;
