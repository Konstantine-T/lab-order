-- ============================================================================
-- Lab Order — Phase 4, 5, 6 schema.
-- Paste into Supabase SQL Editor and run once. Idempotent.
-- Prereq: phase 1–3 (supabase/all-in-one.sql) must already be applied.
-- ============================================================================

-- ---------- 1) Enums --------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'service_phase_type') then
    create type public.service_phase_type as enum ('TEMPORARY', 'FINAL', 'STANDALONE');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'form_status') then
    create type public.form_status as enum ('DRAFT', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'order_status') then
    create type public.order_status as enum (
      'SUBMITTED', 'RECEIVED', 'NEEDS_CLARIFICATION', 'IN_PROGRESS',
      'READY_FOR_DELIVERY', 'SENT_TO_CLINIC', 'RECEIVED_BY_CLINIC',
      'TRY_IN_PHASE', 'COMPLETED', 'CANCELLED'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'payment_status') then
    create type public.payment_status as enum ('UNPAID', 'PARTIALLY_PAID', 'PAID');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'invoice_recipient_type') then
    create type public.invoice_recipient_type as enum ('DOCTOR', 'CLINIC');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'rush_type') then
    create type public.rush_type as enum ('NONE', 'PERCENTAGE', 'FIXED_AMOUNT');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'pricing_model') then
    create type public.pricing_model as enum (
      'UNIT_BASED', 'FIXED_PRICE', 'MATERIAL_MODIFIER', 'MANUAL_QUOTE_REQUIRED'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'file_source') then
    create type public.file_source as enum ('ORDER_FORM', 'CHAT', 'ADMIN_UPLOAD');
  end if;
end $$;

-- ---------- 2) Tables -------------------------------------------------------

-- Platform form templates (seeded — see section 6)
create table if not exists public.platform_form_templates (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  description text,
  created_at  timestamptz not null default now()
);

create table if not exists public.platform_template_fields (
  id              uuid primary key default gen_random_uuid(),
  template_id     uuid not null references public.platform_form_templates(id) on delete cascade,
  field_code      text not null,
  field_type      text not null,
  label           text not null,
  default_settings jsonb not null default '{}'::jsonb,
  sort_order      int not null,
  created_at      timestamptz not null default now(),
  unique (template_id, field_code)
);

-- Lab services (Phase 4)
create table if not exists public.lab_services (
  id                       uuid primary key default gen_random_uuid(),
  lab_id                   uuid not null references public.labs(id) on delete cascade,
  name                     text not null,
  short_description        text,
  average_turnaround_days  int,
  average_turnaround_label text,
  cover_image_url          text,
  linked_lab_form_id       uuid,                            -- FK added later
  service_phase_type       public.service_phase_type not null default 'STANDALONE',
  is_active                boolean not null default true,
  sort_order               int not null default 0,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists lab_services_lab_idx on public.lab_services(lab_id);

-- Lab forms + versions (Phase 5)
create table if not exists public.lab_forms (
  id                  uuid primary key default gen_random_uuid(),
  lab_id              uuid not null references public.labs(id) on delete cascade,
  service_id          uuid references public.lab_services(id),
  template_id         uuid not null references public.platform_form_templates(id),
  title               text not null,
  status              public.form_status not null default 'DRAFT',
  current_version_id  uuid,                                  -- FK added later
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists public.lab_form_versions (
  id                          uuid primary key default gen_random_uuid(),
  lab_form_id                 uuid not null references public.lab_forms(id) on delete cascade,
  version_number              int not null,
  configuration_json          jsonb not null,
  pricing_configuration_json  jsonb not null,
  status                      public.form_status not null default 'DRAFT',
  created_at                  timestamptz not null default now(),
  unique (lab_form_id, version_number)
);

-- Late FKs (avoid chicken/egg)
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'lab_services_linked_form_fk'
  ) then
    alter table public.lab_services
      add constraint lab_services_linked_form_fk
      foreign key (linked_lab_form_id) references public.lab_forms(id);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'lab_forms_current_version_fk'
  ) then
    alter table public.lab_forms
      add constraint lab_forms_current_version_fk
      foreign key (current_version_id) references public.lab_form_versions(id);
  end if;
end $$;

-- Patients + cases (Phase 6)
create table if not exists public.patients (
  id            uuid primary key default gen_random_uuid(),
  doctor_id     uuid not null references public.doctor_profiles(id) on delete restrict,
  first_name    text not null,
  last_name     text not null,
  date_of_birth date,
  gender        text,
  created_at    timestamptz not null default now()
);

create index if not exists patients_doctor_match_idx
  on public.patients (doctor_id, lower(first_name), lower(last_name), date_of_birth);

