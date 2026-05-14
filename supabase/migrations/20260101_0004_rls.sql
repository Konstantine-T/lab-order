-- RLS helper functions.

create or replace function public.current_user_role()
returns public.user_role
language sql stable
security definer
set search_path = public
as $$
  select role from public.users where id = auth.uid();
$$;

create or replace function public.current_doctor_id()
returns uuid
language sql stable
security definer
set search_path = public
as $$
  select dp.id from public.doctor_profiles dp where dp.user_id = auth.uid();
$$;

create or replace function public.current_user_owns_lab(lab uuid)
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.labs where id = lab and owner_user_id = auth.uid());
$$;

-- Enable RLS on all tables.
alter table public.users enable row level security;
alter table public.doctor_profiles enable row level security;
alter table public.doctor_work_locations enable row level security;
alter table public.labs enable row level security;

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
drop policy if exists users_read_self_or_admin on public.users;
create policy users_read_self_or_admin on public.users
  for select to authenticated
  using (id = auth.uid() or public.current_user_role() = 'PLATFORM_ADMIN');

drop policy if exists users_update_self on public.users;
create policy users_update_self on public.users
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists users_admin_update on public.users;
create policy users_admin_update on public.users
  for update to authenticated
  using (public.current_user_role() = 'PLATFORM_ADMIN')
  with check (public.current_user_role() = 'PLATFORM_ADMIN');

-- No INSERT/DELETE policies: writes happen via the auth trigger (security definer).

-- ---------------------------------------------------------------------------
-- doctor_profiles
-- ---------------------------------------------------------------------------
drop policy if exists doctor_profiles_self_select on public.doctor_profiles;
create policy doctor_profiles_self_select on public.doctor_profiles
  for select to authenticated
  using (user_id = auth.uid() or public.current_user_role() = 'PLATFORM_ADMIN');

drop policy if exists doctor_profiles_self_update on public.doctor_profiles;
create policy doctor_profiles_self_update on public.doctor_profiles
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- doctor_work_locations
-- ---------------------------------------------------------------------------
drop policy if exists doctor_work_locations_doctor_all on public.doctor_work_locations;
create policy doctor_work_locations_doctor_all on public.doctor_work_locations
  for all to authenticated
  using (doctor_id = public.current_doctor_id())
  with check (doctor_id = public.current_doctor_id());

drop policy if exists doctor_work_locations_admin_select on public.doctor_work_locations;
create policy doctor_work_locations_admin_select on public.doctor_work_locations
  for select to authenticated
  using (public.current_user_role() = 'PLATFORM_ADMIN');

-- ---------------------------------------------------------------------------
-- labs
-- ---------------------------------------------------------------------------
-- Anonymous + authenticated can read APPROVED_ACTIVE labs (marketplace + landing page).
drop policy if exists labs_marketplace_read on public.labs;
create policy labs_marketplace_read on public.labs
  for select to anon, authenticated
  using (approval_status = 'APPROVED_ACTIVE' and is_active = true);

-- Owner reads own lab in any status.
drop policy if exists labs_owner_select on public.labs;
create policy labs_owner_select on public.labs
  for select to authenticated
  using (owner_user_id = auth.uid());

-- Owner updates own lab. Protection of admin-only columns (approval_status etc.)
-- is enforced by trigger tg_labs_protect_admin_columns — see 0003_triggers.
drop policy if exists labs_owner_update on public.labs;
create policy labs_owner_update on public.labs
  for update to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

-- Platform admin: full read / update.
drop policy if exists labs_admin_select on public.labs;
create policy labs_admin_select on public.labs
  for select to authenticated
  using (public.current_user_role() = 'PLATFORM_ADMIN');

drop policy if exists labs_admin_update on public.labs;
create policy labs_admin_update on public.labs
  for update to authenticated
  using (public.current_user_role() = 'PLATFORM_ADMIN')
  with check (public.current_user_role() = 'PLATFORM_ADMIN');
