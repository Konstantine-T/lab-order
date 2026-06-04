-- =============================================================================
-- Patient deduplication fix.
--
-- Two RPC rewrites:
--   1. find_matching_patient — now matches on first + last name only
--      (case-insensitive). DOB and gender are ignored. This makes the wizard's
--      match dialog catch duplicates even when the doctor hasn't filled in
--      every demographic field, which was the main source of duplicates.
--   2. submit_order — restores the pre-snapshot dedup logic that was lost
--      during the doctor_snapshot rewrite. When the doctor doesn't explicitly
--      pick an existing patient, we now look for one by name first and only
--      insert a new row if no match exists.
--
-- Both functions are `create or replace` so this migration is idempotent.
-- =============================================================================

-- find_matching_patient: name-only matching.
-- We keep the same 4-param signature so the wizard's RPC call doesn't need a
-- coordinated deploy — p_dob and p_gender are accepted but ignored.
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
  order by p.created_at asc
  limit 1;
$$;

grant execute on function public.find_matching_patient(text, text, date, text) to authenticated;

-- submit_order: doctor-snapshot version with dedup restored.
-- Combines the snapshot columns from add-doctor-snapshot.sql with the
-- name-only dedup logic. The patient block is the only thing that differs from
-- add-doctor-snapshot.sql — everything else is copied verbatim.
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

  select * into v_user_row from public.users where id = auth.uid();

  v_existing_pid := nullif(p_patient->>'existing_id', '')::uuid;
  if v_existing_pid is not null then
    -- Doctor explicitly chose an existing patient record in the wizard.
    select id into v_patient_id from public.patients
      where id = v_existing_pid and doctor_id = v_doctor_id;
    if v_patient_id is null then
      raise exception 'Patient not found';
    end if;
  else
    -- Auto-dedup: name-only, case-insensitive. We do this server-side so it
    -- works even if the wizard's match dialog was dismissed or never fired.
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
    doctor_snapshot
  ) values (
    v_doctor_id, p_lab_id, p_doctor_work_location_id, v_patient_id, p_continue_case_id, p_parent_order_id,
    p_lab_service_id, p_lab_form_version_id,
    'SUBMITTED', p_requested_due_date, p_invoice_recipient_type::public.invoice_recipient_type,
    p_generated_total, coalesce(p_rush_type, 'NONE')::public.rush_type, p_rush_value,
    to_jsonb(v_loc), to_jsonb(v_lab), to_jsonb(v_service), v_recipient_snapshot,
    v_doctor_snapshot
  ) returning id into v_order_id;

  insert into public.order_answers (order_id, field_code, answer_json)
  select v_order_id, k, v from jsonb_each(coalesce(p_answers, '{}'::jsonb)) as t(k, v);

  return v_order_id;
end $$;
