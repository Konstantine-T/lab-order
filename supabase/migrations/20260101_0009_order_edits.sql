-- =============================================================================
-- Order editing + edit history.
--
-- Doctors can edit a submitted order any number of times (except COMPLETED /
-- CANCELLED). Each edit captures a full pre-edit snapshot so the lab can step
-- through history and see exactly what changed. The lab gets a dedicated
-- "edited orders" view and an attention flag it clears on review.
--
-- Fully idempotent — safe to re-run.
-- =============================================================================

-- 1a) Denormalized counters on orders. We keep them on the row (rather than
--     deriving from order_edits) so the lab's list/dashboard queries stay
--     trivial filters and sorts — no joins or aggregates needed.
alter table public.orders
  add column if not exists has_unreviewed_edits boolean not null default false;
alter table public.orders
  add column if not exists edit_count int not null default 0;
alter table public.orders
  add column if not exists last_edited_at timestamptz;

-- 1b) Edit history. One row per edit, holding the full pre-edit state.
create table if not exists public.order_edits (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.orders(id) on delete cascade,
  editor_user_id  uuid not null references public.users(id),
  reason_code     text not null check (reason_code in (
                    'CORRECTION','UNFORESEEN_LAB_INSTRUCTION','PATIENT_REASON',
                    'CONSTRUCTION_DEFECT','MY_MISTAKE','UNFORESEEN_EVENT')),
  comment         text,
  snapshot_json   jsonb not null,   -- full pre-edit state, captured server-side
  created_at      timestamptz not null default now()
);

create index if not exists order_edits_order_idx
  on public.order_edits(order_id, created_at desc);

-- 1c) RLS — participants (the order's doctor, the owning lab, or a platform
--     admin) can read. No insert policy: rows are written only inside the
--     security-definer edit_order RPC. Mirrors order_answers_participants.
alter table public.order_edits enable row level security;

drop policy if exists order_edits_participants on public.order_edits;
create policy order_edits_participants on public.order_edits
  for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (
          o.doctor_id = public.current_doctor_id()
          or public.current_user_owns_lab(o.lab_id)
          or public.current_user_role() = 'PLATFORM_ADMIN'
        )
    )
  );

grant select on public.order_edits to authenticated;

-- 1c-bis) Labs can read patients referenced by one of their own orders. The
-- edit-review diff needs the CURRENT patient to show the latest edit, and the
-- snapshots already expose historical patient data to the lab via order_edits,
-- so this just keeps the live view consistent with the history it can see.
drop policy if exists patients_lab_via_order on public.patients;
create policy patients_lab_via_order on public.patients
  for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.patient_id = patients.id
        and public.current_user_owns_lab(o.lab_id)
    )
  );

-- 1d) edit_order: validate, snapshot the CURRENT state, then mutate the live
--     rows. Lab/service/form-version/due-date/rush are intentionally not
--     editable — only patient, work location, invoice recipient, and answers.
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
  v_order              public.orders;
  v_loc                public.doctor_work_locations;
  v_existing_pid       uuid;
  v_patient_id         uuid;
  v_recipient_snapshot jsonb;
  v_snapshot           jsonb;
  v_comment            text;
begin
  v_doctor_id := public.current_doctor_id();
  if v_doctor_id is null then
    raise exception 'Only doctors can edit orders';
  end if;

  -- Must be the order's doctor.
  select * into v_order from public.orders
    where id = p_order_id and doctor_id = v_doctor_id;
  if not found then
    raise exception 'Order not found';
  end if;

  -- Editing is allowed in every status except the terminal ones.
  if v_order.status in ('COMPLETED','CANCELLED') then
    raise exception 'This order can no longer be edited';
  end if;

  -- Reason must be one of the allowed codes.
  if p_reason_code not in (
    'CORRECTION','UNFORESEEN_LAB_INSTRUCTION','PATIENT_REASON',
    'CONSTRUCTION_DEFECT','MY_MISTAKE','UNFORESEEN_EVENT'
  ) then
    raise exception 'Invalid reason code';
  end if;

  -- "Unforeseen event" requires a comment — mirror the client-side rule so the
  -- API can't be called around the UI.
  v_comment := coalesce(nullif(trim(p_comment), ''), null);
  if p_reason_code = 'UNFORESEEN_EVENT' and v_comment is null then
    raise exception 'A comment is required for this reason';
  end if;

  -- New work location must belong to the doctor and not be archived (same
  -- checks as submit_order).
  select * into v_loc from public.doctor_work_locations
    where id = p_doctor_work_location_id;
  if not found or v_loc.doctor_id <> v_doctor_id or v_loc.archived_at is not null then
    raise exception 'Work location is not available';
  end if;

  -- Snapshot the CURRENT live state BEFORE any mutation. answers default to an
  -- empty object when the order has none.
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

  -- Patient resolution — reuse submit_order's dedup-or-create logic. We
  -- re-point orders.patient_id rather than mutating the shared patient row,
  -- because the doctor may be correcting a typo or reassigning to a different
  -- person, and other orders reference that same patient row.
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

  -- Rebuild the snapshots that depend on the changed fields (same jsonb shapes
  -- as submit_order).
  if p_invoice_recipient_type = 'DOCTOR' then
    v_recipient_snapshot := (
      select jsonb_build_object(
        'type', 'DOCTOR',
        'name', u.first_name || ' ' || u.last_name,
        'email', u.email,
        'phone', u.phone
      )
      from public.users u where u.id = auth.uid()
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

  -- Update the live order. We intentionally do NOT touch final_total — the lab
  -- re-decides the price when it reviews the edit.
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

  -- Replace answers: upsert the new map, then drop any field that's gone.
  insert into public.order_answers (order_id, field_code, answer_json)
  select p_order_id, k, v from jsonb_each(coalesce(p_answers, '{}'::jsonb)) as t(k, v)
  on conflict (order_id, field_code) do update set answer_json = excluded.answer_json;

  delete from public.order_answers
  where order_id = p_order_id
    and field_code not in (
      select jsonb_object_keys(coalesce(p_answers, '{}'::jsonb))
    );

  -- Record the edit with the pre-edit snapshot.
  insert into public.order_edits (order_id, editor_user_id, reason_code, comment, snapshot_json)
  values (p_order_id, auth.uid(), p_reason_code, v_comment, v_snapshot);

  return p_order_id;
end $$;

grant execute on function public.edit_order(uuid, jsonb, uuid, text, jsonb, numeric, text, text) to authenticated;
