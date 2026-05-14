# Database Design — Supabase / Postgres

Source of truth for schema, RLS, storage, and triggers. Tracks PRD §19.

## 1. Conventions

- All tables have `id uuid primary key default gen_random_uuid()`, `created_at timestamptz default now()`.
- Mutable tables also get `updated_at timestamptz default now()` + a trigger to maintain it.
- Enums live as Postgres `CREATE TYPE` (not `text` with check constraints) — better TS generation.
- JSONB for snapshots, form answers, and pricing config. Validate shape at write time in the application or via Postgres functions.
- Soft delete via `is_active boolean` or `archived_at timestamptz` where the PRD requires retention. **No hard deletes** for orders, invoices, files, payments, reviews.
- Foreign keys always `on delete restrict` for financial/audit data; `cascade` only for clearly child rows (e.g. `order_answers` → `orders`).

## 2. Enums

```sql
create type user_role as enum ('DOCTOR', 'LAB_MAIN_ADMIN', 'PLATFORM_ADMIN', 'CLINIC_ADMIN');
create type account_status as enum ('ACTIVE', 'SUSPENDED');
create type lab_approval_status as enum ('PENDING_APPROVAL', 'CHANGES_REQUESTED', 'APPROVED_ACTIVE', 'REJECTED', 'SUSPENDED');
create type service_phase_type as enum ('TEMPORARY', 'FINAL', 'STANDALONE');
create type form_status as enum ('DRAFT', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED');
create type order_status as enum (
  'SUBMITTED', 'RECEIVED', 'NEEDS_CLARIFICATION', 'IN_PROGRESS',
  'READY_FOR_DELIVERY', 'SENT_TO_CLINIC', 'RECEIVED_BY_CLINIC',
  'TRY_IN_PHASE', 'COMPLETED', 'CANCELLED'
);
create type payment_status as enum ('UNPAID', 'PARTIALLY_PAID', 'PAID');
create type invoice_recipient_type as enum ('DOCTOR', 'CLINIC');
create type invoice_status as enum ('ISSUED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED', 'NEEDS_REVISION');
create type payment_method as enum ('CASH', 'BANK_TRANSFER', 'CARD', 'OTHER');
create type message_type as enum ('USER', 'SYSTEM');
create type review_display_mode as enum ('DOCTOR_NAME', 'DOCTOR_NAME_CLINIC', 'DOCTOR_NAME_BRANCH', 'VERIFIED_DOCTOR', 'ANONYMOUS');
create type review_status as enum ('PUBLISHED', 'REPORTED_HIDDEN', 'REMOVED');
create type try_in_feedback as enum ('APPROVED', 'CORRECTION_NEEDED', 'REMAKE_NEEDED');
create type pricing_model as enum ('UNIT_BASED', 'FIXED_PRICE', 'MATERIAL_MODIFIER', 'MANUAL_QUOTE_REQUIRED');
create type rush_type as enum ('NONE', 'PERCENTAGE', 'FIXED_AMOUNT');
create type billing_target_type as enum ('DOCTOR', 'CLINIC', 'LAB');
create type billing_basis as enum ('SENT_ORDERS', 'RECEIVED_ORDERS');
create type billing_period_unit as enum ('MONTHLY');
create type platform_invoice_status as enum ('GENERATED', 'APPROVED_SENT', 'PARTIALLY_PAID', 'PAID', 'CANCELLED', 'DISPUTED');
create type file_source as enum ('ORDER_FORM', 'CHAT', 'ADMIN_UPLOAD');
```

## 3. Core Tables

### 3.1 Identity

```sql
-- Mirror table for auth.users; we need extra columns and want stable FKs.
create table public.users (
  id            uuid primary key references auth.users(id) on delete cascade,
  role          user_role not null,
  first_name    text not null,
  last_name     text not null,
  email         text not null unique,
  phone         text,
  account_status account_status not null default 'ACTIVE',
  preferred_lang text not null default 'en' check (preferred_lang in ('en','ka','ru')),
  preferred_color_mode text not null default 'system' check (preferred_color_mode in ('light','dark','system')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.doctor_profiles (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null unique references public.users(id) on delete cascade,
  personal_id_number  text not null,
  specialty           text,
  license_number      text,
  profile_photo_url   text,
  created_at          timestamptz not null default now()
);

create table public.doctor_work_locations (
  id                       uuid primary key default gen_random_uuid(),
  doctor_id                uuid not null references public.doctor_profiles(id) on delete cascade,
  clinic_name              text not null,
  branch_name              text,
  address                  text not null,
  city                     text not null,
  clinic_identification_code text,
  clinic_invoice_email     text,
  phone                    text,
  is_default               boolean not null default false,
  archived_at              timestamptz,
  created_at               timestamptz not null default now()
);
create unique index doctor_work_locations_one_default_per_doctor
  on public.doctor_work_locations(doctor_id) where is_default and archived_at is null;
```

