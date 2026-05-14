-- ============================================================================
-- Lab Order — Phase 1, 2, 3 schema bootstrap.
-- Paste into Supabase Dashboard → SQL Editor and run once.
-- Idempotent: safe to re-run.
-- ============================================================================

-- ---------- 1) Enums --------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('DOCTOR', 'LAB_MAIN_ADMIN', 'PLATFORM_ADMIN', 'CLINIC_ADMIN');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'account_status') then
    create type public.account_status as enum ('ACTIVE', 'SUSPENDED');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'lab_approval_status') then
    create type public.lab_approval_status as enum (
      'PENDING_APPROVAL', 'CHANGES_REQUESTED', 'APPROVED_ACTIVE', 'REJECTED', 'SUSPENDED'
    );
  end if;
end $$;

-- ---------- 2) Tables -------------------------------------------------------
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

-- ---------- 3) Helper functions --------------------------------------------
create or replace function public.lab_profile_is_complete(l public.labs)
returns boolean language sql immutable as $$
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

create or replace function public.current_user_role()
returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.users where id = auth.uid();
$$;

create or replace function public.current_doctor_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select dp.id from public.doctor_profiles dp where dp.user_id = auth.uid();
$$;

create or replace function public.current_user_owns_lab(lab uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.labs where id = lab and owner_user_id = auth.uid());
$$;

-- ---------- 4) Triggers -----------------------------------------------------
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.tg_set_updated_at();

drop trigger if exists labs_set_updated_at on public.labs;
create trigger labs_set_updated_at
  before update on public.labs
  for each row execute function public.tg_set_updated_at();

-- Auth trigger: populate public.users + role row on new auth.users insert.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role       public.user_role;
  v_first_name text;
  v_last_name  text;
  v_phone      text;
  v_lang       text;
  v_lab_name   text;
  v_pid        text;
begin
  v_role := coalesce(new.raw_user_meta_data->>'role', 'DOCTOR')::public.user_role;
  v_first_name := coalesce(new.raw_user_meta_data->>'first_name', 'New');
  v_last_name  := coalesce(new.raw_user_meta_data->>'last_name', 'User');
  v_phone      := nullif(new.raw_user_meta_data->>'phone', '');
  v_lang       := coalesce(new.raw_user_meta_data->>'preferred_lang', 'en');

  insert into public.users (id, role, first_name, last_name, email, phone, preferred_lang)
  values (new.id, v_role, v_first_name, v_last_name, new.email, v_phone, v_lang);

  if v_role = 'DOCTOR' then
    v_pid := coalesce(new.raw_user_meta_data->>'personal_id_number', '');
    insert into public.doctor_profiles (user_id, personal_id_number)
    values (new.id, v_pid);
  elsif v_role = 'LAB_MAIN_ADMIN' then
    v_lab_name := coalesce(new.raw_user_meta_data->>'lab_public_name', 'Unnamed laboratory');
    insert into public.labs (owner_user_id, public_name)
    values (new.id, v_lab_name);
  end if;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Protect admin-only columns on labs from being modified by lab owner.
create or replace function public.tg_labs_protect_admin_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.user_role;
  v_owner_resubmitting boolean := false;
begin
  select role into v_role from public.users where id = auth.uid();
  if v_role = 'PLATFORM_ADMIN' then
    return new;
  end if;

  v_owner_resubmitting :=
    old.approval_status = 'CHANGES_REQUESTED'
    and new.approval_status = 'PENDING_APPROVAL';

  if not v_owner_resubmitting and new.approval_status is distinct from old.approval_status then
    raise exception 'Only platform admins can change approval_status';
  end if;
  if v_owner_resubmitting then
    new.approval_note := null;
  else
    new.approval_note := old.approval_note;
  end if;

  if new.is_active is distinct from old.is_active then
    new.is_active := old.is_active;
  end if;
  if new.approved_at is distinct from old.approved_at then
    new.approved_at := old.approved_at;
  end if;
  if new.approved_by_user_id is distinct from old.approved_by_user_id then
    new.approved_by_user_id := old.approved_by_user_id;
  end if;
  return new;
