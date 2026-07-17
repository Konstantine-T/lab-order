-- Phase: clinic self-registration.
-- Adds a first-class `clinics` org entity owned by a CLINIC_ADMIN user, mirrors
-- the labs ownership/RLS pattern, and extends handle_new_user() so a
-- CLINIC_ADMIN signup provisions a clinic row (like LAB_MAIN_ADMIN → labs).
--
-- Unlike labs, clinics have NO approval/marketplace lifecycle: a clinic is
-- active immediately on registration.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
create table if not exists public.clinics (
  id                    uuid primary key default gen_random_uuid(),
  owner_user_id         uuid not null references public.users(id) on delete restrict,
  public_name           text not null,
  legal_name            text,
  identification_code   text,
  legal_address         text,
  city                  text,
  country               text,
  contact_person_name   text,
  contact_phone         text,
  contact_email         text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists clinics_owner_idx on public.clinics(owner_user_id);

-- ---------------------------------------------------------------------------
-- updated_at maintenance (reuses tg_set_updated_at from 0003_triggers.sql)
-- ---------------------------------------------------------------------------
drop trigger if exists clinics_set_updated_at on public.clinics;
create trigger clinics_set_updated_at
  before update on public.clinics
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS helper (mirrors current_user_owns_lab from 0004_rls.sql)
-- ---------------------------------------------------------------------------
create or replace function public.current_user_owns_clinic(clinic uuid)
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.clinics where id = clinic and owner_user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS policies
-- ---------------------------------------------------------------------------
alter table public.clinics enable row level security;

-- Owner reads own clinic.
drop policy if exists clinics_owner_select on public.clinics;
create policy clinics_owner_select on public.clinics
  for select to authenticated
  using (owner_user_id = auth.uid());

-- Owner updates own clinic (fill in legal/contact details post-registration).
drop policy if exists clinics_owner_update on public.clinics;
create policy clinics_owner_update on public.clinics
  for update to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

-- Platform admin: full read / update.
drop policy if exists clinics_admin_select on public.clinics;
create policy clinics_admin_select on public.clinics
  for select to authenticated
  using (public.current_user_role() = 'PLATFORM_ADMIN');

drop policy if exists clinics_admin_update on public.clinics;
create policy clinics_admin_update on public.clinics
  for update to authenticated
  using (public.current_user_role() = 'PLATFORM_ADMIN')
  with check (public.current_user_role() = 'PLATFORM_ADMIN');

-- No INSERT/DELETE policies: the clinic row is created by the auth trigger
-- (security definer), same as labs.

-- ---------------------------------------------------------------------------
-- Extend the signup trigger to provision clinics.
-- This redefines handle_new_user() from 0003_triggers.sql, keeping the existing
-- DOCTOR / LAB_MAIN_ADMIN branches unchanged and adding a CLINIC_ADMIN branch.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role        public.user_role;
  v_first_name  text;
  v_last_name   text;
  v_phone       text;
  v_lang        text;
  v_lab_name    text;
  v_clinic_name text;
  v_pid         text;
begin
  v_role := coalesce(new.raw_user_meta_data->>'role', 'DOCTOR')::public.user_role;

  -- SECURITY: the role is supplied by the client in signUp metadata. Only these
  -- roles may be self-registered — PLATFORM_ADMIN must be granted out-of-band
  -- (service role / SQL), never by an anonymous signup. Without this guard an
  -- attacker could call auth.signUp with role='PLATFORM_ADMIN' and take over.
  if v_role not in ('DOCTOR', 'LAB_MAIN_ADMIN', 'CLINIC_ADMIN') then
    raise exception 'invalid signup role: %', v_role using errcode = '42501';
  end if;

  v_first_name := coalesce(nullif(new.raw_user_meta_data->>'first_name', ''), 'New');
  v_last_name  := coalesce(nullif(new.raw_user_meta_data->>'last_name', ''), 'User');
  v_phone      := nullif(new.raw_user_meta_data->>'phone', '');
  v_lang       := coalesce(nullif(new.raw_user_meta_data->>'preferred_lang', ''), 'en');

  insert into public.users (id, role, first_name, last_name, email, phone, preferred_lang)
  values (new.id, v_role, v_first_name, v_last_name, new.email, v_phone, v_lang);

  if v_role = 'DOCTOR' then
    v_pid := coalesce(new.raw_user_meta_data->>'personal_id_number', '');
    insert into public.doctor_profiles (user_id, personal_id_number)
    values (new.id, v_pid);
  elsif v_role = 'LAB_MAIN_ADMIN' then
    v_lab_name := coalesce(nullif(new.raw_user_meta_data->>'lab_public_name', ''), 'Unnamed laboratory');
    insert into public.labs (owner_user_id, public_name)
    values (new.id, v_lab_name);
  elsif v_role = 'CLINIC_ADMIN' then
    v_clinic_name := coalesce(nullif(new.raw_user_meta_data->>'clinic_public_name', ''), 'Unnamed clinic');
    insert into public.clinics (owner_user_id, public_name)
    values (new.id, v_clinic_name);
  end if;

  return new;
end $$;
