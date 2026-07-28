-- ============================================================================
-- Lab finances / receivables — Phase 10 slice (payments + debt tracking).
--
-- Model (agreed in design):
--   * A receivable = a non-cancelled order once the lab has confirmed a
--     final_total. Outstanding = final_total - paid_total.
--   * Payments are recorded per order as a single "amount paid" number.
--   * payment_status is DERIVED, never trusted from the client.
--   * "Customer" = the billed party: the doctor for DOCTOR-billed orders, the
--     clinic for CLINIC-billed orders (grouped by a stable key).
--
-- No new tables — reuses orders.final_total / paid_total / payment_status.
--
-- Server-aggregated (Approach B): grouping, filtering, sums and pagination all
-- happen in SQL so the browser never loads the whole order list.
--
-- Run in Supabase SQL Editor. Idempotent — safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Speed up the receivable scan (lab's non-cancelled, priced orders).
-- ---------------------------------------------------------------------------
create index if not exists orders_lab_receivables_idx
  on public.orders (lab_id)
  where status <> 'CANCELLED' and final_total is not null;

-- ---------------------------------------------------------------------------
-- record_payment — set the total amount paid on one order.
--
-- SECURITY DEFINER so it works even on terminal (COMPLETED) orders, which the
-- lab's normal non-terminal UPDATE policy would block. The lab must own the
-- order's lab. The amount is clamped to [0, final_total] and the status is
-- derived here (client is never trusted).
-- ---------------------------------------------------------------------------
create or replace function public.record_payment(p_order_id uuid, p_amount_paid numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order  public.orders%rowtype;
  v_amount numeric;
  v_status public.payment_status;
begin
  select * into v_order from public.orders where id = p_order_id;
  if v_order.id is null then
    raise exception 'order_not_found';
  end if;
  if not public.current_user_owns_lab(v_order.lab_id) then
    raise exception 'not_your_lab';
  end if;
  if v_order.status = 'CANCELLED' then
    raise exception 'order_cancelled';
  end if;
  if v_order.final_total is null then
    raise exception 'no_final_price';
  end if;

  -- Clamp to [0, final_total]; this is the absolute paid-to-date for the order.
  v_amount := least(greatest(coalesce(p_amount_paid, 0), 0), v_order.final_total);

  if v_amount <= 0 then
    v_status := 'UNPAID';
  elsif v_amount < v_order.final_total then
    v_status := 'PARTIALLY_PAID';
  else
    v_status := 'PAID';
  end if;

  update public.orders
     set paid_total     = v_amount,
         payment_status = v_status,
         updated_at     = now()
   where id = p_order_id;
end $$;

-- ---------------------------------------------------------------------------
-- _lab_receivables_rows — the single source of truth for the filtered set.
--
-- Applies every filter and computes the derived columns (outstanding, the
-- customer key/name, live payment_status). The two public functions below
-- select from this, so filter logic lives in exactly one place.
-- ---------------------------------------------------------------------------
create or replace function public._lab_receivables_rows(
  p_lab_id         uuid,
  p_search         text    default null,
  p_recipient_type text    default null,   -- 'DOCTOR' | 'CLINIC' | null (both)
  p_customer_id    text    default null,   -- drill into one customer
  p_statuses       text[]  default null,   -- subset of UNPAID/PARTIALLY_PAID/PAID
  p_date_from      date    default null,   -- order date (created_at) >=
  p_date_to        date    default null,   -- order date (created_at) <=
  p_overdue_only   boolean default false,  -- confirmed due date past & still owed
  p_min_amount     numeric default null,   -- outstanding >=
  p_max_amount     numeric default null    -- outstanding <=
)
returns table (
  order_id           uuid,
  order_code         text,
  order_status       text,
  customer_type      text,
  customer_id        text,
  customer_name      text,
  doctor_name        text,
  service_name       text,
  final_total        numeric,
  paid_total         numeric,
  outstanding        numeric,
  payment_status     text,
  confirmed_due_date date,
  requested_due_date date,
  created_at         timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
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
      o.final_total                               as final_total,
      o.paid_total                                as paid_total,
      greatest(o.final_total - o.paid_total, 0)   as outstanding,
      case when o.paid_total <= 0                 then 'UNPAID'
           when o.paid_total < o.final_total      then 'PARTIALLY_PAID'
           else 'PAID' end                        as payment_status,
      o.confirmed_due_date                        as confirmed_due_date,
      o.requested_due_date                        as requested_due_date,
      o.created_at                                as created_at
    from public.orders o
    where o.lab_id = p_lab_id
      and o.status <> 'CANCELLED'
      and o.final_total is not null
  )
  select b.order_id, b.order_code, b.order_status, b.customer_type, b.customer_id,
         b.customer_name, b.doctor_name, b.service_name, b.final_total, b.paid_total,
         b.outstanding, b.payment_status, b.confirmed_due_date, b.requested_due_date,
         b.created_at
  from base b
  where (p_search is null or p_search = ''
         or b.order_code ilike '%' || p_search || '%'
         or b.customer_name ilike '%' || p_search || '%')
    and (p_recipient_type is null or b.customer_type = p_recipient_type)
    and (p_customer_id is null or b.customer_id = p_customer_id)
    and (p_statuses is null or b.payment_status = any(p_statuses))
    and (p_date_from is null or b.created_at::date >= p_date_from)
    and (p_date_to is null or b.created_at::date <= p_date_to)
    and (not coalesce(p_overdue_only, false)
         or (b.confirmed_due_date is not null
             and b.confirmed_due_date < current_date
             and b.outstanding > 0))
    and (p_min_amount is null or b.outstanding >= p_min_amount)
    and (p_max_amount is null or b.outstanding <= p_max_amount);
end $$;

-- ---------------------------------------------------------------------------
-- lab_receivables_by_customer — per-customer rollup over the filtered set.
-- The customer count is small, so the client sums these rows for grand totals.
-- ---------------------------------------------------------------------------
create or replace function public.lab_receivables_by_customer(
  p_lab_id         uuid,
  p_search         text    default null,
  p_recipient_type text    default null,
  p_customer_id    text    default null,
  p_statuses       text[]  default null,
  p_date_from      date    default null,
  p_date_to        date    default null,
  p_overdue_only   boolean default false,
  p_min_amount     numeric default null,
  p_max_amount     numeric default null
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
set search_path = public
as $$
  select r.customer_type,
         r.customer_id,
         max(r.customer_name)  as customer_name,
         count(*)              as order_count,
         sum(r.final_total)    as total_billed,
         sum(r.paid_total)     as total_paid,
         sum(r.outstanding)    as total_outstanding
  from public._lab_receivables_rows(
         p_lab_id, p_search, p_recipient_type, p_customer_id, p_statuses,
         p_date_from, p_date_to, p_overdue_only, p_min_amount, p_max_amount) r
  group by r.customer_type, r.customer_id
  order by sum(r.outstanding) desc;
$$;

-- ---------------------------------------------------------------------------
-- lab_receivables_list — the paginated, sorted order rows. total_count is the
-- full filtered size (window count) so the client can paginate.
-- ---------------------------------------------------------------------------
create or replace function public.lab_receivables_list(
  p_lab_id         uuid,
  p_search         text    default null,
  p_recipient_type text    default null,
  p_customer_id    text    default null,
  p_statuses       text[]  default null,
  p_date_from      date    default null,
  p_date_to        date    default null,
  p_overdue_only   boolean default false,
  p_min_amount     numeric default null,
  p_max_amount     numeric default null,
  p_sort           text    default 'created_desc',
  p_limit          int     default 25,
  p_offset         int     default 0
)
returns table (
  order_id           uuid,
  order_code         text,
  order_status       text,
  customer_type      text,
  customer_id        text,
  customer_name      text,
  doctor_name        text,
  service_name       text,
  final_total        numeric,
  paid_total         numeric,
  outstanding        numeric,
  payment_status     text,
  confirmed_due_date date,
  requested_due_date date,
  created_at         timestamptz,
  total_count        bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with rows as (
    select * from public._lab_receivables_rows(
      p_lab_id, p_search, p_recipient_type, p_customer_id, p_statuses,
      p_date_from, p_date_to, p_overdue_only, p_min_amount, p_max_amount)
  )
  select r.*, count(*) over() as total_count
  from rows r
  order by
    case when p_sort = 'created_asc'      then r.created_at end asc  nulls last,
    case when p_sort = 'created_desc'     then r.created_at end desc nulls last,
    case when p_sort = 'outstanding_desc' then r.outstanding end desc nulls last,
    case when p_sort = 'outstanding_asc'  then r.outstanding end asc  nulls last,
    case when p_sort = 'due_asc'          then r.confirmed_due_date end asc  nulls last,
    case when p_sort = 'due_desc'         then r.confirmed_due_date end desc nulls last,
    r.created_at desc
  limit  greatest(coalesce(p_limit, 25), 0)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
grant execute on function public.record_payment(uuid, numeric) to authenticated;
grant execute on function public._lab_receivables_rows(
  uuid, text, text, text, text[], date, date, boolean, numeric, numeric) to authenticated;
grant execute on function public.lab_receivables_by_customer(
  uuid, text, text, text, text[], date, date, boolean, numeric, numeric) to authenticated;
grant execute on function public.lab_receivables_list(
  uuid, text, text, text, text[], date, date, boolean, numeric, numeric, text, int, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Smoke test (optional): replace <LAB_ID> with your lab's id.
--   select * from public.lab_receivables_by_customer('<LAB_ID>');
--   select * from public.lab_receivables_list('<LAB_ID>', p_limit => 10);
-- ---------------------------------------------------------------------------
