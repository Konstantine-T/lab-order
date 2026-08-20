-- =============================================================================
-- Patient dedup: normalize names everywhere they're compared.
--
-- THE BUG: matching was `lower(first_name) = lower(p_first)` — case-insensitive
-- but nothing else. Type "გივი " once (trailing space, trivially easy on a
-- phone keyboard) and "გივი" the next time and the names are NOT equal, so:
--   * find_matching_patient returns nothing → the wizard's "is this the same
--     patient?" dialog never fires, and
--   * the server-side auto-dedup finds nothing → it inserts a second patient.
-- Identical DOB doesn't save you, because DOB is deliberately not part of the
-- match (name-only is an intentional product decision — unchanged here).
--
-- THE FIX: one normalization rule, used by every comparison. Two helpers so the
-- rule lives in exactly one place and the call sites can't drift apart — that
-- drift is precisely what caused this bug:
--
--   patient_name_tidy(t) -> storage form: trimmed, internal runs of whitespace
--                           collapsed to one space, ORIGINAL CASE PRESERVED
--                           (these are human names; we display them).
--   patient_name_key(t)  -> comparison key: lower(patient_name_tidy(t)).
--
-- INVARIANT: find_matching_patient, _submit_order_impl (and therefore
-- clinic_submit_order) and edit_order must ALL compare with patient_name_key.
-- The client normalizes identically before sending — see normalizeName() in
-- src/features/doctor/orderCreate/patientName.ts.
--
-- Note both sides of every comparison are normalized, so patients already
-- stored with padded names start matching immediately. No data migration is
-- required; supabase/cleanup-patient-duplicates.sql tidies + merges the rows
-- that were already duplicated, and is optional and owner-run.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) The rule, in one place.
-- ---------------------------------------------------------------------------
-- IMMUTABLE: depends only on its input, so it's safe in indexes later if this
-- ever needs one. STRICT would return null for null, which would break the
-- `= ` comparisons; coalesce to '' instead so a missing name matches nothing
-- rather than silently matching everything.
create or replace function public.patient_name_tidy(p_name text)
returns text
language sql
immutable
as $$
  select btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
$$;

create or replace function public.patient_name_key(p_name text)
returns text
language sql
immutable
as $$
  select lower(public.patient_name_tidy(p_name));
$$;

-- ---------------------------------------------------------------------------
-- 2) The wizard's live lookup.
-- ---------------------------------------------------------------------------
-- Same 4-arg signature: p_dob / p_gender are still accepted and still ignored,
-- so no coordinated client deploy is needed.
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
    and public.patient_name_key(p.first_name) = public.patient_name_key(p_first)
    and public.patient_name_key(p.last_name)  = public.patient_name_key(p_last)
  order by p.created_at asc
  limit 1;
$$;

grant execute on function public.find_matching_patient(text, text, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) The server-side guard, for both the doctor and clinic submit paths.
-- ---------------------------------------------------------------------------
-- Only the patient block changes; every other statement is copied verbatim
-- from migration 0014 (which is the runtime-winning definition).
create or replace function public._submit_order_impl(
  p_doctor_id               uuid,
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
  p_continue_case_id        uuid,
  p_parent_order_id         uuid,
  p_continues_order_id      uuid
)
returns uuid
language plpgsql security definer set search_path = public as $$
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