### 3.2 Labs

```sql
create table public.labs (
  id                    uuid primary key default gen_random_uuid(),
  owner_user_id         uuid not null references public.users(id),
  public_name           text not null,
  legal_name            text,
  identification_code   text,
  legal_address         text,
  working_address       text,
  city                  text,
  country               text,
  contact_person_name   text,
  contact_phone         text,
  contact_email         text,
  bank_name             text,
  bank_account_iban     text,
  payment_instructions  text,
  logo_url              text,
  short_description     text,
  working_hours         jsonb,
  approval_status       lab_approval_status not null default 'PENDING_APPROVAL',
  approval_note         text,                       -- platform admin note when requesting changes/rejecting
  approved_at           timestamptz,
  approved_by_user_id   uuid references public.users(id),
  is_active             boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Function used by both UI and a CHECK constraint: profile complete enough to submit?
create or replace function public.lab_profile_is_complete(l public.labs)
returns boolean language sql immutable as $$
  select l.public_name is not null
     and l.legal_name is not null
     and l.identification_code is not null
     and l.legal_address is not null
     and l.working_address is not null
     and l.city is not null
     and l.country is not null
     and l.contact_person_name is not null
     and l.contact_phone is not null
     and l.contact_email is not null
     and l.bank_name is not null
     and l.bank_account_iban is not null
     and l.payment_instructions is not null;
$$;
```

### 3.3 Services & Forms

```sql
create table public.platform_form_templates (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,        -- e.g. 'ZIRCONIA_CROWN'
  name        text not null,
  description text,
  created_at  timestamptz not null default now()
);

create table public.platform_template_fields (
  id              uuid primary key default gen_random_uuid(),
  template_id     uuid not null references public.platform_form_templates(id) on delete cascade,
  field_code      text not null,
  field_type      text not null,           -- 'text', 'tooth_selection', 'shade_picker', 'material_select', 'number', 'file', 'checkbox', etc.
  label           text not null,
  default_settings jsonb not null default '{}'::jsonb,
  sort_order      int not null,
  created_at      timestamptz not null default now(),
  unique (template_id, field_code)
);

create table public.lab_services (
  id                       uuid primary key default gen_random_uuid(),
  lab_id                   uuid not null references public.labs(id) on delete cascade,
  name                     text not null,
  short_description        text,
  average_turnaround_days  int,
  average_turnaround_label text,
  cover_image_url          text,
  linked_lab_form_id       uuid,           -- FK added after lab_forms exists
  service_phase_type       service_phase_type not null default 'STANDALONE',
  is_active                boolean not null default true,
  sort_order               int not null default 0,
  created_at               timestamptz not null default now()
);

create table public.lab_forms (
  id                  uuid primary key default gen_random_uuid(),
  lab_id              uuid not null references public.labs(id) on delete cascade,
  service_id          uuid references public.lab_services(id),
  template_id         uuid not null references public.platform_form_templates(id),
  title               text not null,
  status              form_status not null default 'DRAFT',
  current_version_id  uuid,                -- FK added after lab_form_versions exists
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.lab_services
  add constraint lab_services_form_fk foreign key (linked_lab_form_id) references public.lab_forms(id);

create table public.lab_form_versions (
  id                       uuid primary key default gen_random_uuid(),
  lab_form_id              uuid not null references public.lab_forms(id) on delete cascade,
  version_number           int not null,
  configuration_json       jsonb not null,    -- field-level: enabled, required, helper_text, default, affects_price, visible_to_doctor
  pricing_configuration_json jsonb not null,  -- model, unit_price, fixed_price, material_modifiers[], rush settings
  status                   form_status not null default 'DRAFT',
  created_at               timestamptz not null default now(),
  unique (lab_form_id, version_number)
);

alter table public.lab_forms
  add constraint lab_forms_current_version_fk foreign key (current_version_id) references public.lab_form_versions(id);
```

