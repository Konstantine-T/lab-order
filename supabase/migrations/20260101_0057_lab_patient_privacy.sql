-- ---------------------------------------------------------------------------
-- 0057: a lab sees "Irakli K." and a birth year, never the patient record.
--
-- Owner decision: a lab account cannot get a patient's full surname, date of
-- birth or gender, not even through the API. Doctors and clinic admins keep
-- the full record, unchanged. Enforced here, not in the client.
--
--   1. orders.patient_label ("Irakli K.", "ირაკლი ქ.") and
--      orders.patient_birth_year, written only by triggers from the order's
--      patient: on insert, on any write naming patient_id or either column
--      (so a client write to them is recomputed away), and when the patient
--      is renamed or their date of birth changes. Backfilled.
--   2. patients_lab_via_order (0009) is dropped: the lab reads no patient
--      rows at all. A lab owner still reads its OWN patients, the ones it
--      ordered for as a buying lab (0048), through patients_doctor_all; those
--      are its own records.
--   3. order_edits snapshots (edit_order's pre-edit state, which the lab's
--      edit review reads) are masked on write and backfilled: last_name
--      becomes its initial, date_of_birth the birth year, gender goes, and
--      the label is added.
--   4. The SECURITY DEFINER readers that handed the lab patient fields
--      (RLS does not apply to them) read the order's label instead:
--      _lab_receivables_rows (0056) and lab_projects (0055, now returning
--      patient_label / patient_birth_year and searching on the label).
--
-- The lab's other routes into patients, checked: none. The clinic's
-- (patients_clinic_select, clinic_payables_*) and the doctor's
-- (patients_doctor_all, find_matching_patient, submit / edit_order) are not
-- the lab's. Order snapshots carry no patient; notifications never name one
-- (0043); the Telegram chats do not either.
--
-- Ships with the client that reads patient_label: after this, a lab page
-- that still embeds patients(...) gets null.
--
-- REPLAY ORDER: 0009 and phase4-6.sql recreate patients_lab_via_order, 0055
-- the old lab_projects, 0056 the old _lab_receivables_rows. Re-run this file
-- after replaying any of them. Needs 0055 and 0056 first.
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regprocedure('public.lab_projects(text,integer,integer)') is null then
    raise exception '0057 needs 0055 (lab_projects) applied first';
  end if;
  if to_regprocedure('public._lab_receivables_rows(uuid,text,text,text,text[],date,date,boolean,numeric,numeric,text[])') is null then
    raise exception '0057 needs 0056 (finance filters) applied first';
  end if;
end $$;


-- ── 1. What the lab may see, on the order ───────────────────────────────
alter table public.orders
  add column if not exists patient_label      text,
  add column if not exists patient_birth_year smallint;

comment on column public.orders.patient_label is
  'The patient as a lab sees them: first name and the surname''s initial ("Irakli K."). '
  'Written only by triggers (0057); null without a patient.';
comment on column public.orders.patient_birth_year is
  'The patient''s birth year, the only part of the date of birth a lab sees. Trigger-written (0057).';

