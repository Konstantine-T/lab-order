-- ---------------------------------------------------------------------------
-- 0032 - an optional time on the due date.
--
-- The doctor picks a date and, optionally, a time. 13:30 means 13:30-14:30: a
-- one-hour window whose end is derived, never entered and never stored. The
-- lab confirms a time the same way beside its confirmed date.
--
-- WHY TWO NULLABLE `time` COLUMNS AND NOT A TYPE CHANGE
--   requested_due_date is read as a bare YYYY-MM-DD string in dozens of
--   places, including lexical >= / <= filters on the order lists and inside
--   the finance RPCs. Making it timestamptz breaks all of them at once.
--   It would also change a parameter type on submit_order, which creates the
--   PostgREST by-name overload ambiguity 0010 and 0023 both had to clean up.
--   And this app has no timezone handling at all - dayjs is loaded without the
--   utc and timezone plugins. "Come at 13:00" is a wall-clock statement; a
--   `time` column stores exactly that, where timestamptz would introduce UTC
--   conversion nothing here is built for.
--
-- WHY THE OLD SIGNATURES ARE DROPPED FIRST
--   Adding a parameter creates a second overload, it does not replace the
--   first. 0010's header records exactly this going wrong on submit_order.
--   The signatures below were read off the live database, not copied from the
--   migration files, and there was exactly one of each.
--
-- The bodies are pg_get_functiondef dumps of what was actually running, with
-- only the new parameter threaded through - so 0020's patient-name
-- normalization and 0031's force_new branch both survive.
--
-- Fully idempotent - safe to re-run.
-- ---------------------------------------------------------------------------

alter table public.orders
  add column if not exists requested_due_time time,
  add column if not exists confirmed_due_time time;

comment on column public.orders.requested_due_time is
  'Wall-clock start of the doctor''s requested one-hour window. NULL = no time '
  'requested, date only. The window end is always start + 1h and is never stored.';

comment on column public.orders.confirmed_due_time is
  'The lab''s confirmed start time, same rules as requested_due_time.';