end $$;

drop trigger if exists labs_protect_admin_columns on public.labs;
create trigger labs_protect_admin_columns
  before update on public.labs
  for each row execute function public.tg_labs_protect_admin_columns();

-- ---------- 5) RLS ----------------------------------------------------------
alter table public.users enable row level security;
alter table public.doctor_profiles enable row level security;
alter table public.doctor_work_locations enable row level security;
alter table public.labs enable row level security;

-- users
drop policy if exists users_read_self_or_admin on public.users;
create policy users_read_self_or_admin on public.users
  for select to authenticated
  using (id = auth.uid() or public.current_user_role() = 'PLATFORM_ADMIN');

drop policy if exists users_update_self on public.users;
create policy users_update_self on public.users
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists users_admin_update on public.users;
create policy users_admin_update on public.users
  for update to authenticated
  using (public.current_user_role() = 'PLATFORM_ADMIN')
  with check (public.current_user_role() = 'PLATFORM_ADMIN');

-- doctor_profiles
drop policy if exists doctor_profiles_self_select on public.doctor_profiles;
create policy doctor_profiles_self_select on public.doctor_profiles
  for select to authenticated
  using (user_id = auth.uid() or public.current_user_role() = 'PLATFORM_ADMIN');

drop policy if exists doctor_profiles_self_update on public.doctor_profiles;
create policy doctor_profiles_self_update on public.doctor_profiles
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- doctor_work_locations
drop policy if exists doctor_work_locations_doctor_all on public.doctor_work_locations;
create policy doctor_work_locations_doctor_all on public.doctor_work_locations
  for all to authenticated
  using (doctor_id = public.current_doctor_id())
  with check (doctor_id = public.current_doctor_id());

drop policy if exists doctor_work_locations_admin_select on public.doctor_work_locations;
create policy doctor_work_locations_admin_select on public.doctor_work_locations
  for select to authenticated
  using (public.current_user_role() = 'PLATFORM_ADMIN');

-- labs
drop policy if exists labs_marketplace_read on public.labs;
create policy labs_marketplace_read on public.labs
  for select to anon, authenticated
  using (approval_status = 'APPROVED_ACTIVE' and is_active = true);

drop policy if exists labs_owner_select on public.labs;
create policy labs_owner_select on public.labs
  for select to authenticated
  using (owner_user_id = auth.uid());

drop policy if exists labs_owner_update on public.labs;
create policy labs_owner_update on public.labs
  for update to authenticated
  using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

drop policy if exists labs_admin_select on public.labs;
create policy labs_admin_select on public.labs
  for select to authenticated
  using (public.current_user_role() = 'PLATFORM_ADMIN');

drop policy if exists labs_admin_update on public.labs;
create policy labs_admin_update on public.labs
  for update to authenticated
  using (public.current_user_role() = 'PLATFORM_ADMIN')
  with check (public.current_user_role() = 'PLATFORM_ADMIN');

-- ---------- 6) GRANTs ------------------------------------------------------
-- RLS gates *what* a role can read; GRANT gates *whether* the role can touch
-- the table at all. Supabase doesn't always auto-grant on tables created via
-- raw SQL, so we grant explicitly.

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on public.users                  to authenticated;
grant select, insert, update, delete on public.doctor_profiles        to authenticated;
grant select, insert, update, delete on public.doctor_work_locations  to authenticated;
grant select, insert, update, delete on public.labs                   to authenticated;
grant select on public.labs to anon;  -- public marketplace + landing page

grant execute on function public.current_user_role()                  to authenticated;
grant execute on function public.current_doctor_id()                  to authenticated;
grant execute on function public.current_user_owns_lab(uuid)          to authenticated;
grant execute on function public.lab_profile_is_complete(public.labs) to anon, authenticated;

-- Future tables / functions inherit the same defaults.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant execute on functions to authenticated, anon;

-- ============================================================================
-- DONE. To create your first PLATFORM_ADMIN, see supabase/seed_admin.sql
-- ============================================================================