### 3.4 Patients

```sql
create table public.patients (
  id            uuid primary key default gen_random_uuid(),
  doctor_id     uuid not null references public.doctor_profiles(id) on delete restrict,
  first_name    text not null,
  last_name     text not null,
  date_of_birth date,
  gender        text,
  created_at    timestamptz not null default now()
);
create index patients_doctor_match_idx
  on public.patients (doctor_id, lower(first_name), lower(last_name), date_of_birth);

create table public.patient_cases (
  id          uuid primary key default gen_random_uuid(),
  patient_id  uuid not null references public.patients(id) on delete restrict,
  doctor_id   uuid not null references public.doctor_profiles(id) on delete restrict,
  title       text,
  status      text not null default 'OPEN',
  created_at  timestamptz not null default now()
);
```

### 3.5 Orders

```sql
create sequence order_code_seq start with 1000;

create table public.orders (
  id                          uuid primary key default gen_random_uuid(),
  order_code                  text not null unique default ('ORD-' || nextval('order_code_seq')),
  doctor_id                   uuid not null references public.doctor_profiles(id),
  lab_id                      uuid not null references public.labs(id),
  doctor_work_location_id     uuid not null references public.doctor_work_locations(id),
  patient_id                  uuid not null references public.patients(id),
  patient_case_id             uuid references public.patient_cases(id),
  parent_order_id             uuid references public.orders(id),
  lab_service_id              uuid not null references public.lab_services(id),
  lab_form_version_id         uuid not null references public.lab_form_versions(id),
  status                      order_status not null default 'SUBMITTED',
  requested_due_date          date,
  confirmed_due_date          date,
  invoice_recipient_type      invoice_recipient_type not null,

  -- Pricing
  generated_total             numeric(12,2),         -- estimated at submission
  final_total                 numeric(12,2),         -- lab-confirmed
  rush_type                   rush_type not null default 'NONE',
  rush_value                  numeric(12,2),         -- amount or percent depending on rush_type
  paid_total                  numeric(12,2) not null default 0,
  debt_total                  numeric(12,2) generated always as (coalesce(final_total, 0) - paid_total) stored,
  payment_status              payment_status not null default 'UNPAID',

  -- Flags
  pricing_needs_review        boolean not null default false,
  invoice_needs_revision      boolean not null default false,

  -- Snapshots (PRD §20.3)
  work_location_snapshot      jsonb not null,
  lab_snapshot                jsonb not null,
  service_snapshot            jsonb not null,
  invoice_recipient_snapshot  jsonb not null,        -- doctor or clinic billing info frozen at submission

  -- Try-in
  try_in_feedback             try_in_feedback,
  try_in_comment              text,

  cancelled_at                timestamptz,
  cancelled_by_user_id        uuid references public.users(id),
  cancellation_reason         text,

  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index orders_lab_status_idx on public.orders(lab_id, status);
create index orders_doctor_status_idx on public.orders(doctor_id, status);
create index orders_due_date_idx on public.orders(requested_due_date);

create table public.order_answers (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders(id) on delete cascade,
  field_code   text not null,
  answer_json  jsonb not null,
  created_at   timestamptz not null default now(),
  unique (order_id, field_code)
);

create table public.order_files (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references public.orders(id) on delete restrict,
  uploaded_by_user_id uuid not null references public.users(id),
  uploaded_by_role    user_role not null,
  storage_path        text not null,        -- key in supabase storage
  file_name           text not null,
  file_type           text not null,        -- mime
  file_size_bytes     bigint not null,
  file_source         file_source not null,
  created_at          timestamptz not null default now()
);
```

### 3.6 Chat & Notifications