create table if not exists public.patient_cases (
  id          uuid primary key default gen_random_uuid(),
  patient_id  uuid not null references public.patients(id) on delete restrict,
  doctor_id   uuid not null references public.doctor_profiles(id) on delete restrict,
  title       text,
  status      text not null default 'OPEN',
  created_at  timestamptz not null default now()
);

-- Orders + answers + files (Phase 6)
do $$ begin
  if not exists (select 1 from pg_class where relname = 'order_code_seq') then
    create sequence public.order_code_seq start with 1000;
  end if;
end $$;

create table if not exists public.orders (
  id                          uuid primary key default gen_random_uuid(),
  order_code                  text not null unique default ('ORD-' || nextval('public.order_code_seq')),
  doctor_id                   uuid not null references public.doctor_profiles(id),
  lab_id                      uuid not null references public.labs(id),
  doctor_work_location_id     uuid not null references public.doctor_work_locations(id),
  patient_id                  uuid not null references public.patients(id),
  patient_case_id             uuid references public.patient_cases(id),
  parent_order_id             uuid references public.orders(id),
  lab_service_id              uuid not null references public.lab_services(id),
  lab_form_version_id         uuid not null references public.lab_form_versions(id),
  status                      public.order_status not null default 'SUBMITTED',
  requested_due_date          date,
  confirmed_due_date          date,
  invoice_recipient_type      public.invoice_recipient_type not null,
  generated_total             numeric(12,2),
  final_total                 numeric(12,2),
  rush_type                   public.rush_type not null default 'NONE',
  rush_value                  numeric(12,2),
  paid_total                  numeric(12,2) not null default 0,
  payment_status              public.payment_status not null default 'UNPAID',
  pricing_needs_review        boolean not null default false,
  invoice_needs_revision      boolean not null default false,
  work_location_snapshot      jsonb not null,
  lab_snapshot                jsonb not null,
  service_snapshot            jsonb not null,
  invoice_recipient_snapshot  jsonb not null,
  cancelled_at                timestamptz,
  cancelled_by_user_id        uuid references public.users(id),
  cancellation_reason         text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index if not exists orders_lab_status_idx     on public.orders(lab_id, status);
create index if not exists orders_doctor_status_idx  on public.orders(doctor_id, status);
create index if not exists orders_due_date_idx       on public.orders(requested_due_date);

create table if not exists public.order_answers (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders(id) on delete cascade,
  field_code  text not null,
  answer_json jsonb not null,
  created_at  timestamptz not null default now(),
  unique (order_id, field_code)
);

create table if not exists public.order_files (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references public.orders(id),
  uploaded_by_user_id uuid not null references public.users(id),
  uploaded_by_role    public.user_role not null,
  storage_path        text not null,
  file_name           text not null,
  file_type           text not null,
  file_size_bytes     bigint not null,
  file_source         public.file_source not null,
  created_at          timestamptz not null default now()
);

create index if not exists order_files_order_idx on public.order_files(order_id);

-- ---------- 3) Triggers -----------------------------------------------------
drop trigger if exists lab_services_set_updated_at on public.lab_services;
create trigger lab_services_set_updated_at
  before update on public.lab_services
  for each row execute function public.tg_set_updated_at();

drop trigger if exists lab_forms_set_updated_at on public.lab_forms;
create trigger lab_forms_set_updated_at
  before update on public.lab_forms
  for each row execute function public.tg_set_updated_at();

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.tg_set_updated_at();

-- Lab form versions are immutable once created (a publish/edit creates a new
-- row). Enforce that.
create or replace function public.tg_lab_form_versions_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'lab_form_versions rows are immutable; create a new version instead';
end $$;

drop trigger if exists lab_form_versions_no_update on public.lab_form_versions;
create trigger lab_form_versions_no_update
  before update on public.lab_form_versions
  for each row execute function public.tg_lab_form_versions_immutable();

-- ---------- 4) RLS ----------------------------------------------------------
alter table public.platform_form_templates    enable row level security;
alter table public.platform_template_fields   enable row level security;
alter table public.lab_services               enable row level security;
alter table public.lab_forms                  enable row level security;
alter table public.lab_form_versions          enable row level security;
alter table public.patients                   enable row level security;
alter table public.patient_cases              enable row level security;
alter table public.orders                     enable row level security;
alter table public.order_answers              enable row level security;
alter table public.order_files                enable row level security;

-- platform_form_templates: read by anyone authenticated; admin all
drop policy if exists pft_read on public.platform_form_templates;
create policy pft_read on public.platform_form_templates
  for select to authenticated using (true);