-- `create or replace` keeps existing privileges, but re-assert the revoke so a
-- fresh apply on a clean database can't leave this callable by clients. It does
-- NO authorization of its own (it trusts p_doctor_id) — see migration 0014.
revoke all on function public._submit_order_impl(
  uuid, uuid, uuid, uuid, jsonb, uuid, text, date, text, numeric, jsonb, numeric, uuid, uuid, uuid
) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) edit_order — the same blind spot.
-- ---------------------------------------------------------------------------
-- Not mentioned in the bug report, but it carries a byte-identical copy of the
-- dedup block: renaming a patient while editing an order could mint a duplicate
-- exactly the same way. Patched by replacing just those two statements, in
-- place, so the rest of the function keeps whatever 0014 defined.
create or replace function public.edit_order(
  p_order_id                uuid,
  p_patient                 jsonb,
  p_doctor_work_location_id uuid,
  p_invoice_recipient_type  text,
  p_answers                 jsonb,
  p_generated_total         numeric,
  p_reason_code             text,
  p_comment                 text
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_doctor_id          uuid;
  v_doctor_user        public.users;
  v_order              public.orders;
  v_loc                public.doctor_work_locations;
  v_existing_pid       uuid;
  v_patient_id         uuid;
  v_recipient_snapshot jsonb;
  v_snapshot           jsonb;
  v_comment            text;
begin
  -- Load the order, then authorize: the order's doctor, or a clinic admin the
  -- doctor is linked to.
  select * into v_order from public.orders where id = p_order_id;
  if not found then
    raise exception 'Order not found';
  end if;
  if not public.can_act_for_doctor(v_order.doctor_id) then
    raise exception 'You are not allowed to edit this order';
  end if;
  v_doctor_id := v_order.doctor_id;

  select u.* into v_doctor_user
    from public.users u
    join public.doctor_profiles dp on dp.user_id = u.id
   where dp.id = v_doctor_id;

  if v_order.status in ('COMPLETED','CANCELLED') then
    raise exception 'This order can no longer be edited';
  end if;

  if p_reason_code not in (
    'CORRECTION','UNFORESEEN_LAB_INSTRUCTION','PATIENT_REASON',
    'CONSTRUCTION_DEFECT','MY_MISTAKE','UNFORESEEN_EVENT'
  ) then
    raise exception 'Invalid reason code';
  end if;

  v_comment := coalesce(nullif(trim(p_comment), ''), null);
  if p_reason_code = 'UNFORESEEN_EVENT' and v_comment is null then
    raise exception 'A comment is required for this reason';
  end if;

  select * into v_loc from public.doctor_work_locations
    where id = p_doctor_work_location_id;
  if not found or v_loc.doctor_id <> v_doctor_id or v_loc.archived_at is not null then
    raise exception 'Work location is not available';
  end if;

  v_snapshot := jsonb_build_object(
    'patient', (
      select jsonb_build_object(
        'id', p.id,
        'first_name', p.first_name,
        'last_name', p.last_name,
        'date_of_birth', p.date_of_birth,
        'gender', p.gender
      )
      from public.patients p where p.id = v_order.patient_id
    ),
    'doctor_work_location_id', v_order.doctor_work_location_id,
    'work_location_snapshot', v_order.work_location_snapshot,
    'invoice_recipient_type', v_order.invoice_recipient_type,
    'invoice_recipient_snapshot', v_order.invoice_recipient_snapshot,
    'requested_due_date', v_order.requested_due_date,
    'rush_type', v_order.rush_type,
    'rush_value', v_order.rush_value,
    'generated_total', v_order.generated_total,
    'answers', coalesce(
      (select jsonb_object_agg(field_code, answer_json)
       from public.order_answers where order_id = p_order_id),
      '{}'::jsonb
    )
  );

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
      and public.patient_name_key(first_name) = public.patient_name_key(p_patient->>'first_name')
      and public.patient_name_key(last_name)  = public.patient_name_key(p_patient->>'last_name')
    order by created_at asc
    limit 1;

    if not found then
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
      'name', v_doctor_user.first_name || ' ' || v_doctor_user.last_name,
      'email', v_doctor_user.email,
      'phone', v_doctor_user.phone
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

  update public.orders set
    patient_id                 = v_patient_id,
    doctor_work_location_id    = p_doctor_work_location_id,
    invoice_recipient_type     = p_invoice_recipient_type::public.invoice_recipient_type,
    work_location_snapshot     = to_jsonb(v_loc),
    invoice_recipient_snapshot = v_recipient_snapshot,
    generated_total            = p_generated_total,
    has_unreviewed_edits       = true,
    edit_count                 = edit_count + 1,
    last_edited_at             = now()
  where id = p_order_id;

  insert into public.order_answers (order_id, field_code, answer_json)
  select p_order_id, k, v from jsonb_each(coalesce(p_answers, '{}'::jsonb)) as t(k, v)
  on conflict (order_id, field_code) do update set answer_json = excluded.answer_json;

  delete from public.order_answers
  where order_id = p_order_id
    and field_code not in (
      select jsonb_object_keys(coalesce(p_answers, '{}'::jsonb))
    );

  insert into public.order_edits (order_id, editor_user_id, reason_code, comment, snapshot_json)
  values (p_order_id, auth.uid(), p_reason_code, v_comment, v_snapshot);

  return p_order_id;
end $$;

grant execute on function public.edit_order(uuid, jsonb, uuid, text, jsonb, numeric, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Verify: every one of these should return true.
-- ---------------------------------------------------------------------------
--   select public.patient_name_key('  გივი   ') = public.patient_name_key('გივი');
--   select public.patient_name_tidy('  Giv i  ') = 'Giv i';
--   select pg_get_functiondef(oid) like '%patient_name_key%'
--     from pg_proc where proname = 'find_matching_patient';
--   select pg_get_functiondef(oid) like '%patient_name_key%'
--     from pg_proc where proname = '_submit_order_impl';
--   select pg_get_functiondef(oid) like '%patient_name_key%'
--     from pg_proc where proname = 'edit_order';