```sql
create table public.order_messages (
  id                   uuid primary key default gen_random_uuid(),
  order_id             uuid not null references public.orders(id) on delete cascade,
  sender_user_id       uuid references public.users(id),         -- null for SYSTEM
  sender_role          user_role,
  message_type         message_type not null default 'USER',
  -- USER messages: free text typed by a user
  message_text         text,
  -- SYSTEM messages: structured for runtime translation per viewer's language.
  -- Frontend renders via t(`system.${system_message_key}`, system_message_params).
  -- Examples:
  --   STATUS_CHANGED       params: {"from":"SUBMITTED","to":"RECEIVED"}
  --   FINAL_PRICE_SET      params: {"amount":1200,"currency":"GEL"}
  --   INVOICE_GENERATED    params: {"invoice_number":"INV-100123"}
  --   PAYMENT_RECORDED     params: {"amount":500,"method":"BANK_TRANSFER"}
  --   FILE_UPLOADED        params: {"file_name":"upper-jaw.stl","by_role":"DOCTOR"}
  system_message_key   text,
  system_message_params jsonb,
  attachment_storage_path text,
  linked_change_log_id uuid,
  created_at           timestamptz not null default now(),
  check (
    (message_type = 'USER'   and message_text is not null and system_message_key is null) or
    (message_type = 'SYSTEM' and system_message_key is not null)
  )
);
create index order_messages_order_idx on public.order_messages(order_id, created_at);

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  order_id   uuid references public.orders(id) on delete cascade,
  type       text not null,
  title      text not null,
  body       text,
  is_read    boolean not null default false,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index notifications_user_unread_idx on public.notifications(user_id, is_read, created_at desc);
```

### 3.7 Audit

```sql
create table public.order_change_logs (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references public.orders(id) on delete cascade,
  changed_by_user_id  uuid references public.users(id),
  changed_by_role     user_role,
  change_type         text not null,        -- 'STATUS', 'PRICE', 'FIELD', 'INVOICE', 'PAYMENT', 'FILE', 'CANCEL'
  field_name          text,
  old_value_json      jsonb,
  new_value_json      jsonb,
  reason              text,
  linked_message_id   uuid references public.order_messages(id),
  created_at          timestamptz not null default now()
);
```

### 3.8 Invoices & Payments (Dental work)

```sql
create sequence invoice_number_seq start with 100000;

create table public.invoices (
  id                          uuid primary key default gen_random_uuid(),
  invoice_number              text not null unique default ('INV-' || nextval('invoice_number_seq')),
  order_id                    uuid not null references public.orders(id),
  recipient_type              invoice_recipient_type not null,
  recipient_name              text not null,
  recipient_identification_code text,
  recipient_email             text,
  lab_id                      uuid not null references public.labs(id),
  doctor_id                   uuid not null references public.doctor_profiles(id),

  -- Frozen snapshots
  lab_snapshot                jsonb not null,
  recipient_snapshot          jsonb not null,
  line_items_snapshot         jsonb not null,        -- service lines, qty, unit price, modifiers, rush, total

  final_total                 numeric(12,2) not null,
  paid_total                  numeric(12,2) not null default 0,
  debt_total                  numeric(12,2) generated always as (final_total - paid_total) stored,
  status                      invoice_status not null default 'ISSUED',
  superseded_by_invoice_id    uuid references public.invoices(id),
  cancellation_reason         text,
  issued_at                   timestamptz not null default now(),
  cancelled_at                timestamptz
);

create table public.payment_events (
  id                   uuid primary key default gen_random_uuid(),
  order_id             uuid not null references public.orders(id),
  invoice_id           uuid references public.invoices(id),
  lab_id               uuid not null references public.labs(id),
  doctor_id            uuid not null references public.doctor_profiles(id),
  amount               numeric(12,2) not null check (amount > 0),
  currency             text not null default 'GEL',
  payment_method       payment_method not null,
  payment_date         date not null,
  recorded_by_user_id  uuid not null references public.users(id),
  note                 text,
  created_at           timestamptz not null default now()
);
create index payment_events_order_idx on public.payment_events(order_id, payment_date);
```

### 3.9 Reviews

```sql
create table public.reviews (
  id                uuid primary key default gen_random_uuid(),
  doctor_id         uuid not null references public.doctor_profiles(id),
  lab_id            uuid not null references public.labs(id),
  order_id          uuid not null references public.orders(id),
  rating            int not null check (rating between 1 and 5),
  comment           text,
  display_mode      review_display_mode not null,
  status            review_status not null default 'PUBLISHED',
  reported_by_lab_user_id uuid references public.users(id),
  reported_at       timestamptz,
  moderated_by_user_id uuid references public.users(id),
  moderated_at      timestamptz,
  moderation_note   text,
  created_at        timestamptz not null default now(),
  unique (order_id)               -- one review per completed order
);
```