drop policy if exists pft_admin on public.platform_form_templates;
create policy pft_admin on public.platform_form_templates
  for all to authenticated
  using (public.current_user_role() = 'PLATFORM_ADMIN')
  with check (public.current_user_role() = 'PLATFORM_ADMIN');

drop policy if exists ptf_read on public.platform_template_fields;
create policy ptf_read on public.platform_template_fields
  for select to authenticated using (true);

drop policy if exists ptf_admin on public.platform_template_fields;
create policy ptf_admin on public.platform_template_fields
  for all to authenticated
  using (public.current_user_role() = 'PLATFORM_ADMIN')
  with check (public.current_user_role() = 'PLATFORM_ADMIN');

-- lab_services: lab owner CRUD; public read for active services of approved labs;
-- admin all
drop policy if exists lab_services_owner_all on public.lab_services;
create policy lab_services_owner_all on public.lab_services
  for all to authenticated
  using (public.current_user_owns_lab(lab_id))
  with check (public.current_user_owns_lab(lab_id));

drop policy if exists lab_services_public_read on public.lab_services;
create policy lab_services_public_read on public.lab_services
  for select to anon, authenticated
  using (
    is_active = true
    and exists (
      select 1 from public.labs l
      where l.id = lab_id
        and l.approval_status = 'APPROVED_ACTIVE'
        and l.is_active = true
    )
  );

drop policy if exists lab_services_admin_all on public.lab_services;
create policy lab_services_admin_all on public.lab_services
  for all to authenticated
  using (public.current_user_role() = 'PLATFORM_ADMIN')
  with check (public.current_user_role() = 'PLATFORM_ADMIN');

-- lab_forms: lab owner CRUD; admin all; doctors don't read forms directly,
-- they read versions when filling an order
drop policy if exists lab_forms_owner_all on public.lab_forms;
create policy lab_forms_owner_all on public.lab_forms
  for all to authenticated
  using (public.current_user_owns_lab(lab_id))
  with check (public.current_user_owns_lab(lab_id));

drop policy if exists lab_forms_admin_all on public.lab_forms;
create policy lab_forms_admin_all on public.lab_forms
  for all to authenticated
  using (public.current_user_role() = 'PLATFORM_ADMIN')
  with check (public.current_user_role() = 'PLATFORM_ADMIN');

-- Doctors can read PUBLISHED forms attached to a public service so they can
-- discover the form when ordering.
drop policy if exists lab_forms_public_read on public.lab_forms;
create policy lab_forms_public_read on public.lab_forms
  for select to authenticated
  using (
    status = 'PUBLISHED'
    and exists (
      select 1 from public.labs l
      where l.id = lab_id and l.approval_status = 'APPROVED_ACTIVE' and l.is_active = true
    )
  );

-- lab_form_versions: lab owner can insert; nobody can update (trigger blocks).
-- Doctors can read versions linked from published forms (so they can render the form).
drop policy if exists lfv_owner_all on public.lab_form_versions;
create policy lfv_owner_all on public.lab_form_versions
  for all to authenticated
  using (
    exists (select 1 from public.lab_forms lf
            where lf.id = lab_form_id and public.current_user_owns_lab(lf.lab_id))
  )
  with check (
    exists (select 1 from public.lab_forms lf
            where lf.id = lab_form_id and public.current_user_owns_lab(lf.lab_id))
  );

drop policy if exists lfv_public_read on public.lab_form_versions;
create policy lfv_public_read on public.lab_form_versions
  for select to authenticated
  using (
    exists (
      select 1 from public.lab_forms lf
      join public.labs l on l.id = lf.lab_id
      where lf.id = lab_form_id
        and lf.status = 'PUBLISHED'
        and l.approval_status = 'APPROVED_ACTIVE'
        and l.is_active = true
    )
  );

drop policy if exists lfv_admin_all on public.lab_form_versions;
create policy lfv_admin_all on public.lab_form_versions
  for all to authenticated
  using (public.current_user_role() = 'PLATFORM_ADMIN')
  with check (public.current_user_role() = 'PLATFORM_ADMIN');

-- patients: doctor R/W own; admin read
drop policy if exists patients_doctor_all on public.patients;
create policy patients_doctor_all on public.patients
  for all to authenticated
  using (doctor_id = public.current_doctor_id())
  with check (doctor_id = public.current_doctor_id());

drop policy if exists patients_admin_select on public.patients;
create policy patients_admin_select on public.patients
  for select to authenticated
  using (public.current_user_role() = 'PLATFORM_ADMIN');

