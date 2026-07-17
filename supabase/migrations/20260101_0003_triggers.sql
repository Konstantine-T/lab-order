-- updated_at maintenance.
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

-- Prevents non-PLATFORM_ADMIN actors from changing approval/admin-only columns.
-- The lab owner can edit anything else freely.
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

  -- Owners may flip CHANGES_REQUESTED → PENDING_APPROVAL (resubmit). Otherwise
  -- they cannot change approval_status, is_active, approved_at, approved_by, approval_note.
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

-- Auth trigger: when a new auth.users row is created via supabase.auth.signUp,
-- read raw_user_meta_data and create the matching public rows.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.user_role;
  v_first_name text;
  v_last_name  text;
  v_phone      text;
  v_lang       text;
  v_lab_name   text;
  v_pid        text;
begin
  v_role := coalesce(new.raw_user_meta_data->>'role', 'DOCTOR')::public.user_role;

  -- SECURITY: role comes from client-supplied signUp metadata. Only self-
  -- registerable roles are allowed here; PLATFORM_ADMIN must be granted
  -- out-of-band (service role / SQL), never via an anonymous signup.
  -- NB: migration 0011 re-defines this function (adds the CLINIC_ADMIN branch);
  -- keep this guard in sync with that copy.
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