### 3.10 Clinic Admin Scope

```sql
create table public.clinic_admin_scopes (
  id                       uuid primary key default gen_random_uuid(),
  clinic_admin_user_id     uuid not null references public.users(id) on delete cascade,
  doctor_work_location_id  uuid not null references public.doctor_work_locations(id) on delete cascade,
  created_by_user_id       uuid not null references public.users(id),
  created_at               timestamptz not null default now(),
  unique (clinic_admin_user_id, doctor_work_location_id)
);
```

### 3.11 Platform Billing

```sql
create table public.platform_billing_settings (
  id                          uuid primary key default gen_random_uuid(),
  billing_target_type         billing_target_type not null,
  target_id                   uuid not null,                 -- doctor_id / lab_id / clinic_id (logical)
  fee_per_order               numeric(12,2) not null check (fee_per_order >= 0),
  currency                    text not null default 'GEL',
  billing_basis               billing_basis not null,
  billing_period              billing_period_unit not null default 'MONTHLY',
  is_active                   boolean not null default true,
  effective_from              date not null,
  effective_to                date,
  created_by_platform_admin_user_id uuid not null references public.users(id),
  created_at                  timestamptz not null default now()
);

create table public.platform_billing_periods (
  id                       uuid primary key default gen_random_uuid(),
  billing_setting_id       uuid not null references public.platform_billing_settings(id),
  billing_target_type      billing_target_type not null,
  target_id                uuid not null,
  period_start             date not null,
  period_end               date not null,
  order_count              int not null,
  fee_per_order_snapshot   numeric(12,2) not null,
  calculated_fee           numeric(12,2) not null,
  manual_adjustment        numeric(12,2) not null default 0,
  final_fee                numeric(12,2) not null,
  paid_amount              numeric(12,2) not null default 0,
  debt_amount              numeric(12,2) generated always as (final_fee - paid_amount) stored,
  status                   text not null default 'GENERATED',
  generated_at             timestamptz not null default now(),
  generated_by             text not null default 'SYSTEM',
  unique (billing_setting_id, period_start)
);

create table public.platform_billing_breakdown_items (
  id                            uuid primary key default gen_random_uuid(),
  platform_billing_period_id    uuid not null references public.platform_billing_periods(id) on delete cascade,
  doctor_id                     uuid references public.doctor_profiles(id),
  clinic_id                     uuid,
  lab_id                        uuid references public.labs(id),
  doctor_name_snapshot          text,
  clinic_name_snapshot          text,
  order_count                   int not null,
  fee_per_order_snapshot        numeric(12,2) not null,
  subtotal                      numeric(12,2) not null
);

create sequence platform_invoice_seq start with 500000;

create table public.platform_billing_invoices (
  id                                  uuid primary key default gen_random_uuid(),
  invoice_number                      text not null unique default ('PLT-' || nextval('platform_invoice_seq')),
  platform_billing_period_id          uuid not null unique references public.platform_billing_periods(id),
  billing_target_type                 billing_target_type not null,
  recipient_name                      text not null,
  recipient_identification_code       text,
  recipient_email                     text not null,
  recipient_email_source              text not null,        -- 'doctor_account', 'clinic_billing', 'lab_billing'
  billing_period_start                date not null,
  billing_period_end                  date not null,
  total_order_count                   int not null,
  final_fee                           numeric(12,2) not null,
  paid_amount                         numeric(12,2) not null default 0,
  debt_amount                         numeric(12,2) generated always as (final_fee - paid_amount) stored,
  status                              platform_invoice_status not null default 'GENERATED',
  generated_at                        timestamptz not null default now(),
  generated_by                        text not null default 'SYSTEM',
  approved_by_platform_admin_user_id  uuid references public.users(id),
  approved_at                         timestamptz,
  sent_at                             timestamptz,
  cancelled_by_platform_admin_user_id uuid references public.users(id),
  cancelled_at                        timestamptz,
  cancellation_reason                 text
);

create table public.platform_billing_payment_events (
  id                                  uuid primary key default gen_random_uuid(),
  platform_billing_period_id          uuid not null references public.platform_billing_periods(id),
  amount                              numeric(12,2) not null check (amount > 0),
  currency                            text not null default 'GEL',
  payment_method                      payment_method not null,
  payment_date                        date not null,
  recorded_by_platform_admin_user_id  uuid not null references public.users(id),
  note                                text,
  created_at                          timestamptz not null default now()
);
```

