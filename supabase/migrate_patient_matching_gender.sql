-- Migration: enforce patient deduplication server-side inside submit_order,
-- and update find_matching_patient to include gender in the comparison.
-- Run this once against the live database.

-- Replace the function with the new signature (adds p_gender parameter and
-- returns the gender column).  When p_dob is supplied all four fields must
-- match; when p_dob is NULL the date_of_birth column is ignored so that only
-- name + gender are compared.
create or replace function public.find_matching_patient(
  p_first text, p_last text, p_dob date, p_gender text
)
returns table (
  id uuid, first_name text, last_name text, date_of_birth date, gender text, created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select p.id, p.first_name, p.last_name, p.date_of_birth, p.gender, p.created_at
  from public.patients p
  where p.doctor_id = public.current_doctor_id()
    and lower(p.first_name) = lower(p_first)
    and lower(p.last_name)  = lower(p_last)
    and lower(p.gender)     = lower(p_gender)
    and (p_dob is null or p.date_of_birth = p_dob);
$$;

-- Drop the old 3-argument grant (it will error if already dropped; ignore).
-- Grant the new 4-argument signature.
do $$ begin
  revoke execute on function public.find_matching_patient(text, text, date) from authenticated;
exception when undefined_function or undefined_object then null;
end $$;
grant execute on function public.find_matching_patient(text, text, date, text) to authenticated;

-- Rebuild the index to cover gender as well.
drop index if exists public.patients_doctor_match_idx;
create index patients_doctor_match_idx
  on public.patients (doctor_id, lower(first_name), lower(last_name), lower(gender), date_of_birth);

-- Replace submit_order to auto-deduplicate patients instead of always
-- inserting a new row.  Only the patient-resolution block changes; the rest
-- of the function is identical to the previous version.
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
  p_parent_order_id         uuid default null
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
  v_p_first            text;
  v_p_last             text;
  v_p_dob              date;
  v_p_gender           text;
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

  select * into v_user_row from public.users where id = auth.uid();

  v_p_first  := p_patient->>'first_name';
  v_p_last   := p_patient->>'last_name';
  v_p_dob    := nullif(p_patient->>'date_of_birth', '')::date;
  v_p_gender := nullif(p_patient->>'gender', '');

  v_existing_pid := nullif(p_patient->>'existing_id', '')::uuid;
  if v_existing_pid is not null then
    -- Doctor explicitly chose an existing patient record.
    select id into v_patient_id from public.patients
      where id = v_existing_pid and doctor_id = v_doctor_id;
    if v_patient_id is null then
      raise exception 'Patient not found';
    end if;
  else
    -- Auto-deduplicate: reuse an existing patient whose name + gender match
    -- (and date of birth if one was provided).  When either side has a NULL
    -- gender we still treat it as a candidate match so that older records
    -- without a stored gender are not duplicated unnecessarily.
    select id into v_patient_id
    from public.patients
    where doctor_id = v_doctor_id
      and lower(first_name) = lower(v_p_first)
      and lower(last_name)  = lower(v_p_last)
      and (v_p_gender is null or gender is null or lower(gender) = lower(v_p_gender))
      and (v_p_dob is null or date_of_birth = v_p_dob)
    limit 1;

    if not found then
      insert into public.patients (doctor_id, first_name, last_name, date_of_birth, gender)
      values (v_doctor_id, v_p_first, v_p_last, v_p_dob, v_p_gender)
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

  insert into public.orders (
    doctor_id, lab_id, doctor_work_location_id, patient_id, patient_case_id, parent_order_id,
    lab_service_id, lab_form_version_id,
    status, requested_due_date, invoice_recipient_type,
    generated_total, rush_type, rush_value,
    work_location_snapshot, lab_snapshot, service_snapshot, invoice_recipient_snapshot
  ) values (
    v_doctor_id, p_lab_id, p_doctor_work_location_id, v_patient_id, p_continue_case_id, p_parent_order_id,
    p_lab_service_id, p_lab_form_version_id,
    'SUBMITTED', p_requested_due_date, p_invoice_recipient_type::public.invoice_recipient_type,
    p_generated_total, coalesce(p_rush_type, 'NONE')::public.rush_type, p_rush_value,
    to_jsonb(v_loc), to_jsonb(v_lab), to_jsonb(v_service), v_recipient_snapshot
  ) returning id into v_order_id;

  insert into public.order_answers (order_id, field_code, answer_json)
  select v_order_id, k, v from jsonb_each(coalesce(p_answers, '{}'::jsonb)) as t(k, v);

  return v_order_id;
end;
$$;