-- patient_cases: same as patients
drop policy if exists patient_cases_doctor_all on public.patient_cases;
create policy patient_cases_doctor_all on public.patient_cases
  for all to authenticated
  using (doctor_id = public.current_doctor_id())
  with check (doctor_id = public.current_doctor_id());

-- orders
drop policy if exists orders_doctor_select on public.orders;
create policy orders_doctor_select on public.orders
  for select to authenticated
  using (doctor_id = public.current_doctor_id());

drop policy if exists orders_doctor_update on public.orders;
create policy orders_doctor_update on public.orders
  for update to authenticated
  using (doctor_id = public.current_doctor_id() and status not in ('COMPLETED','CANCELLED'))
  with check (doctor_id = public.current_doctor_id());

-- Doctor inserts via the submit_order RPC (security definer) — no direct INSERT policy.

drop policy if exists orders_lab_select on public.orders;
create policy orders_lab_select on public.orders
  for select to authenticated
  using (public.current_user_owns_lab(lab_id));

drop policy if exists orders_lab_update on public.orders;
create policy orders_lab_update on public.orders
  for update to authenticated
  using (public.current_user_owns_lab(lab_id) and status not in ('COMPLETED','CANCELLED'))
  with check (public.current_user_owns_lab(lab_id));

drop policy if exists orders_admin_all on public.orders;
create policy orders_admin_all on public.orders
  for all to authenticated
  using (public.current_user_role() = 'PLATFORM_ADMIN')
  with check (public.current_user_role() = 'PLATFORM_ADMIN');

-- order_answers: readable by participants; insert via RPC (security definer)
drop policy if exists order_answers_participants on public.order_answers;
create policy order_answers_participants on public.order_answers
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

-- order_files: readable by participants; doctor can insert files for their own orders
drop policy if exists order_files_participants_select on public.order_files;
create policy order_files_participants_select on public.order_files
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

drop policy if exists order_files_doctor_insert on public.order_files;
create policy order_files_doctor_insert on public.order_files
  for insert to authenticated
  with check (
    uploaded_by_user_id = auth.uid()
    and exists (
      select 1 from public.orders o
      where o.id = order_id and o.doctor_id = public.current_doctor_id()
    )
  );

drop policy if exists order_files_lab_insert on public.order_files;
create policy order_files_lab_insert on public.order_files
  for insert to authenticated
  with check (
    uploaded_by_user_id = auth.uid()
    and exists (
      select 1 from public.orders o
      where o.id = order_id and public.current_user_owns_lab(o.lab_id)
    )
  );

-- ---------- 5) RPCs ---------------------------------------------------------

