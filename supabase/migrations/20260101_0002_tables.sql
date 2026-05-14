-- Phase 1–3 tables.

create table if not exists public.users (
  id                    uuid primary key references auth.users(id) on delete cascade,
  role                  public.user_role not null,
  first_name            text not null,
  last_name             text not null,
  email                 text not null unique,
  phone                 text,
  account_status        public.account_status not null default 'ACTIVE',
  preferred_lang        text not null default 'en' check (preferred_lang in ('en','ka','ru')),
  preferred_color_mode  text not null default 'system' check (preferred_color_mode in ('light','dark','system')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table if not exists public.doctor_profiles (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null unique references public.users(id) on delete cascade,
  personal_id_number  text not null,
  specialty           text,
  license_number      text,
  profile_photo_url   text,
  created_at          timestamptz not null default now()
);

create table if not exists public.doctor_work_locations (
  id                          uuid primary key default gen_random_uuid(),
  doctor_id                   uuid not null references public.doctor_profiles(id) on delete cascade,
  clinic_name                 text not null,
  branch_name                 text,
  address                     text not null,
  city                        text not null,
  clinic_identification_code  text,
  clinic_invoice_email        text,
  phone                       text,
  is_default                  boolean not null default false,
  archived_at                 timestamptz,
  created_at                  timestamptz not null default now()
);

-- Only one default per doctor among non-archived locations.
create unique index if not exists doctor_work_locations_one_default
  on public.doctor_work_locations(doctor_id)
  where is_default and archived_at is null;

create table if not exists public.labs (
  id                    uuid primary key default gen_random_uuid(),
  owner_user_id         uuid not null references public.users(id) on delete restrict,
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
  approval_status       public.lab_approval_status not null default 'PENDING_APPROVAL',
  approval_note         text,
  approved_at           timestamptz,
  approved_by_user_id   uuid references public.users(id),
  is_active             boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists labs_marketplace_idx
  on public.labs(is_active, approval_status)
  where approval_status = 'APPROVED_ACTIVE';

-- Helper: lab profile completeness check (used by UI and the future submit trigger).
create or replace function public.lab_profile_is_complete(l public.labs)
returns boolean
language sql immutable as $$
  select coalesce(nullif(trim(l.public_name), ''), null) is not null
     and coalesce(nullif(trim(l.legal_name), ''), null) is not null
     and coalesce(nullif(trim(l.identification_code), ''), null) is not null
     and coalesce(nullif(trim(l.legal_address), ''), null) is not null
     and coalesce(nullif(trim(l.working_address), ''), null) is not null
     and coalesce(nullif(trim(l.city), ''), null) is not null
     and coalesce(nullif(trim(l.country), ''), null) is not null
     and coalesce(nullif(trim(l.contact_person_name), ''), null) is not null
     and coalesce(nullif(trim(l.contact_phone), ''), null) is not null
     and coalesce(nullif(trim(l.contact_email), ''), null) is not null
     and coalesce(nullif(trim(l.bank_name), ''), null) is not null
     and coalesce(nullif(trim(l.bank_account_iban), ''), null) is not null
     and coalesce(nullif(trim(l.payment_instructions), ''), null) is not null;
$$;