-- "Irakli K.": the first name, a space, the surname's first character and a
-- period. Only the first name without a surname; only "K." without a first
-- name; null with neither. Whitespace trimmed and collapsed.
create or replace function public._patient_label(p_first text, p_last text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
           when f = '' and l = '' then null
           when l = '' then f
           when f = '' then left(l, 1) || '.'
           else f || ' ' || left(l, 1) || '.'
         end
    from (select regexp_replace(btrim(coalesce(p_first, '')), '\s+', ' ', 'g') as f,
                 regexp_replace(btrim(coalesce(p_last,  '')), '\s+', ' ', 'g') as l) n;
$$;

-- Fills both from the order's patient. SECURITY DEFINER: it reads patients,
-- which a lab writing to an order can no longer read.
create or replace function public.tg_orders_patient_label()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.patient_label := null;
  new.patient_birth_year := null;
  if new.patient_id is not null then
    select public._patient_label(p.first_name, p.last_name),
           extract(year from p.date_of_birth)::smallint
      into new.patient_label, new.patient_birth_year
      from public.patients p
     where p.id = new.patient_id;
  end if;
  return new;
end $$;

drop trigger if exists orders_patient_label on public.orders;
create trigger orders_patient_label
  before insert or update of patient_id, patient_label, patient_birth_year on public.orders
  for each row execute function public.tg_orders_patient_label();

-- A renamed patient (or a corrected date of birth) relabels every order of
-- theirs, at every lab. SECURITY DEFINER: the doctor renaming may not be able
-- to update all of them under RLS.
create or replace function public.tg_patients_refresh_order_labels()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_label text := public._patient_label(new.first_name, new.last_name);
  v_year  smallint := extract(year from new.date_of_birth)::smallint;
begin
  update public.orders o
     set patient_label = v_label,
         patient_birth_year = v_year
   where o.patient_id = new.id
     and (o.patient_label is distinct from v_label
          or o.patient_birth_year is distinct from v_year);
  return null;
end $$;

drop trigger if exists patients_refresh_order_labels on public.patients;
create trigger patients_refresh_order_labels
  after update of first_name, last_name, date_of_birth on public.patients
  for each row
  when (new.first_name is distinct from old.first_name
        or new.last_name is distinct from old.last_name
        or new.date_of_birth is distinct from old.date_of_birth)
  execute function public.tg_patients_refresh_order_labels();

-- Backfill. orders_set_updated_at is held off for it, so every historic order
-- does not look edited today; one statement, so a failure re-enables it too.
do $$
declare
  v_toggle boolean := exists (
    select 1 from pg_trigger
     where tgrelid = 'public.orders'::regclass
       and tgname = 'orders_set_updated_at'
       and tgenabled <> 'D');
begin
  if v_toggle then
    execute 'alter table public.orders disable trigger orders_set_updated_at';
  end if;
  update public.orders o
     set patient_label = public._patient_label(p.first_name, p.last_name),
         patient_birth_year = extract(year from p.date_of_birth)::smallint
    from public.patients p
   where p.id = o.patient_id
     and (o.patient_label is distinct from public._patient_label(p.first_name, p.last_name)
          or o.patient_birth_year is distinct from extract(year from p.date_of_birth)::smallint);
  if v_toggle then
    execute 'alter table public.orders enable trigger orders_set_updated_at';
  end if;
end $$;


-- ── 2. Close the patients table to labs ─────────────────────────────────
drop policy if exists patients_lab_via_order on public.patients;


-- ── 3. Mask the edit snapshots ──────────────────────────────────────────
-- In snapshot_json.patient: last_name -> its initial ("K."), date_of_birth ->
-- birth_year, gender removed, label added. Idempotent: a masked snapshot
-- masks to itself (the initial of "K." is "K", and birth_year is kept when
-- there is no date left to take it from).
create or replace function public._mask_edit_snapshot(s jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select case
           when s is null or jsonb_typeof(s -> 'patient') is distinct from 'object' then s
           else jsonb_set(
             s, '{patient}',
             ((s -> 'patient') - 'last_name' - 'date_of_birth' - 'gender' - 'label' - 'birth_year')
             || jsonb_build_object(
                  'last_name',
                    case when btrim(coalesce(s -> 'patient' ->> 'last_name', '')) = '' then null
                         else left(btrim(s -> 'patient' ->> 'last_name'), 1) || '.' end,
                  'label',
                    public._patient_label(s -> 'patient' ->> 'first_name',
                                          s -> 'patient' ->> 'last_name'),
                  'birth_year',
                    coalesce(
                      extract(year from nullif(s -> 'patient' ->> 'date_of_birth', '')::date)::int,
                      nullif(s -> 'patient' ->> 'birth_year', '')::int)))
         end;
$$;

create or replace function public.tg_order_edits_mask_patient()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.snapshot_json := public._mask_edit_snapshot(new.snapshot_json);
  return new;
end $$;

drop trigger if exists order_edits_mask_patient on public.order_edits;
create trigger order_edits_mask_patient
  before insert or update of snapshot_json on public.order_edits
  for each row execute function public.tg_order_edits_mask_patient();

-- Backfill (close_doctor_input_on_edit fires on insert only).
update public.order_edits
   set snapshot_json = public._mask_edit_snapshot(snapshot_json)
 where snapshot_json is distinct from public._mask_edit_snapshot(snapshot_json);


-- ── 4a. Lab finances: the label (0056's body, patient_name re-sourced) ───
create or replace function public._lab_receivables_rows(
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
      -- 0057: what the lab may see of the patient; else a purchase's case
      -- reference (0048).
      coalesce(o.patient_label, nullif(trim(o.patient_reference), ''))
                                                  as patient_name,
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


-- ── 4b. Lab projects: the label and birth year, searched by the label ───
-- The return type changes, so drop and recreate (same arguments: no overload).
drop function if exists public.lab_projects(text, integer, integer);

create function public.lab_projects(
  p_search text    default null,
  p_limit  integer default 25,
  p_offset integer default 0
)
returns table (
  patient_id         uuid,
  patient_label      text,
  patient_birth_year smallint,
  doctor_name        text,
  from_lab           boolean,
  clinic_name        text,
  branch_name        text,
  city               text,
  order_count        integer,
  open_count         integer,
  first_order_at     timestamptz,
  last_order_at      timestamptz,
  last_status        public.order_status,
  total_count        integer
)
language sql
stable
security definer
set search_path = public
as $$
  with my_lab as (
    select l.id
      from public.labs l
     where l.owner_user_id = auth.uid()
     order by l.created_at, l.id
     limit 1
  ),
  needle as (
    -- '%...%' with the search's own wildcards escaped; null = no search.
    select case
             when btrim(coalesce(p_search, '')) = '' then null
             else '%' || replace(replace(replace(
                    regexp_replace(btrim(p_search), '\s+', ' ', 'g'),
                    '\', '\\'), '%', '\%'), '_', '\_') || '%'
           end as pat
  ),
  lab_orders as (
    select o.id,
           o.patient_id,
           o.patient_label,
           o.patient_birth_year,
           o.order_code,
           o.status,
           o.created_at,
           o.buyer_lab_id,
           nullif(btrim(concat_ws(' ',
             nullif(btrim(o.doctor_snapshot ->> 'first_name'), ''),
             nullif(btrim(o.doctor_snapshot ->> 'last_name'), ''))), '') as doctor_name,
           nullif(btrim(o.work_location_snapshot ->> 'clinic_name'), '') as clinic_name,
           nullif(btrim(o.work_location_snapshot ->> 'branch_name'), '') as branch_name,
           nullif(btrim(o.work_location_snapshot ->> 'city'), '')        as city
      from public.orders o
      join my_lab on my_lab.id = o.lab_id
     where o.patient_id is not null
       -- Hidden from the lab: in its trash or gone (0054), not cleared.
       and not exists (
         select 1 from public.order_trash t
          where t.order_id = o.id and t.side = 'LAB' and t.cleared_at is null
       )
  ),
  projects as (
    select lo.patient_id,
           count(*)::integer as order_count,
           (count(*) filter (where lo.status not in ('COMPLETED', 'CANCELLED')))::integer
             as open_count,
           min(lo.created_at) as first_order_at,
           max(lo.created_at) as last_order_at,
           coalesce(bool_or(
             n.pat is not null and (
               lo.order_code ilike n.pat
               or regexp_replace(lo.doctor_name, '\s+', ' ', 'g') ilike n.pat
               or regexp_replace(lo.clinic_name, '\s+', ' ', 'g') ilike n.pat
             )), false) as order_hit
      from lab_orders lo
      cross join needle n
     group by lo.patient_id
  ),
  latest as (
    select distinct on (lo.patient_id) lo.*
      from lab_orders lo
     order by lo.patient_id, lo.created_at desc, lo.id desc
  ),
  matched as (
    select pr.patient_id,
           la.patient_label,
           la.patient_birth_year,
           la.doctor_name,
           la.buyer_lab_id is not null as from_lab,
           la.clinic_name,
           la.branch_name,
           la.city,
           pr.order_count,
           pr.open_count,
           pr.first_order_at,
           pr.last_order_at,
           la.status as last_status
      from projects pr
      join latest la on la.patient_id = pr.patient_id
      cross join needle n
     -- 0057: the patient is found by what the lab sees, the label. Every
     -- order of a patient carries the same one (kept by trigger).
     where n.pat is null
        or pr.order_hit
        or la.patient_label ilike n.pat
  )
  select m.patient_id,
         m.patient_label,
         m.patient_birth_year,
         m.doctor_name,
         m.from_lab,
         m.clinic_name,
         m.branch_name,
         m.city,
         m.order_count,
         m.open_count,
         m.first_order_at,
         m.last_order_at,
         m.last_status,
         (count(*) over ())::integer as total_count
    from matched m
   order by m.last_order_at desc, m.patient_id
   limit  least(greatest(coalesce(p_limit, 25), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

comment on function public.lab_projects(text, integer, integer) is
  'The caller''s lab''s projects (5XVmpHyN, 0055; 0057: patient_label / patient_birth_year, never the '
  'patient record): one row per patient with orders at the lab, latest order''s doctor / clinic / '
  'status, counts, paged; LAB-trashed orders (0054) and orders without a patient left out.';

revoke all on function public.lab_projects(text, integer, integer) from public, anon;
grant execute on function public.lab_projects(text, integer, integer) to authenticated;


-- ── 5. Grants ───────────────────────────────────────────────────────────
-- Helpers and trigger functions: no client calls them (0043's rule).
revoke all on function public._patient_label(text, text) from public, anon, authenticated;
revoke all on function public._mask_edit_snapshot(jsonb) from public, anon, authenticated;
revoke all on function public.tg_orders_patient_label() from public, anon, authenticated;
revoke all on function public.tg_patients_refresh_order_labels() from public, anon, authenticated;
revoke all on function public.tg_order_edits_mask_patient() from public, anon, authenticated;

notify pgrst, 'reload schema';


-- ---------------------------------------------------------------------------
-- Verify (every one should be true):
-- ---------------------------------------------------------------------------
--   select public._patient_label('ირაკლი', 'ქოჩიაშვილი') = 'ირაკლი ქ.'
--      and public._patient_label(' Irakli ', ' kochiashvili ') = 'Irakli k.'
--      and public._patient_label('Irakli', '') = 'Irakli'
--      and public._patient_label('', '') is null;
--
--   -- Every order's label matches its patient; none without a patient has one.
--   select count(*) = 0 from public.orders o
--     left join public.patients p on p.id = o.patient_id
--    where o.patient_label is distinct from public._patient_label(p.first_name, p.last_name)
--       or o.patient_birth_year is distinct from extract(year from p.date_of_birth)::smallint;
--
--   select count(*) = 0 from pg_policies
--    where schemaname = 'public' and tablename = 'patients'
--      and policyname = 'patients_lab_via_order';
--
--   -- No snapshot keeps a surname, a date of birth or a gender.
--   select count(*) = 0 from public.order_edits
--    where snapshot_json -> 'patient' ?| array['date_of_birth', 'gender']
--       or length(snapshot_json -> 'patient' ->> 'last_name') > 2;
--
--   -- As a lab owner, in a transaction you roll back:
--   --   begin;
--   --   select set_config('request.jwt.claims', '{"sub":"<lab owner uuid>"}', true);
--   --   set local role authenticated;
--   --   select count(*) from public.patients;  -- 0 (or only the lab's own
--   --                                          -- patients from its purchases)
--   --   select order_code, patient_label, patient_birth_year
--   --     from public.orders where lab_id = '<lab id>' limit 5;
--   --   select patient_label, patient_birth_year from public.lab_projects();
--   --   select * from public.lab_projects('<a surname>');   -- no rows
--   --   rollback;
--
--   -- The trigger: rename a patient (as their doctor, or here as postgres)
--   -- and every order of theirs relabels; a client write to the label is
--   -- recomputed:
--   --   begin;
--   --   update public.orders set patient_label = 'X' where id = '<order id>';
--   --   select patient_label from public.orders where id = '<order id>';  -- not 'X'
--   --   rollback;
-- ---------------------------------------------------------------------------