-- ---------------------------------------------------------------------------
-- Drop the old arities before recreating, or every caller gets "could not
-- choose the best candidate function".
-- ---------------------------------------------------------------------------
drop function if exists public.submit_order(uuid, uuid, uuid, jsonb, uuid, text, date, text, numeric, jsonb, numeric, uuid, uuid, uuid);
drop function if exists public.clinic_submit_order(uuid, uuid, uuid, uuid, jsonb, uuid, text, date, text, numeric, jsonb, numeric, uuid, uuid, uuid);
drop function if exists public._submit_order_impl(uuid, uuid, uuid, uuid, jsonb, uuid, text, date, text, numeric, jsonb, numeric, uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public._submit_order_impl(p_doctor_id uuid, p_lab_id uuid, p_lab_service_id uuid, p_doctor_work_location_id uuid, p_patient jsonb, p_lab_form_version_id uuid, p_invoice_recipient_type text, p_requested_due_date date, p_rush_type text, p_rush_value numeric, p_answers jsonb, p_generated_total numeric, p_continue_case_id uuid, p_parent_order_id uuid, p_continues_order_id uuid, p_requested_due_time time DEFAULT NULL::time)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_doctor_id          uuid := p_doctor_id;
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
  -- The acting doctor's user row (for the doctor / recipient snapshots).
  select u.* into v_user_row
    from public.users u
    join public.doctor_profiles dp on dp.user_id = u.id
   where dp.id = v_doctor_id;
  if not found then
    raise exception 'Doctor not found';
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

  v_existing_pid := nullif(p_patient->>'existing_id', '')::uuid;
  if v_existing_pid is not null then
    select id into v_patient_id from public.patients
      where id = v_existing_pid and doctor_id = v_doctor_id;
    if v_patient_id is null then
      raise exception 'Patient not found';
    end if;
  elsif coalesce((p_patient->>'force_new')::boolean, false) then
    -- The doctor was shown the patient this name already matches and chose
    -- "create a new one" anyway. Two different people really do share a name,
    -- and without this branch that choice was unrepresentable: the client sent
    -- no existing_id, the match below ran regardless, and the order landed on
    -- the first patient of that name. The doctor's answer has to beat the
    -- heuristic that asked the question.
    insert into public.patients (doctor_id, first_name, last_name, date_of_birth, gender)
    values (
      v_doctor_id,
      public.patient_name_tidy(p_patient->>'first_name'),
      public.patient_name_tidy(p_patient->>'last_name'),
      nullif(p_patient->>'date_of_birth', '')::date,
      nullif(p_patient->>'gender', '')
    )
    returning id into v_patient_id;
  else
    -- Normalized on BOTH sides, so an already-stored padded name still matches.
    select id into v_patient_id
    from public.patients
    where doctor_id = v_doctor_id
      and public.patient_name_key(first_name) = public.patient_name_key(p_patient->>'first_name')
      and public.patient_name_key(last_name)  = public.patient_name_key(p_patient->>'last_name')
    order by created_at asc
    limit 1;

    if not found then
      -- Store the tidy form (case preserved) so future matches are exact and
      -- the record doesn't carry the doctor's stray spaces forever.
      insert into public.patients (doctor_id, first_name, last_name, date_of_birth, gender)
      values (
        v_doctor_id,
        public.patient_name_tidy(p_patient->>'first_name'),
        public.patient_name_tidy(p_patient->>'last_name'),
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
    doctor_snapshot, continues_order_id, requested_due_time
  ) values (
    v_doctor_id, p_lab_id, p_doctor_work_location_id, v_patient_id, p_continue_case_id, p_parent_order_id,
    p_lab_service_id, p_lab_form_version_id,
    'SUBMITTED', p_requested_due_date, p_invoice_recipient_type::public.invoice_recipient_type,
    p_generated_total, coalesce(p_rush_type, 'NONE')::public.rush_type, p_rush_value,
    to_jsonb(v_loc), to_jsonb(v_lab), to_jsonb(v_service), v_recipient_snapshot,
    v_doctor_snapshot, p_continues_order_id, p_requested_due_time
  ) returning id into v_order_id;

  insert into public.order_answers (order_id, field_code, answer_json)
  select v_order_id, k, v from jsonb_each(coalesce(p_answers, '{}'::jsonb)) as t(k, v);

  return v_order_id;
end $function$;

-- Grants do not survive a drop, so this has to be reapplied: the impl takes
-- the doctor id as an argument and the wrappers below are what authorize it.
revoke all on function public._submit_order_impl(
  uuid, uuid, uuid, uuid, jsonb, uuid, text, date, text, numeric, jsonb, numeric, uuid, uuid, uuid, time
) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_order(p_lab_id uuid, p_lab_service_id uuid, p_doctor_work_location_id uuid, p_patient jsonb, p_lab_form_version_id uuid, p_invoice_recipient_type text, p_requested_due_date date, p_rush_type text, p_rush_value numeric, p_answers jsonb, p_generated_total numeric, p_continue_case_id uuid DEFAULT NULL::uuid, p_parent_order_id uuid DEFAULT NULL::uuid, p_continues_order_id uuid DEFAULT NULL::uuid, p_requested_due_time time DEFAULT NULL::time)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_doctor_id uuid := public.current_doctor_id();
begin
  if v_doctor_id is null then
    raise exception 'Only doctors can submit orders';
  end if;
  return public._submit_order_impl(
    v_doctor_id, p_lab_id, p_lab_service_id, p_doctor_work_location_id, p_patient,
    p_lab_form_version_id, p_invoice_recipient_type, p_requested_due_date, p_rush_type,
    p_rush_value, p_answers, p_generated_total, p_continue_case_id, p_parent_order_id,
    p_continues_order_id, p_requested_due_time
  );
end $function$;

grant execute on function public.submit_order(
  uuid, uuid, uuid, jsonb, uuid, text, date, text, numeric, jsonb, numeric, uuid, uuid, uuid, time
) to authenticated;

CREATE OR REPLACE FUNCTION public.clinic_submit_order(p_doctor_id uuid, p_lab_id uuid, p_lab_service_id uuid, p_doctor_work_location_id uuid, p_patient jsonb, p_lab_form_version_id uuid, p_invoice_recipient_type text, p_requested_due_date date, p_rush_type text, p_rush_value numeric, p_answers jsonb, p_generated_total numeric, p_continue_case_id uuid DEFAULT NULL::uuid, p_parent_order_id uuid DEFAULT NULL::uuid, p_continues_order_id uuid DEFAULT NULL::uuid, p_requested_due_time time DEFAULT NULL::time)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if public.current_admin_clinic_id() is null then
    raise exception 'Only clinic admins can create orders for doctors';
  end if;
  if not public.can_act_for_doctor(p_doctor_id) then
    raise exception 'This doctor is not in your clinic';
  end if;
  return public._submit_order_impl(
    p_doctor_id, p_lab_id, p_lab_service_id, p_doctor_work_location_id, p_patient,
    p_lab_form_version_id, p_invoice_recipient_type, p_requested_due_date, p_rush_type,
    p_rush_value, p_answers, p_generated_total, p_continue_case_id, p_parent_order_id,
    p_continues_order_id, p_requested_due_time
  );
end $function$;

grant execute on function public.clinic_submit_order(
  uuid, uuid, uuid, uuid, jsonb, uuid, text, date, text, numeric, jsonb, numeric, uuid, uuid, uuid, time
) to authenticated;

-- ---------------------------------------------------------------------------
-- Verify (every one should be true):
-- ---------------------------------------------------------------------------
--   select count(*) = 2 from information_schema.columns
--     where table_name='orders'
--       and column_name in ('requested_due_time','confirmed_due_time');
--   -- exactly one arity of each, or PostgREST cannot choose:
--   select count(*) = 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--     where n.nspname='public' and p.proname='submit_order';
--   select count(*) = 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--     where n.nspname='public' and p.proname='clinic_submit_order';
--   select count(*) = 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--     where n.nspname='public' and p.proname='_submit_order_impl';
--   -- and the impl must still be unreachable from the client:
--   select not has_function_privilege('authenticated',
--     (select oid from pg_proc where proname='_submit_order_impl'), 'execute');
-- ---------------------------------------------------------------------------
