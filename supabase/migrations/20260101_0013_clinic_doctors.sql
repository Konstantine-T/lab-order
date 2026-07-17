-- Phase: clinic ↔ doctors & clinic order oversight.
-- See docs/SPEC-clinic-doctors.md.
--
-- A clinic is an umbrella over doctors. A doctor joins a clinic ONLY by accepting
-- an invite (explicit consent — this is the privacy boundary, since the clinic
-- then reads that doctor's order + patient data). One clinic per doctor.
--
-- NOTE: does NOT redefine handle_new_user()/submit_order — 0011 stays the runtime
-- winner for the signup-role security guard.

-- ---------------------------------------------------------------------------
-- Link: a doctor is under at most one clinic. Set ONLY via the RPCs below.
-- ---------------------------------------------------------------------------
alter table public.doctor_profiles
  add column if not exists clinic_id uuid references public.clinics(id) on delete set null;
create index if not exists doctor_profiles_clinic_idx on public.doctor_profiles(clinic_id);

-- ---------------------------------------------------------------------------
-- Invitations (clinic -> doctor email).
-- ---------------------------------------------------------------------------
create table if not exists public.clinic_doctor_invites (
  id                 uuid primary key default gen_random_uuid(),
  clinic_id          uuid not null references public.clinics(id) on delete cascade,
  doctor_email       text not null,   -- matched case-insensitively to users.email
  status             text not null default 'PENDING'
                       check (status in ('PENDING','ACCEPTED','DECLINED','REVOKED')),
  invited_by_user_id uuid references public.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  responded_at       timestamptz
);
-- At most one open invite per (clinic, email).
create unique index if not exists clinic_doctor_invites_one_pending
  on public.clinic_doctor_invites (clinic_id, lower(doctor_email)) where status = 'PENDING';
create index if not exists clinic_doctor_invites_email_idx
  on public.clinic_doctor_invites (lower(doctor_email));

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
-- The clinic this authenticated user OWNS (clinic admin), or null for everyone else.
create or replace function public.current_admin_clinic_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.clinics where owner_user_id = auth.uid();
$$;

-- The authenticated user's email (for matching invites), or null.
-- MUST come from the auth-verified JWT, NOT public.users.email — that mirror is
-- client-mutable (users_update_self has no column restriction), so trusting it
-- would let a user spoof their email to read/accept someone else's invites.
create or replace function public.current_user_email()
returns text language sql stable security definer set search_path = public as $$
  select lower(auth.jwt() ->> 'email');
$$;

-- ---------------------------------------------------------------------------
-- Guard: clinic_id is the sole key for the clinic-oversight RLS grants, so it
-- must NOT be writable through the doctor's column-blind self-update policy
-- (doctor_profiles_self_update). Postgres RLS can't restrict columns, so a
-- BEFORE UPDATE trigger reverts any clinic_id change unless it comes from one of
-- the consent RPCs below (which set a transaction-local flag). This enforces the
-- consent + revocation invariants: linkage changes ONLY via respond_clinic_invite
-- / leave_clinic / clinic_remove_doctor.
-- ---------------------------------------------------------------------------
create or replace function public.tg_doctor_profiles_protect_clinic_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.clinic_id is distinct from old.clinic_id
     and coalesce(current_setting('app.allow_clinic_link', true), '') <> 'on' then
    new.clinic_id := old.clinic_id;  -- silently ignore unauthorized direct writes
  end if;
  return new;
end $$;

drop trigger if exists doctor_profiles_protect_clinic_id on public.doctor_profiles;
create trigger doctor_profiles_protect_clinic_id
  before update on public.doctor_profiles
  for each row execute function public.tg_doctor_profiles_protect_clinic_id();

-- ---------------------------------------------------------------------------
-- RLS: invites
-- ---------------------------------------------------------------------------
alter table public.clinic_doctor_invites enable row level security;

-- Clinic admin: full control over its own clinic's invites.
drop policy if exists clinic_doctor_invites_owner_all on public.clinic_doctor_invites;
create policy clinic_doctor_invites_owner_all on public.clinic_doctor_invites
  for all to authenticated
  using (clinic_id = public.current_admin_clinic_id() and public.current_admin_clinic_id() is not null)
  with check (clinic_id = public.current_admin_clinic_id() and public.current_admin_clinic_id() is not null);

-- Doctor: read invites addressed to their email (respond via RPC only).
drop policy if exists clinic_doctor_invites_invitee_select on public.clinic_doctor_invites;
create policy clinic_doctor_invites_invitee_select on public.clinic_doctor_invites
  for select to authenticated
  using (lower(doctor_email) = lower(public.current_user_email()));

drop policy if exists clinic_doctor_invites_admin_select on public.clinic_doctor_invites;
create policy clinic_doctor_invites_admin_select on public.clinic_doctor_invites
  for select to authenticated
  using (public.current_user_role() = 'PLATFORM_ADMIN');

-- ---------------------------------------------------------------------------
-- RLS: clinic read access to its doctors' orders (the oversight grant).
-- Additive SELECT policies, gated by "the order's doctor is under my clinic".
-- No writes — the clinic can only look.
-- ---------------------------------------------------------------------------
drop policy if exists orders_clinic_select on public.orders;
create policy orders_clinic_select on public.orders
  for select to authenticated
  using (
    public.current_admin_clinic_id() is not null
    and exists (
      select 1 from public.doctor_profiles dp
      where dp.id = orders.doctor_id
        and dp.clinic_id = public.current_admin_clinic_id()
    )
  );

drop policy if exists order_answers_clinic_select on public.order_answers;
create policy order_answers_clinic_select on public.order_answers
  for select to authenticated
  using (
    public.current_admin_clinic_id() is not null
    and exists (
      select 1 from public.orders o
      join public.doctor_profiles dp on dp.id = o.doctor_id
      where o.id = order_answers.order_id
        and dp.clinic_id = public.current_admin_clinic_id()
    )
  );

drop policy if exists patients_clinic_select on public.patients;
create policy patients_clinic_select on public.patients
  for select to authenticated
  using (
    public.current_admin_clinic_id() is not null
    and exists (
      select 1 from public.orders o
      join public.doctor_profiles dp on dp.id = o.doctor_id
      where o.patient_id = patients.id
        and dp.clinic_id = public.current_admin_clinic_id()
    )
  );

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Doctor responds to an invite. Runs AS THE DOCTOR (auth.uid()) — the consent gate.
create or replace function public.respond_clinic_invite(p_invite_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.clinic_doctor_invites%rowtype;
  v_doctor_id uuid;
  v_email text := public.current_user_email();  -- trusted (JWT), already lowercased
  v_updated int;
begin
  select id into v_doctor_id from public.doctor_profiles where user_id = auth.uid();
  if v_doctor_id is null then
    raise exception 'not_a_doctor';
  end if;

  -- Lock the invite row to close accept/accept and accept-vs-revoke races.
  select * into v_invite from public.clinic_doctor_invites where id = p_invite_id for update;
  if v_invite.id is null then
    raise exception 'invite_not_found';
  end if;
  if v_invite.status <> 'PENDING' then
    raise exception 'invite_not_pending';
  end if;
  if lower(v_invite.doctor_email) <> v_email then
    raise exception 'invite_not_yours';
  end if;

  if p_accept then
    perform set_config('app.allow_clinic_link', 'on', true);
    -- One clinic per doctor, enforced atomically in the UPDATE predicate.
    update public.doctor_profiles
       set clinic_id = v_invite.clinic_id
     where id = v_doctor_id and clinic_id is null;
    get diagnostics v_updated = row_count;
    if v_updated = 0 then
      raise exception 'already_in_clinic';
    end if;
    update public.clinic_doctor_invites
       set status = 'ACCEPTED', responded_at = now()
     where id = p_invite_id and status = 'PENDING';
  else
    update public.clinic_doctor_invites
       set status = 'DECLINED', responded_at = now()
     where id = p_invite_id and status = 'PENDING';
  end if;
end $$;

-- Doctor leaves their clinic (self-service).
create or replace function public.leave_clinic()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('app.allow_clinic_link', 'on', true);
  update public.doctor_profiles set clinic_id = null where user_id = auth.uid();
end $$;

-- Clinic admin removes a doctor from its roster (only doctors under this clinic).
create or replace function public.clinic_remove_doctor(p_doctor_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic uuid := public.current_admin_clinic_id();
begin
  if v_clinic is null then
    raise exception 'not_a_clinic_admin';
  end if;
  perform set_config('app.allow_clinic_link', 'on', true);
  update public.doctor_profiles
     set clinic_id = null
   where id = p_doctor_id and clinic_id = v_clinic;
end $$;

-- Roster: doctors under my clinic (names + email + specialty, no other PII).
create or replace function public.clinic_doctors()
returns table (doctor_id uuid, user_id uuid, first_name text, last_name text, email text, specialty text)
language sql
stable
security definer
set search_path = public
as $$
  select dp.id, u.id, u.first_name, u.last_name, u.email, dp.specialty
  from public.doctor_profiles dp
  join public.users u on u.id = dp.user_id
  where dp.clinic_id = public.current_admin_clinic_id()
    and public.current_admin_clinic_id() is not null
  order by u.first_name, u.last_name;
$$;

-- Doctor's own pending invites, with the inviting clinic's name (doctors have no
-- direct read on the clinics table).
create or replace function public.my_clinic_invites()
returns table (invite_id uuid, clinic_id uuid, clinic_name text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select i.id, i.clinic_id, c.public_name, i.created_at
  from public.clinic_doctor_invites i
  join public.clinics c on c.id = i.clinic_id
  where lower(i.doctor_email) = lower(public.current_user_email())
    and i.status = 'PENDING'
  order by i.created_at desc;
$$;

grant execute on function public.my_clinic_invites() to authenticated;
grant execute on function public.respond_clinic_invite(uuid, boolean) to authenticated;
grant execute on function public.leave_clinic() to authenticated;
grant execute on function public.clinic_remove_doctor(uuid) to authenticated;
grant execute on function public.clinic_doctors() to authenticated;
grant execute on function public.current_admin_clinic_id() to authenticated;
grant execute on function public.current_user_email() to authenticated;