---

## 4. Triggers

### 4.1 `updated_at`

```sql
create or replace function public.tg_set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

-- Apply to: users, labs, lab_forms, orders
create trigger users_set_updated_at before update on public.users
  for each row execute function public.tg_set_updated_at();
-- (repeat for each table)
```

### 4.2 Recompute payment status on payment event

```sql
create or replace function public.tg_recompute_order_payment_status() returns trigger language plpgsql as $$
declare
  v_paid numeric(12,2);
  v_total numeric(12,2);
begin
  select coalesce(sum(amount), 0) into v_paid
    from public.payment_events where order_id = coalesce(new.order_id, old.order_id);
  update public.orders
    set paid_total = v_paid,
        payment_status = case
          when final_total is null then 'UNPAID'
          when v_paid <= 0 then 'UNPAID'
          when v_paid >= final_total then 'PAID'
          else 'PARTIALLY_PAID'
        end
  where id = coalesce(new.order_id, old.order_id);
  return null;
end; $$;

create trigger payment_events_recompute
  after insert or update or delete on public.payment_events
  for each row execute function public.tg_recompute_order_payment_status();
```

### 4.3 System messages on order events

```sql
create or replace function public.tg_order_status_system_message() returns trigger language plpgsql as $$
begin
  if old.status is distinct from new.status then
    insert into public.order_messages(order_id, message_type, system_message_key, system_message_params)
    values (new.id, 'SYSTEM', 'STATUS_CHANGED',
            jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  if old.final_total is distinct from new.final_total then
    insert into public.order_messages(order_id, message_type, system_message_key, system_message_params)
    values (new.id, 'SYSTEM', 'FINAL_PRICE_SET',
            jsonb_build_object('amount', new.final_total, 'currency', 'GEL'));
  end if;
  return new;
end; $$;

create trigger orders_system_messages
  after update on public.orders
  for each row execute function public.tg_order_status_system_message();
```

Similar triggers fire for invoice generation, payment events, file upload — each writes a system message and an `order_change_logs` row.

### 4.4 Review eligibility check

```sql
-- Reject review insert unless the order is COMPLETED and belongs to this doctor for this lab.
create or replace function public.tg_review_eligibility() returns trigger language plpgsql as $$
declare v_ok boolean;
begin
  select exists(
    select 1 from public.orders o
    where o.id = new.order_id
      and o.doctor_id = new.doctor_id
      and o.lab_id = new.lab_id
      and o.status = 'COMPLETED'
  ) into v_ok;
  if not v_ok then
    raise exception 'Review allowed only for completed orders by the same doctor';
  end if;
  return new;
end; $$;

create trigger reviews_eligibility before insert on public.reviews
  for each row execute function public.tg_review_eligibility();
```

### 4.5 Auto-hide on review report

```sql
-- When reported_at is set, flip status to REPORTED_HIDDEN.
create or replace function public.tg_review_auto_hide() returns trigger language plpgsql as $$
begin
  if new.reported_at is not null and old.reported_at is null then
    new.status := 'REPORTED_HIDDEN';
  end if;
  return new;
end; $$;

create trigger reviews_auto_hide before update on public.reviews
  for each row execute function public.tg_review_auto_hide();
```

---

## 5. Row-Level Security (RLS)

**Enable RLS on every table.** Default-deny. The following helper functions read `auth.uid()` and the `users.role`:

```sql
create or replace function public.current_user_role() returns user_role
language sql stable as $$
  select role from public.users where id = auth.uid();
$$;

create or replace function public.current_doctor_id() returns uuid
language sql stable as $$
  select dp.id from public.doctor_profiles dp where dp.user_id = auth.uid();
$$;

create or replace function public.current_user_owns_lab(lab uuid) returns boolean
language sql stable as $$
  select exists (select 1 from public.labs where id = lab and owner_user_id = auth.uid());
$$;

create or replace function public.current_clinic_admin_locations() returns setof uuid
language sql stable as $$
  select doctor_work_location_id from public.clinic_admin_scopes
  where clinic_admin_user_id = auth.uid();
$$;
```

