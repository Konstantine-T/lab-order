-- =============================================================================
-- Order lineage — "Continue project".
--
-- A doctor can start a new order that continues a COMPLETED one: same lab, same
-- patient, new service. We store a parent pointer (continues_order_id) on the
-- new order; the full lineage is walked by following this pointer up the
-- ancestry. Chains are always within one lab (enforced client-side AND in
-- submit_order below), so the lab can read every ancestor via existing RLS.
--
-- Fully idempotent — safe to re-run.
-- =============================================================================

-- Parent pointer. Nullable; most orders don't continue anything.
alter table public.orders
  add column if not exists continues_order_id uuid references public.orders(id);

create index if not exists orders_continues_idx
  on public.orders(continues_order_id);

comment on column public.orders.continues_order_id is
  'Parent order this one continues from (same lab + same doctor). Full lineage is walked by following this pointer up the ancestry.';

-- submit_order gains a trailing p_continues_order_id (defaulted last so older
-- callers keep working). We drop the previous 13-arg overload first: adding a
-- parameter creates a NEW overload rather than replacing, and two overloads
-- would make PostgREST's by-name resolution ambiguous.
drop function if exists public.submit_order(
  uuid, uuid, uuid, jsonb, uuid, text, date, text, numeric, jsonb, numeric, uuid, uuid
);

create or replace function public.submit_order(
  p_lab_id                  uuid,
  p_lab_service_id          uuid,
  p_doctor_work_location_id uuid,
  p_patient                 jsonb,
  p_lab_form_version_id     uuid,
  p_invoice_recipient_type  text,
  p_requested_due_date      date,
  p_rush_type               text,
  p_rush_value              numeric,
  p_answers                 jsonb,
  p_generated_total         numeric,
  p_continue_case_id        uuid default null,
  p_parent_order_id         uuid default null,
  p_continues_order_id      uuid default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_doctor_id          uuid;
  v_lab                public.labs;
  v_service            public.lab_services;
  v_loc                public.doctor_work_locations;
  v_user_row           public.users;
  v_patient_id         uuid;
  v_existing_pid       uuid;
  v_order_id           uuid;
  v_recipient_snapshot jsonb;
  v_doctor_snapshot    jsonb;
begin
  select dp.id into v_doctor_id from public.doctor_profiles dp where dp.user_id = auth.uid();
  if v_doctor_id is null then
    raise exception 'Only doctors can submit orders';
  end if;

  select * into v_lab from public.labs where id = p_lab_id;
  if not found or v_lab.approval_status <> 'APPROVED_ACTIVE' or not v_lab.is_active then
    raise exception 'Lab is not available for orders';
  end if;

  select * into v_service from public.lab_services where id = p_lab_service_id;
  if not found or v_service.lab_id <> v_lab.id or not v_service.is_active then
    raise exception 'Service is not available';
  end if;

  select * into v_loc from public.doctor_work_locations where id = p_doctor_work_location_id;
  if not found or v_loc.doctor_id <> v_doctor_id or v_loc.archived_at is not null then
    raise exception 'Work location is not available';
  end if;

  if not exists (
    select 1 from public.lab_form_versions v
    join public.lab_forms f on f.id = v.lab_form_id
    where v.id = p_lab_form_version_id
      and f.lab_id = v_lab.id
      and f.status = 'PUBLISHED'
  ) then
    raise exception 'Form version not found or not published';
  end if;

  -- Continuation guard: the parent must be the same doctor's order in the same
  -- lab, so a lineage chain never crosses labs.
  if p_continues_order_id is not null then
    if not exists (
      select 1 from public.orders o
      where o.id = p_continues_order_id
        and o.doctor_id = v_doctor_id
        and o.lab_id = p_lab_id
    ) then
      raise exception 'Continued order not found or not in the same lab';
    end if;
  end if;

  select * into v_user_row from public.users where id = auth.uid();

  v_existing_pid := nullif(p_patient->>'existing_id', '')::uuid;
  if v_existing_pid is not null then
    select id into v_patient_id from public.patients
      where id = v_existing_pid and doctor_id = v_doctor_id;
    if v_patient_id is null then
      raise exception 'Patient not found';
    end if;
  else
    select id into v_patient_id
    from public.patients
    where doctor_id = v_doctor_id
      and lower(first_name) = lower(p_patient->>'first_name')
      and lower(last_name)  = lower(p_patient->>'last_name')
    order by created_at asc
    limit 1;

    if not found then
      insert into public.patients (doctor_id, first_name, last_name, date_of_birth, gender)
      values (
        v_doctor_id,
        p_patient->>'first_name',
        p_patient->>'last_name',
        nullif(p_patient->>'date_of_birth', '')::date,
        nullif(p_patient->>'gender', '')
      )
      returning id into v_patient_id;
    end if;
  end if;

  if p_invoice_recipient_type = 'DOCTOR' then
    v_recipient_snapshot := jsonb_build_object(
      'type', 'DOCTOR',
      'name', v_user_row.first_name || ' ' || v_user_row.last_name,
      'email', v_user_row.email,
      'phone', v_user_row.phone
    );
  else
    v_recipient_snapshot := jsonb_build_object(
      'type', 'CLINIC',
      'name', v_loc.clinic_name,
      'branch', v_loc.branch_name,
      'address', v_loc.address,
      'city', v_loc.city,
      'identification_code', v_loc.clinic_identification_code,
      'invoice_email', v_loc.clinic_invoice_email
    );
  end if;

  v_doctor_snapshot := jsonb_build_object(
    'first_name', v_user_row.first_name,
    'last_name',  v_user_row.last_name,
    'email',      v_user_row.email,
    'phone',      v_user_row.phone
  );

  insert into public.orders (
    doctor_id, lab_id, doctor_work_location_id, patient_id, patient_case_id, parent_order_id,
    lab_service_id, lab_form_version_id,
    status, requested_due_date, invoice_recipient_type,
    generated_total, rush_type, rush_value,
    work_location_snapshot, lab_snapshot, service_snapshot, invoice_recipient_snapshot,
    doctor_snapshot, continues_order_id
  ) values (
    v_doctor_id, p_lab_id, p_doctor_work_location_id, v_patient_id, p_continue_case_id, p_parent_order_id,
    p_lab_service_id, p_lab_form_version_id,
    'SUBMITTED', p_requested_due_date, p_invoice_recipient_type::public.invoice_recipient_type,
    p_generated_total, coalesce(p_rush_type, 'NONE')::public.rush_type, p_rush_value,
    to_jsonb(v_loc), to_jsonb(v_lab), to_jsonb(v_service), v_recipient_snapshot,
    v_doctor_snapshot, p_continues_order_id
  ) returning id into v_order_id;

  insert into public.order_answers (order_id, field_code, answer_json)
  select v_order_id, k, v from jsonb_each(coalesce(p_answers, '{}'::jsonb)) as t(k, v);

  return v_order_id;
end $$;

grant execute on function public.submit_order(
  uuid, uuid, uuid, jsonb, uuid, text, date, text, numeric, jsonb, numeric, uuid, uuid, uuid
) to authenticated;