-- find_matching_patient: return existing patients matching first/last/dob.
create or replace function public.find_matching_patient(
  p_first text, p_last text, p_dob date
)
returns table (
  id uuid, first_name text, last_name text, date_of_birth date, created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select p.id, p.first_name, p.last_name, p.date_of_birth, p.created_at
  from public.patients p
  where p.doctor_id = public.current_doctor_id()
    and lower(p.first_name) = lower(p_first)
    and lower(p.last_name)  = lower(p_last)
    and (p.date_of_birth = p_dob or (p_dob is null and p.date_of_birth is null));
$$;

-- submit_order: atomically validate, snapshot, and insert an order + answers.
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
  v_doctor_id   uuid;
  v_lab         public.labs;
  v_service     public.lab_services;
  v_loc         public.doctor_work_locations;
  v_user_row    public.users;
  v_patient_id  uuid;
  v_existing_pid uuid;
  v_order_id    uuid;
  v_recipient_snapshot jsonb;
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
    select id into v_patient_id from public.patients
      where id = v_existing_pid and doctor_id = v_doctor_id;
    if v_patient_id is null then
      raise exception 'Patient not found';
    end if;
  else
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
end $$;

-- publish_lab_form: snapshot the form's draft into a new version and mark
-- both the version and the form as PUBLISHED.
create or replace function public.publish_lab_form(
  p_form_id uuid,
  p_configuration jsonb,
  p_pricing jsonb
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_form public.lab_forms;
  v_next_version int;
  v_version_id uuid;
begin
  select * into v_form from public.lab_forms where id = p_form_id;
  if not found then raise exception 'Form not found'; end if;
  if not public.current_user_owns_lab(v_form.lab_id) then
    raise exception 'Not your lab';
  end if;

  select coalesce(max(version_number), 0) + 1 into v_next_version
  from public.lab_form_versions where lab_form_id = p_form_id;

  insert into public.lab_form_versions
    (lab_form_id, version_number, configuration_json, pricing_configuration_json, status)
  values
    (p_form_id, v_next_version, p_configuration, p_pricing, 'PUBLISHED')
  returning id into v_version_id;

  update public.lab_forms
    set current_version_id = v_version_id, status = 'PUBLISHED'
    where id = p_form_id;

  return v_version_id;
end $$;

-- ---------- 6) Seed: platform form templates --------------------------------
do $$
declare
  v_zirconia_crown      uuid;
  v_surgical_guide      uuid;
begin
  -- Insert templates (idempotent on code)
  insert into public.platform_form_templates (code, name, description) values
    ('ZIRCONIA_CROWN',       'Zirconia Crown',         'Zirconia crowns / bridges')
  on conflict (code) do nothing;
  insert into public.platform_form_templates (code, name, description) values
    ('SURGICAL_GUIDE',       'Surgical Guide',         'Implant surgical guide')
  on conflict (code) do nothing;

  select id into v_zirconia_crown    from public.platform_form_templates where code = 'ZIRCONIA_CROWN';
  select id into v_surgical_guide    from public.platform_form_templates where code = 'SURGICAL_GUIDE';

  -- Helper to upsert template fields
  -- (Unique by template_id+field_code so re-running does not duplicate)
  insert into public.platform_template_fields (template_id, field_code, field_type, label, default_settings, sort_order) values
    -- Zirconia Crown
    (v_zirconia_crown,    'teeth',          'tooth_selection', 'Teeth (FDI)',           '{"affects_price": true}'::jsonb, 10),
    (v_zirconia_crown,    'shade',          'shade_picker',    'Shade',                 '{}'::jsonb, 20),
    (v_zirconia_crown,    'material',       'material_select', 'Material',              '{}'::jsonb, 30),
    (v_zirconia_crown,    'design_notes',   'textarea',        'Design notes',          '{}'::jsonb, 40),
    -- Surgical Guide
    (v_surgical_guide,    'implant_sites',  'text',            'Implant sites',         '{}'::jsonb, 10),
    (v_surgical_guide,    'design_notes',   'textarea',        'Design notes',          '{}'::jsonb, 20)
  on conflict (template_id, field_code) do nothing;
end $$;

-- ---------- 7) GRANTs -------------------------------------------------------
grant select, insert, update, delete on public.platform_form_templates    to authenticated;
grant select, insert, update, delete on public.platform_template_fields   to authenticated;
grant select, insert, update, delete on public.lab_services               to authenticated;
grant select on public.lab_services to anon;  -- public listing
grant select, insert, update, delete on public.lab_forms                  to authenticated;
grant select, insert, update, delete on public.lab_form_versions          to authenticated;
grant select, insert, update, delete on public.patients                   to authenticated;
grant select, insert, update, delete on public.patient_cases              to authenticated;
grant select, insert, update, delete on public.orders                     to authenticated;
grant select, insert, update, delete on public.order_answers              to authenticated;
grant select, insert, update, delete on public.order_files                to authenticated;
grant usage, select on sequence public.order_code_seq to authenticated;

grant execute on function public.find_matching_patient(text, text, date) to authenticated;
grant execute on function public.submit_order(uuid, uuid, uuid, jsonb, uuid, text, date, text, numeric, jsonb, numeric, uuid, uuid) to authenticated;
grant execute on function public.publish_lab_form(uuid, jsonb, jsonb) to authenticated;

-- ---------- 8) Storage bucket for order files -------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('order-files', 'order-files', false, 104857600)   -- 100 MB
on conflict (id) do nothing;

-- Allow participants of an order (doctor / lab owner / admin) to read its files.
-- Path convention: <lab_id>/<order_id>/<filename>
drop policy if exists "order-files: participants read" on storage.objects;
create policy "order-files: participants read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'order-files'
    and exists (
      select 1 from public.orders o
      where o.id::text = (string_to_array(name, '/'))[2]
        and (
          o.doctor_id = public.current_doctor_id()
          or public.current_user_owns_lab(o.lab_id)
          or public.current_user_role() = 'PLATFORM_ADMIN'
        )
    )
  );

-- Allow doctors to upload to their own orders.
drop policy if exists "order-files: doctor upload" on storage.objects;
create policy "order-files: doctor upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'order-files'
    and exists (
      select 1 from public.orders o
      where o.id::text = (string_to_array(name, '/'))[2]
        and o.doctor_id = public.current_doctor_id()
    )
  );

-- Allow lab owners to upload to orders they own.
drop policy if exists "order-files: lab upload" on storage.objects;
create policy "order-files: lab upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'order-files'
    and exists (
      select 1 from public.orders o
      where o.id::text = (string_to_array(name, '/'))[2]
        and public.current_user_owns_lab(o.lab_id)
    )
  );

-- ============================================================================
-- DONE.
-- ============================================================================