### Example policies

```sql
-- users: read self; platform admin reads all
alter table public.users enable row level security;
create policy users_read_self on public.users for select
  using (id = auth.uid() or public.current_user_role() = 'PLATFORM_ADMIN');
create policy users_update_self on public.users for update
  using (id = auth.uid()) with check (id = auth.uid());

-- patients: doctor reads/writes own; clinic admin reads if scoped (via order join — done via view)
alter table public.patients enable row level security;
create policy patients_doctor_rw on public.patients for all
  using (doctor_id = public.current_doctor_id())
  with check (doctor_id = public.current_doctor_id());

-- orders: doctor reads/edits own; lab reads/edits if owner; clinic admin reads if work_location in scope; platform admin reads all
alter table public.orders enable row level security;

create policy orders_doctor_select on public.orders for select
  using (doctor_id = public.current_doctor_id());

create policy orders_doctor_update on public.orders for update
  using (doctor_id = public.current_doctor_id() and status not in ('COMPLETED','CANCELLED'))
  with check (doctor_id = public.current_doctor_id());

create policy orders_lab_select on public.orders for select
  using (public.current_user_owns_lab(lab_id));

create policy orders_lab_update on public.orders for update
  using (public.current_user_owns_lab(lab_id) and status not in ('COMPLETED','CANCELLED'))
  with check (public.current_user_owns_lab(lab_id));

create policy orders_clinic_admin_select on public.orders for select
  using (
    public.current_user_role() = 'CLINIC_ADMIN'
    and doctor_work_location_id in (select public.current_clinic_admin_locations())
  );

create policy orders_platform_admin_all on public.orders for select
  using (public.current_user_role() = 'PLATFORM_ADMIN');

-- labs: anyone (including anon — for the public landing page) can read APPROVED_ACTIVE;
-- owner can read/update own; platform admin all.
alter table public.labs enable row level security;
create policy labs_marketplace_read on public.labs
  for select to anon, authenticated
  using (approval_status = 'APPROVED_ACTIVE' and is_active = true);
create policy labs_owner_rw on public.labs for all
  using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create policy labs_platform_admin_all on public.labs for all
  using (public.current_user_role() = 'PLATFORM_ADMIN')
  with check (public.current_user_role() = 'PLATFORM_ADMIN');

-- payment_events: doctor SELECT own; lab INSERT/SELECT own; clinic admin no insert
alter table public.payment_events enable row level security;
create policy payment_events_doctor_select on public.payment_events for select
  using (doctor_id = public.current_doctor_id());
create policy payment_events_lab_rw on public.payment_events for all
  using (public.current_user_owns_lab(lab_id))
  with check (public.current_user_owns_lab(lab_id));

-- order_messages: any participant of the order
alter table public.order_messages enable row level security;
create policy order_messages_participants on public.order_messages for all
  using (
    exists (select 1 from public.orders o where o.id = order_id and (
      o.doctor_id = public.current_doctor_id()
      or public.current_user_owns_lab(o.lab_id)
      or o.doctor_work_location_id in (select public.current_clinic_admin_locations())
      or public.current_user_role() = 'PLATFORM_ADMIN'
    ))
  )
  with check (
    -- system messages inserted by triggers run as definer; user inserts only with sender_user_id = self
    sender_user_id = auth.uid() and message_type = 'USER'
  );

-- reviews: public read of PUBLISHED; doctor write own; lab UPDATE only to set reported_at; platform admin moderation
alter table public.reviews enable row level security;
create policy reviews_public_read on public.reviews for select
  using (status = 'PUBLISHED');
create policy reviews_doctor_insert on public.reviews for insert
  with check (doctor_id = public.current_doctor_id());
create policy reviews_lab_report on public.reviews for update
  using (public.current_user_owns_lab(lab_id))
  with check (public.current_user_owns_lab(lab_id));
create policy reviews_platform_admin_moderate on public.reviews for update
  using (public.current_user_role() = 'PLATFORM_ADMIN')
  with check (public.current_user_role() = 'PLATFORM_ADMIN');
```

Apply analogous patterns to every table. Platform billing tables: only `PLATFORM_ADMIN` can write; targets can read their own invoices.

---

## 6. Storage Buckets

```sql
-- via supabase dashboard or SQL
insert into storage.buckets (id, name, public) values
  ('order-files',       'order-files',       false),
  ('chat-attachments',  'chat-attachments',  false),
  ('lab-logos',         'lab-logos',         true),
  ('user-avatars',      'user-avatars',      true);
```

Storage RLS: object path convention `{lab_id}/{order_id}/{filename}` for `order-files`. Policy:

```sql
create policy "order-files read by participants" on storage.objects for select
  using (
    bucket_id = 'order-files'
    and exists (
      select 1 from public.orders o
      where o.id::text = (string_to_array(name, '/'))[2]
        and (
          o.doctor_id = public.current_doctor_id()
          or public.current_user_owns_lab(o.lab_id)
          or o.doctor_work_location_id in (select public.current_clinic_admin_locations())
          or public.current_user_role() = 'PLATFORM_ADMIN'
        )
    )
  );
```

Allowed MIME types enforced client-side; size limit set in bucket config (100 MB).

---

## 7. Postgres Functions Used by Frontend

```sql
-- 1. Same-patient match
create or replace function public.find_matching_patient(p_first text, p_last text, p_dob date)
returns setof public.patients language sql security definer set search_path = public as $$
  select * from patients
   where doctor_id = current_doctor_id()
     and lower(first_name) = lower(p_first)
     and lower(last_name)  = lower(p_last)
     and date_of_birth = p_dob;
$$;

-- 2. Estimate order price (re-runs the same math the UI used)
create or replace function public.calculate_order_price(p_pricing_config jsonb, p_answers jsonb)
returns numeric language plpgsql immutable as $$
declare
  v_subtotal numeric := 0;
  v_total numeric := 0;
  v_rush_type text;
  v_rush_value numeric;
begin
  -- pseudocode; real implementation parses config: model, unit_price, fixed_price, modifiers, etc.
  -- model handling: UNIT_BASED uses tooth_count from answers; FIXED uses fixed_price; etc.
  -- Returns NULL if model = MANUAL_QUOTE_REQUIRED.
  return v_total;
end; $$;

-- 3. Generate platform billing for a period (called by Edge Function + cron)
create or replace function public.generate_platform_billing_for_period(p_period_start date, p_period_end date)
returns void language plpgsql security definer as $$ ... $$;
```

---

## 8. Indexes Cheat Sheet

```sql
create index orders_lab_status_idx          on public.orders(lab_id, status);
create index orders_doctor_status_idx       on public.orders(doctor_id, status);
create index orders_due_date_idx            on public.orders(requested_due_date);
create index orders_payment_status_idx      on public.orders(payment_status);
create index order_messages_order_idx       on public.order_messages(order_id, created_at);
create index notifications_user_unread_idx  on public.notifications(user_id, is_read, created_at desc);
create index reviews_lab_status_idx         on public.reviews(lab_id, status);
create index payment_events_order_idx       on public.payment_events(order_id, payment_date);
create index labs_active_marketplace_idx    on public.labs(is_active, approval_status) where approval_status='APPROVED_ACTIVE';
```

---

## 9. Migration Strategy

- One SQL file per logical change in `supabase/migrations/`, named `YYYYMMDDHHMMSS_description.sql`.
- Never edit a committed migration; always write a new one.
- Each migration includes both the change and any necessary backfill.
- Generate types after every migration: `supabase gen types typescript --linked > src/types/database.ts`.

---

## 10. Seed Data

`supabase/seed.sql`:
- 8 platform form templates (PRD §8.2): `ZIRCONIA_CROWN`, `TEMPORARY_CROWN`, `ZIRCONIA_ON_IMPLANT`, `TEMPORARY_ON_IMPLANT`, `MOCKUP_WAXUP`, `SURGICAL_GUIDE`, `REMOVABLE_PROSTHESIS`, `OTHER_CUSTOM`.
- Each template's `platform_template_fields` rows (tooth selection, shade, material, design, implant details, notes, files...).
- One platform admin user: `INSERT INTO public.users(...) VALUES (..., 'PLATFORM_ADMIN', ...);` paired with an `auth.users` entry.
