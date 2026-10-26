-- ---------------------------------------------------------------------------
-- 0050 — a doctor in several clinics; every order belongs to a clinic, or to
-- none (the doctor's private work). Design: docs/SPEC-multi-clinic.md.
--
-- THE CHANGE IN ONE LINE
--   Clinic access used to ask "is this order's DOCTOR in my clinic right
--   now?" (doctor_profiles.clinic_id). It now asks "is this ORDER for my
--   clinic?" (orders.clinic_id). Membership moves to public.clinic_memberships and
--   is only used for who a clinic may order for.
--
-- OWNER DECISIONS (2026-10-26)
--   * A clinic sees, edits and pays only its own orders, and keeps full rights
--     on them after the doctor leaves (they are its cases and its bills).
--   * The doctor picks the order's clinic in the wizard; a clinic admin's
--     order is for the admin's clinic.
--   * A clinic order is delivered to the clinic's working address and
--     invoiced to the clinic, both filled from the clinic (no typing, no
--     DOCTOR/CLINIC toggle). A clinic with no working address cannot be
--     ordered for: clinic_address_missing.
--   * Existing orders belong to the doctor's current clinic (backfilled
--     below), which is exactly what every clinic sees today.
--   * One address per clinic; no branches.
--
-- WHAT THIS FILE DOES, IN ORDER
--    1. public.clinic_memberships (membership), orders.clinic_id (frozen once
--       set), clinics.working_address / invoice_email, and
--       orders.doctor_work_location_id made nullable (a clinic order has no
--       doctor-typed location; its snapshot comes from the clinic).
--    2. Backfill: memberships from doctor_profiles.clinic_id, and every order
--       of a doctor in a clinic → that clinic. Skipped once the old column is
--       gone (a replay).
--    3. Helpers: doctor_in_admin_clinic (membership), order_in_admin_clinic /
--       patient_in_admin_clinic (the order's clinic), can_act_for_doctor (the
--       doctor, or an admin of a clinic they belong to: who a clinic may order
--       for), and the new can_act_for_order (the order's doctor, or its
--       clinic's admin: everything about an existing order).
--    4. Every clinic grant re-pointed: orders (select / update), order_files,
--       the order-files storage bucket, order_clarifications. order_answers
--       and patients keep their policies; their helpers changed under them.
--       work_locations_clinic_select is DROPPED: a clinic no longer orders
--       from the doctor's own locations, and they would show a clinic the
--       doctor's other workplaces.
--    5. Membership RPCs: respond_clinic_invite (no more already_in_clinic),
--       leave_clinic(p_clinic_id), clinic_remove_doctor, clinic_memberships,
--       my_clinic (all memberships, with what the wizard shows).
--    6. Ordering: _submit_order_impl gains p_clinic_id; submit_order gains
--       p_clinic_id / p_private (both null = an old client: the doctor's only
--       clinic, else private, i.e. today's behaviour); clinic_submit_order
--       orders for the caller's clinic; edit_order keeps a clinic order's
--       clinic, location and recipient; find_matching_patient and the
--       patient matching inside submit / edit never hand a clinic a patient
--       it has no order for.
--    7. complete / reopen / cancel / answer_clarification /
--       acknowledge_order_invoice / get_order_chat / get_order_staff:
--       can_act_for_order.
--    8. clinic_payables_*: the clinic's orders, whoever the doctor is now.
--    9. Notifications (0043 / 0046): the clinic told is the ORDER's clinic;
--       a private order tells no clinic. doctor_left moves to clinic_memberships.
--   10. Realtime: clinic_memberships joins the publication.
--   11. doctor_profiles.clinic_id is DROPPED, after a check that no function
--       or policy still reads it. Anything missed fails loudly ("column does
--       not exist") instead of granting access from a stale value.
--
-- REPLAYS. This file redefines functions first written in 0013–0049. Replaying
-- any of those files after this one restores an old definition that names the
-- dropped column and fails at runtime. Re-run THIS file after replaying any
-- earlier one (the 0039 rule).
--
-- ROLLOUT. Apply this file, then deploy the client. In between, an old tab
-- keeps working: submit_order without the new parameters behaves as today,
-- clinic_submit_order keeps its signature.
--
-- Needs 0043 (notifications) and 0048 (lab buyers) applied first; checked
-- below before anything changes.
--
-- Fully idempotent — safe to re-run.
-- ---------------------------------------------------------------------------


-- ── 0. Prerequisites ─────────────────────────────────────────────────────

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'orders'
                    and column_name = 'buyer_lab_id')
     or to_regclass('public.notifications') is null then
    raise exception '0050 needs 0043 (notifications) and 0048 (lab buyers) applied first'
      using errcode = '55000';
  end if;
end $$;


-- ── 1. Tables and columns ────────────────────────────────────────────────

-- Membership: a doctor in any number of clinics. Written only by the RPCs in
-- section 5 (respond / leave / remove); no client write grant.
create table if not exists public.clinic_memberships (
  clinic_id  uuid not null references public.clinics(id) on delete cascade,
  doctor_id  uuid not null references public.doctor_profiles(id) on delete cascade,
  joined_at  timestamptz not null default now(),
  primary key (clinic_id, doctor_id)
);
create index if not exists clinic_memberships_doctor_idx on public.clinic_memberships (doctor_id);

comment on table public.clinic_memberships is
  'Which clinics a doctor belongs to (0050; replaces doctor_profiles.clinic_id). Membership decides who a '
  'clinic may order for; access to an existing order is by orders.clinic_id. Written only by '
  'respond_clinic_invite, leave_clinic and clinic_remove_doctor.';

-- The clinic an order is for; null = the doctor's private work.
alter table public.orders
  add column if not exists clinic_id uuid references public.clinics(id) on delete set null;
create index if not exists orders_clinic_idx on public.orders (clinic_id) where clinic_id is not null;

comment on column public.orders.clinic_id is
  'The clinic this order is for, or null for the doctor''s private work (0050). Set once by the submit RPCs '
  'and frozen afterwards. A clinic admin sees and acts on exactly the orders whose clinic_id is theirs.';

-- What a clinic order is delivered and invoiced to; clinics had neither.
alter table public.clinics
  add column if not exists working_address text,
  add column if not exists invoice_email   text;

comment on column public.clinics.working_address is
  'Where the clinic''s orders are delivered (0050). Required before anyone can order for the clinic.';
comment on column public.clinics.invoice_email is
  'Where the clinic''s invoices go (0050); contact_email when empty.';

-- A clinic order carries the clinic's address in its snapshot, not a row of
-- the doctor's own locations.
alter table public.orders alter column doctor_work_location_id drop not null;


-- ── 2. Backfill ──────────────────────────────────────────────────────────
-- Before the freeze trigger below exists, and only while the old column does.

do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'doctor_profiles'
                and column_name = 'clinic_id') then
    execute $sql$
      insert into public.clinic_memberships (clinic_id, doctor_id, joined_at)
      select dp.clinic_id, dp.id,
             coalesce((select max(i.responded_at)
                         from public.clinic_doctor_invites i
                         join public.users u on lower(u.email) = lower(i.doctor_email)
                        where i.clinic_id = dp.clinic_id and i.status = 'ACCEPTED'
                          and u.id = dp.user_id), now())
        from public.doctor_profiles dp
       where dp.clinic_id is not null
         and dp.buyer_lab_id is null
      on conflict do nothing
    $sql$;

    execute $sql$
      update public.orders o
         set clinic_id = dp.clinic_id
        from public.doctor_profiles dp
       where dp.id = o.doctor_id
         and dp.clinic_id is not null
         and o.clinic_id is null
         and o.buyer_lab_id is null
    $sql$;
  end if;
end $$;


-- ── 3. Write guards ──────────────────────────────────────────────────────

-- orders.clinic_id: never changed by a client; set once by definer code (the
-- submit RPCs, and the backfill above should a first run of this file have
-- stopped half way), then frozen (0043's placed_by_user_id pattern). The
-- FK's ON DELETE SET NULL arrives as an ordinary UPDATE once the clinic row is
-- gone, run as the table owner: that one passes. The client refusal comes
-- FIRST: the existence check runs as the caller, and a doctor or lab cannot
-- read `clinics`, so checked first it let them detach any order (0051).
create or replace function public.tg_orders_clinic_frozen()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated') then
    raise exception 'order_parties_read_only' using errcode = '42501';
  end if;
  if new.clinic_id is null
     and not exists (select 1 from public.clinics c where c.id = old.clinic_id) then
    return new;
  end if;
  if old.clinic_id is null then
    return new;
  end if;
  new.clinic_id := old.clinic_id;
  return new;
end $$;

drop trigger if exists orders_clinic_frozen on public.orders;
create trigger orders_clinic_frozen
  before update of clinic_id on public.orders
  for each row
  when (new.clinic_id is distinct from old.clinic_id)
  execute function public.tg_orders_clinic_frozen();

-- A lab's buying profile (0048) never belongs to a clinic: what 0048's
-- doctor_profiles_buyer_no_clinic CHECK said, now on the membership table.
create or replace function public.tg_clinic_memberships_no_buyer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.doctor_profiles dp
              where dp.id = new.doctor_id and dp.buyer_lab_id is not null) then
    raise exception 'not_a_doctor' using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists clinic_memberships_no_buyer on public.clinic_memberships;
create trigger clinic_memberships_no_buyer
  before insert or update on public.clinic_memberships
  for each row execute function public.tg_clinic_memberships_no_buyer();


-- ── 4. Who reads clinic_memberships ──────────────────────────────────────────

alter table public.clinic_memberships enable row level security;

drop policy if exists clinic_memberships_doctor_read on public.clinic_memberships;
create policy clinic_memberships_doctor_read on public.clinic_memberships
  for select to authenticated
  using (doctor_id = public.current_doctor_id());

drop policy if exists clinic_memberships_clinic_read on public.clinic_memberships;
create policy clinic_memberships_clinic_read on public.clinic_memberships
  for select to authenticated
  using (clinic_id = public.current_admin_clinic_id());

drop policy if exists clinic_memberships_admin_read on public.clinic_memberships;
create policy clinic_memberships_admin_read on public.clinic_memberships
  for select to authenticated
  using (public.current_user_role() = 'PLATFORM_ADMIN');

-- Supabase's default privileges grant every client role writes on a new
-- table (the 0039 lesson): take them away, give back the read.
revoke all on public.clinic_memberships from public, anon, authenticated;
grant select on public.clinic_memberships to authenticated;


-- ── 5. Helpers ───────────────────────────────────────────────────────────
-- SECURITY DEFINER so policies can call them without the caller's RLS on
-- clinic_memberships / orders. Every one coalesces to false: a NULL must never
-- pass a `not helper(...)` test (0036's lesson).

-- Is this doctor a member of the caller's clinic?
create or replace function public.doctor_in_admin_clinic(p_doctor_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    public.current_admin_clinic_id() is not null
    and exists (
      select 1 from public.clinic_memberships cd
       where cd.doctor_id = p_doctor_id
         and cd.clinic_id = public.current_admin_clinic_id()
    ),
    false
  );
$$;

-- Is this order for the caller's clinic?
create or replace function public.order_in_admin_clinic(p_order_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    public.current_admin_clinic_id() is not null
    and exists (
      select 1 from public.orders o
       where o.id = p_order_id
         and o.clinic_id = public.current_admin_clinic_id()
    ),
    false
  );
$$;

-- Does this patient have an order for the caller's clinic?
create or replace function public.patient_in_admin_clinic(p_patient_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    public.current_admin_clinic_id() is not null
    and exists (
      select 1 from public.orders o
       where o.patient_id = p_patient_id
         and o.clinic_id = public.current_admin_clinic_id()
    ),
    false
  );
$$;

-- The doctor themselves, or an admin of a clinic the doctor belongs to: who
-- may act FOR A DOCTOR (place an order, keep a draft). Same signature and
-- grant as 0036; never use it for an existing order (can_act_for_order).
create or replace function public.can_act_for_doctor(p_doctor_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    p_doctor_id is not null
    and (
      p_doctor_id = public.current_doctor_id()
      or public.doctor_in_admin_clinic(p_doctor_id)
    ),
    false
  );
$$;

-- The order's doctor, or the admin of the order's clinic: who may act ON AN
-- EXISTING ORDER. Membership plays no part: a clinic keeps its orders after
-- the doctor leaves (owner), and never sees the doctor's other orders.
create or replace function public.can_act_for_order(p_doctor_id uuid, p_clinic_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(p_doctor_id is not null and p_doctor_id = public.current_doctor_id(), false)
      or coalesce(p_clinic_id is not null and p_clinic_id = public.current_admin_clinic_id(), false);
$$;

revoke all on function public.doctor_in_admin_clinic(uuid)  from public, anon;
revoke all on function public.order_in_admin_clinic(uuid)   from public, anon;
revoke all on function public.patient_in_admin_clinic(uuid) from public, anon;
revoke all on function public.can_act_for_doctor(uuid)      from public, anon;
revoke all on function public.can_act_for_order(uuid, uuid) from public, anon;
grant execute on function public.doctor_in_admin_clinic(uuid)  to authenticated;
grant execute on function public.order_in_admin_clinic(uuid)   to authenticated;
grant execute on function public.patient_in_admin_clinic(uuid) to authenticated;
grant execute on function public.can_act_for_doctor(uuid)      to authenticated;
grant execute on function public.can_act_for_order(uuid, uuid) to authenticated;


-- ── 6. Policies ──────────────────────────────────────────────────────────
-- order_answers_clinic_select and patients_clinic_select (0015) are not
-- re-created: they call order_in_admin_clinic / patient_in_admin_clinic,
-- redefined above. order_drafts_author_all (0023) calls can_act_for_doctor,
-- which is still the right question for a draft (whom the author orders for).

drop policy if exists orders_clinic_select on public.orders;
create policy orders_clinic_select on public.orders
  for select to authenticated
  using (clinic_id is not null and clinic_id = public.current_admin_clinic_id());

-- 0022's terminal-status rules, on the order's clinic.
drop policy if exists orders_clinic_update on public.orders;
create policy orders_clinic_update on public.orders
  for update to authenticated
  using (
    status not in ('COMPLETED','CANCELLED')
    and clinic_id is not null and clinic_id = public.current_admin_clinic_id()
  )
  with check (
    clinic_id is not null and clinic_id = public.current_admin_clinic_id()
    and status <> 'COMPLETED'
  );

-- A clinic no longer reads the doctor's own work locations (see the header).
drop policy if exists work_locations_clinic_select on public.doctor_work_locations;

-- order_files (0021): same three, can_act_for_order.
drop policy if exists order_files_participants_select on public.order_files;
create policy order_files_participants_select on public.order_files
  for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (
          public.can_act_for_order(o.doctor_id, o.clinic_id)
          or public.current_user_owns_lab(o.lab_id)
          or public.current_user_role() = 'PLATFORM_ADMIN'
        )
    )
  );

drop policy if exists order_files_participants_insert on public.order_files;
create policy order_files_participants_insert on public.order_files
  for insert to authenticated
  with check (
    uploaded_by_user_id = auth.uid()
    and exists (
      select 1 from public.orders o
      where o.id = order_id
        and (
          public.can_act_for_order(o.doctor_id, o.clinic_id)
          or public.current_user_owns_lab(o.lab_id)
        )
    )
  );

drop policy if exists order_files_participants_delete on public.order_files;
create policy order_files_participants_delete on public.order_files
  for delete to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (
          public.can_act_for_order(o.doctor_id, o.clinic_id)
          or public.current_user_owns_lab(o.lab_id)
          or public.current_user_role() = 'PLATFORM_ADMIN'
        )
    )
  );

-- storage.objects, the order-files bucket (0021): <lab_id>/<order_id>/<file>.
drop policy if exists "order-files: participants read" on storage.objects;
create policy "order-files: participants read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'order-files'
    and exists (
      select 1 from public.orders o
      where o.id::text = (string_to_array(name, '/'))[2]
        and (
          public.can_act_for_order(o.doctor_id, o.clinic_id)
          or public.current_user_owns_lab(o.lab_id)
          or public.current_user_role() = 'PLATFORM_ADMIN'
        )
    )
  );

drop policy if exists "order-files: participants upload" on storage.objects;
create policy "order-files: participants upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'order-files'
    and exists (
      select 1 from public.orders o
      where o.id::text = (string_to_array(name, '/'))[2]
        and (
          public.can_act_for_order(o.doctor_id, o.clinic_id)
          or public.current_user_owns_lab(o.lab_id)
        )
    )
  );

drop policy if exists "order-files: participants delete" on storage.objects;
create policy "order-files: participants delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'order-files'
    and exists (
      select 1 from public.orders o
      where o.id::text = (string_to_array(name, '/'))[2]
        and (
          public.can_act_for_order(o.doctor_id, o.clinic_id)
          or public.current_user_owns_lab(o.lab_id)
          or public.current_user_role() = 'PLATFORM_ADMIN'
        )
    )
  );

-- order_clarifications (0029).
drop policy if exists order_clarifications_participants_select on public.order_clarifications;
create policy order_clarifications_participants_select on public.order_clarifications
  for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (
          public.can_act_for_order(o.doctor_id, o.clinic_id)
          or public.current_user_owns_lab(o.lab_id)
          or public.current_user_role() = 'PLATFORM_ADMIN'
        )
    )
  );


-- ── 7. Membership RPCs ───────────────────────────────────────────────────

-- 0048 verbatim, except accepting adds a membership: a doctor may be in any
-- number of clinics, and accepting one they are already in changes nothing.
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
begin
  select id into v_doctor_id from public.doctor_profiles
   where user_id = auth.uid() and buyer_lab_id is null;
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
    insert into public.clinic_memberships (clinic_id, doctor_id)
    values (v_invite.clinic_id, v_doctor_id)
    on conflict do nothing;
    update public.clinic_doctor_invites
       set status = 'ACCEPTED', responded_at = now()
     where id = p_invite_id and status = 'PENDING';
  else
    update public.clinic_doctor_invites
       set status = 'DECLINED', responded_at = now()
     where id = p_invite_id and status = 'PENDING';
  end if;
end $$;

grant execute on function public.respond_clinic_invite(uuid, boolean) to authenticated;

-- The doctor leaves one clinic. Their orders stay where they are: the
-- clinic's orders remain the clinic's (owner), the doctor keeps seeing their
-- own. Replaces the argument-less 0013 version.
drop function if exists public.leave_clinic();
create or replace function public.leave_clinic(p_clinic_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doctor_id uuid;
begin
  select id into v_doctor_id from public.doctor_profiles
   where user_id = auth.uid() and buyer_lab_id is null;
  if v_doctor_id is null then
    raise exception 'not_a_doctor';
  end if;
  delete from public.clinic_memberships
   where clinic_id = p_clinic_id and doctor_id = v_doctor_id;
end $$;

revoke all on function public.leave_clinic(uuid) from public, anon;
grant execute on function public.leave_clinic(uuid) to authenticated;

-- The clinic admin removes a doctor from its own roster.
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
  delete from public.clinic_memberships
   where clinic_id = v_clinic and doctor_id = p_doctor_id;
end $$;

grant execute on function public.clinic_remove_doctor(uuid) to authenticated;

-- Roster: the doctors of my clinic (names + email + specialty, no other PII).
create or replace function public.clinic_doctors()
returns table (doctor_id uuid, user_id uuid, first_name text, last_name text, email text, specialty text)
language sql
stable
security definer
set search_path = public
as $$
  select dp.id, u.id, u.first_name, u.last_name, u.email, dp.specialty
  from public.clinic_memberships cd
  join public.doctor_profiles dp on dp.id = cd.doctor_id
  join public.users u on u.id = dp.user_id
  where cd.clinic_id = public.current_admin_clinic_id()
    and public.current_admin_clinic_id() is not null
  order by u.first_name, u.last_name;
$$;

grant execute on function public.clinic_doctors() to authenticated;

-- The signed-in doctor's clinics (0049, now any number), with what the order
-- wizard shows for a clinic order: where it is delivered and who is invoiced.
-- A member sees no more than the invoices on their own orders already carry.
-- The return type changed, so the 0049 function is dropped first.
drop function if exists public.my_clinic();
create function public.my_clinic()
returns table (
  clinic_id           uuid,
  clinic_name         text,
  city                text,
  working_address     text,
  legal_name          text,
  identification_code text,
  joined_at           timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.public_name, c.city,
         nullif(btrim(c.working_address), ''),
         coalesce(nullif(btrim(c.legal_name), ''), c.public_name),
         nullif(btrim(c.identification_code), ''),
         cd.joined_at
    from public.doctor_profiles dp
    join public.clinic_memberships cd on cd.doctor_id = dp.id
    join public.clinics c on c.id = cd.clinic_id
   where dp.user_id = auth.uid()
     and dp.buyer_lab_id is null
   order by cd.joined_at, c.public_name;
$$;

revoke all on function public.my_clinic() from public, anon;
grant execute on function public.my_clinic() to authenticated;


-- ── 8. Placing and editing an order ──────────────────────────────────────

-- 8a. _submit_order_impl: 0048 verbatim, plus p_clinic_id (the resolved
-- clinic, null = private) and, for a clinic order, the clinic's delivery
-- and invoice details. Trusts p_doctor_id / p_clinic_id; the wrappers
-- authorize. A new signature: the 16-argument one is dropped below.
CREATE OR REPLACE FUNCTION public._submit_order_impl(p_doctor_id uuid, p_lab_id uuid, p_lab_service_id uuid, p_doctor_work_location_id uuid, p_patient jsonb, p_lab_form_version_id uuid, p_invoice_recipient_type text, p_requested_due_date date, p_rush_type text, p_rush_value numeric, p_answers jsonb, p_generated_total numeric, p_continue_case_id uuid, p_parent_order_id uuid, p_continues_order_id uuid, p_requested_due_time time DEFAULT NULL::time, p_clinic_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- 0048: a lab's buying profile
  v_buyer_lab_id       uuid;
  v_buyer              public.labs;
  v_no_patient         boolean;
  v_reference          text;
  v_recipient_type     text := p_invoice_recipient_type;
  -- 0050: a clinic order
  v_clinic             public.clinics;
  v_loc_snapshot       jsonb;
  v_clinic_caller      boolean := public.current_doctor_id() is distinct from p_doctor_id;
begin
  -- The acting doctor's user row (for the doctor / recipient snapshots).
  select u.* into v_user_row
    from public.users u
    join public.doctor_profiles dp on dp.user_id = u.id
   where dp.id = v_doctor_id;
  if not found then
    raise exception 'Doctor not found';
  end if;

  -- 0048: a buying profile orders for its lab, which must still be able to
  -- buy, and never from itself. Nobody else may name LAB as the recipient.
  select dp.buyer_lab_id into v_buyer_lab_id from public.doctor_profiles dp where dp.id = v_doctor_id;
  if v_buyer_lab_id is not null then
    select * into v_buyer from public.labs where id = v_buyer_lab_id;
    if not found or v_buyer.owner_user_id <> v_user_row.id
       or v_buyer.approval_status <> 'APPROVED_ACTIVE' or not v_buyer.is_active then
      raise exception 'lab_cannot_buy' using errcode = '42501';
    end if;
    if p_lab_id = v_buyer_lab_id then
      raise exception 'cannot_order_from_own_lab' using errcode = '22023';
    end if;
    -- 0050: a purchase is never a clinic's.
    if p_clinic_id is not null then
      raise exception 'not_in_clinic' using errcode = '42501';
    end if;
  elsif p_invoice_recipient_type = 'LAB' then
    raise exception 'invoice_recipient_not_allowed' using errcode = '22023';
  end if;

  -- 0050: a clinic order needs a member doctor and a clinic with an address.
  if p_clinic_id is not null then
    if not exists (select 1 from public.clinic_memberships cd
                    where cd.clinic_id = p_clinic_id and cd.doctor_id = v_doctor_id) then
      raise exception 'not_in_clinic' using errcode = '42501';
    end if;
    select * into v_clinic from public.clinics where id = p_clinic_id;
    if nullif(btrim(coalesce(v_clinic.working_address, '')), '') is null then
      raise exception 'clinic_address_missing' using errcode = '22023';
    end if;
  end if;

  select * into v_lab from public.labs where id = p_lab_id;
  if not found or v_lab.approval_status <> 'APPROVED_ACTIVE' or not v_lab.is_active then
    raise exception 'Lab is not available for orders';
  end if;

  select * into v_service from public.lab_services where id = p_lab_service_id;
  if not found or v_service.lab_id <> v_lab.id or not v_service.is_active then
    raise exception 'Service is not available';
  end if;

  if v_buyer_lab_id is not null then
    -- 0048: delivery is always the buying lab's own address, re-synced now;
    -- p_doctor_work_location_id is ignored.
    v_loc := public._sync_lab_buyer_location(v_doctor_id);
    v_loc_snapshot := to_jsonb(v_loc);
  elsif p_clinic_id is not null then
    -- 0050: delivered to the clinic. The snapshot has a location row's keys,
    -- so every reader of work_location_snapshot keeps working.
    v_loc_snapshot := jsonb_build_object(
      'id',                         null,
      'doctor_id',                  v_doctor_id,
      'clinic_id',                  v_clinic.id,
      'clinic_name',                v_clinic.public_name,
      'branch_name',                null,
      'address',                    btrim(v_clinic.working_address),
      'city',                       coalesce(btrim(v_clinic.city), ''),
      'clinic_identification_code', nullif(btrim(coalesce(v_clinic.identification_code, '')), ''),
      'clinic_invoice_email',       coalesce(nullif(btrim(coalesce(v_clinic.invoice_email, '')), ''),
                                             v_clinic.contact_email),
      'phone',                      v_clinic.contact_phone
    );
  else
    select * into v_loc from public.doctor_work_locations where id = p_doctor_work_location_id;
    if not found or v_loc.doctor_id <> v_doctor_id or v_loc.archived_at is not null then
      raise exception 'Work location is not available';
    end if;
    v_loc_snapshot := to_jsonb(v_loc);
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
  -- 0048: "no patient" = nothing to look up and nothing to name.
  v_no_patient := v_existing_pid is null
                  and public.patient_name_key(p_patient->>'first_name') = ''
                  and public.patient_name_key(p_patient->>'last_name')  = '';
  if v_no_patient then
    if v_buyer_lab_id is null then
      raise exception 'patient_required' using errcode = '22023';
    end if;
    v_patient_id := null;
  elsif v_existing_pid is not null then
    -- 0050: a clinic admin may only reuse a patient its own clinic has an
    -- order for, never one it could only know of from another clinic.
    select id into v_patient_id from public.patients
      where id = v_existing_pid and doctor_id = v_doctor_id
        and (not v_clinic_caller or public.patient_in_admin_clinic(id));
    if v_patient_id is null then
      raise exception 'Patient not found';
    end if;
  elsif coalesce((p_patient->>'force_new')::boolean, false) then
    -- The doctor was shown the patient this name already matches and chose
    -- "create a new one" anyway. Two different people really do share a name,
    -- and without this branch that choice was unrepresentable: the client sent
    -- no existing_id, the match below ran regardless, and the order landed on
    -- the first patient of that name. The doctor's answer has to beat the
    -- heuristic that asked the question.
    insert into public.patients (doctor_id, first_name, last_name, date_of_birth, gender)
    values (
      v_doctor_id,
      public.patient_name_tidy(p_patient->>'first_name'),
      public.patient_name_tidy(p_patient->>'last_name'),
      nullif(p_patient->>'date_of_birth', '')::date,
      nullif(p_patient->>'gender', '')
    )
    returning id into v_patient_id;
  else
    -- Normalized on BOTH sides, so an already-stored padded name still matches.
    -- 0050: for a clinic admin, among its own clinic's patients only.
    select id into v_patient_id
    from public.patients
    where doctor_id = v_doctor_id
      and public.patient_name_key(first_name) = public.patient_name_key(p_patient->>'first_name')
      and public.patient_name_key(last_name)  = public.patient_name_key(p_patient->>'last_name')
      and (not v_clinic_caller or public.patient_in_admin_clinic(id))
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

  -- 0048: the buying lab's own case reference, with or without a patient.
  if v_buyer_lab_id is not null then
    v_reference := nullif(regexp_replace(coalesce(p_patient->>'reference', ''), '^\s+|\s+$', '', 'g'), '');
    if char_length(v_reference) > 200 then
      raise exception 'patient_reference_too_long' using errcode = '22023';
    end if;
  end if;

  if v_buyer_lab_id is not null then
    -- 0048: always the buying lab's LLC, whatever the client sent.
    v_recipient_type     := 'LAB';
    v_recipient_snapshot := public._lab_buyer_recipient_snapshot(v_buyer);
  elsif p_clinic_id is not null then
    -- 0050: a clinic order always invoices the clinic (owner), whatever the
    -- client sent. The keys of the doctor-typed CLINIC snapshot, plus clinic_id.
    v_recipient_type     := 'CLINIC';
    v_recipient_snapshot := jsonb_build_object(
      'type',                'CLINIC',
      'clinic_id',           v_clinic.id,
      'name',                coalesce(nullif(btrim(coalesce(v_clinic.legal_name, '')), ''), v_clinic.public_name),
      'branch',              null,
      'address',             coalesce(nullif(btrim(coalesce(v_clinic.legal_address, '')), ''),
                                      btrim(v_clinic.working_address)),
      'city',                v_clinic.city,
      'identification_code', nullif(btrim(coalesce(v_clinic.identification_code, '')), ''),
      'invoice_email',       coalesce(nullif(btrim(coalesce(v_clinic.invoice_email, '')), ''),
                                      v_clinic.contact_email)
    );
  elsif p_invoice_recipient_type = 'DOCTOR' then
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

  if v_buyer_lab_id is not null then
    -- 0048: "the doctor" of a purchase is the buying lab.
    v_doctor_snapshot := jsonb_build_object(
      'first_name',          v_buyer.public_name,
      'last_name',           '',
      'email',               v_buyer.contact_email,
      'phone',               v_buyer.contact_phone,
      'is_lab',              true,
      'lab_id',              v_buyer.id,
      'legal_name',          v_buyer.legal_name,
      'identification_code', v_buyer.identification_code
    );
  else
    v_doctor_snapshot := jsonb_build_object(
      'first_name', v_user_row.first_name,
      'last_name',  v_user_row.last_name,
      'email',      v_user_row.email,
      'phone',      v_user_row.phone
    );
  end if;

  insert into public.orders (
    doctor_id, lab_id, doctor_work_location_id, patient_id, patient_case_id, parent_order_id,
    lab_service_id, lab_form_version_id,
    status, requested_due_date, invoice_recipient_type,
    generated_total, rush_type, rush_value,
    work_location_snapshot, lab_snapshot, service_snapshot, invoice_recipient_snapshot,
    doctor_snapshot, continues_order_id, requested_due_time,
    buyer_lab_id, patient_reference, clinic_id
  ) values (
    v_doctor_id, p_lab_id, v_loc.id, v_patient_id, p_continue_case_id, p_parent_order_id,
    p_lab_service_id, p_lab_form_version_id,
    'SUBMITTED', p_requested_due_date, v_recipient_type::public.invoice_recipient_type,
    p_generated_total, coalesce(p_rush_type, 'NONE')::public.rush_type, p_rush_value,
    v_loc_snapshot, to_jsonb(v_lab), to_jsonb(v_service), v_recipient_snapshot,
    v_doctor_snapshot, p_continues_order_id, p_requested_due_time,
    v_buyer_lab_id, v_reference, p_clinic_id
  ) returning id into v_order_id;

  insert into public.order_answers (order_id, field_code, answer_json)
  select v_order_id, k, v from jsonb_each(coalesce(p_answers, '{}'::jsonb)) as t(k, v);

  return v_order_id;
end $function$;

drop function if exists public._submit_order_impl(
  uuid, uuid, uuid, uuid, jsonb, uuid, text, date, text, numeric, jsonb, numeric, uuid, uuid, uuid, time
);
-- It trusts its ids; never callable by a client (0031's note).
revoke all on function public._submit_order_impl(
  uuid, uuid, uuid, uuid, jsonb, uuid, text, date, text, numeric, jsonb, numeric, uuid, uuid, uuid, time, uuid
) from public, anon, authenticated;

-- 8b. submit_order: the doctor's own order. p_clinic_id = one of their
-- clinics, p_private = true = nobody's. Both null is an old client (the
-- deploy gap): their only clinic if they have exactly one, else private,
-- which is what that order would have been before 0050. The 15-argument
-- signature is dropped so PostgREST never sees two candidates.
drop function if exists public.submit_order(
  uuid, uuid, uuid, jsonb, uuid, text, date, text, numeric, jsonb, numeric, uuid, uuid, uuid, time
);
CREATE OR REPLACE FUNCTION public.submit_order(p_lab_id uuid, p_lab_service_id uuid, p_doctor_work_location_id uuid, p_patient jsonb, p_lab_form_version_id uuid, p_invoice_recipient_type text, p_requested_due_date date, p_rush_type text, p_rush_value numeric, p_answers jsonb, p_generated_total numeric, p_continue_case_id uuid DEFAULT NULL::uuid, p_parent_order_id uuid DEFAULT NULL::uuid, p_continues_order_id uuid DEFAULT NULL::uuid, p_requested_due_time time DEFAULT NULL::time, p_clinic_id uuid DEFAULT NULL::uuid, p_private boolean DEFAULT NULL::boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_doctor_id uuid := public.current_doctor_id();
  v_clinic_id uuid;
begin
  if v_doctor_id is null then
    raise exception 'Only doctors can submit orders';
  end if;

  if coalesce(p_private, false) then
    v_clinic_id := null;
  elsif p_clinic_id is not null then
    -- Membership is checked again by the impl; checked here to fail early.
    if not exists (select 1 from public.clinic_memberships cd
                    where cd.clinic_id = p_clinic_id and cd.doctor_id = v_doctor_id) then
      raise exception 'not_in_clinic' using errcode = '42501';
    end if;
    v_clinic_id := p_clinic_id;
  elsif p_private is null then
    select case when count(*) = 1 then min(cd.clinic_id::text)::uuid end
      into v_clinic_id
      from public.clinic_memberships cd
     where cd.doctor_id = v_doctor_id;
  end if;

  return public._submit_order_impl(
    v_doctor_id, p_lab_id, p_lab_service_id, p_doctor_work_location_id, p_patient,
    p_lab_form_version_id, p_invoice_recipient_type, p_requested_due_date, p_rush_type,
    p_rush_value, p_answers, p_generated_total, p_continue_case_id, p_parent_order_id,
    p_continues_order_id, p_requested_due_time, v_clinic_id
  );
end $function$;

revoke all on function public.submit_order(
  uuid, uuid, uuid, jsonb, uuid, text, date, text, numeric, jsonb, numeric, uuid, uuid, uuid, time, uuid, boolean
) from public, anon;
grant execute on function public.submit_order(
  uuid, uuid, uuid, jsonb, uuid, text, date, text, numeric, jsonb, numeric, uuid, uuid, uuid, time, uuid, boolean
) to authenticated;

-- 8c. clinic_submit_order: same signature as 0032. The order is for the
-- caller's clinic, for a doctor who belongs to it; the location and
-- recipient sent are ignored (the clinic's own, see the impl).
CREATE OR REPLACE FUNCTION public.clinic_submit_order(p_doctor_id uuid, p_lab_id uuid, p_lab_service_id uuid, p_doctor_work_location_id uuid, p_patient jsonb, p_lab_form_version_id uuid, p_invoice_recipient_type text, p_requested_due_date date, p_rush_type text, p_rush_value numeric, p_answers jsonb, p_generated_total numeric, p_continue_case_id uuid DEFAULT NULL::uuid, p_parent_order_id uuid DEFAULT NULL::uuid, p_continues_order_id uuid DEFAULT NULL::uuid, p_requested_due_time time DEFAULT NULL::time)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_clinic_id uuid := public.current_admin_clinic_id();
begin
  if v_clinic_id is null then
    raise exception 'Only clinic admins can create orders for doctors';
  end if;
  if not public.doctor_in_admin_clinic(p_doctor_id) then
    raise exception 'This doctor is not in your clinic';
  end if;
  return public._submit_order_impl(
    p_doctor_id, p_lab_id, p_lab_service_id, p_doctor_work_location_id, p_patient,
    p_lab_form_version_id, p_invoice_recipient_type, p_requested_due_date, p_rush_type,
    p_rush_value, p_answers, p_generated_total, p_continue_case_id, p_parent_order_id,
    p_continues_order_id, p_requested_due_time, v_clinic_id
  );
end $function$;

-- 8d. edit_order: 0048 verbatim, except (0050) the order's doctor or its
-- clinic's admin may edit; an order placed for a clinic keeps the clinic's
-- delivery and invoice details (the location and recipient sent are
-- ignored); and a clinic admin's patient matching stays inside its own
-- clinic's patients. "Placed for a clinic" = clinic_id set AND no doctor
-- location: an order from before 0050 was backfilled to the doctor's clinic
-- but still carries the doctor's own location, and stays editable as before.
CREATE OR REPLACE FUNCTION public.edit_order(p_order_id uuid, p_patient jsonb, p_doctor_work_location_id uuid, p_invoice_recipient_type text, p_answers jsonb, p_generated_total numeric, p_reason_code text, p_comment text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- 0048: a lab's purchase
  v_buyer              public.labs;
  v_no_patient         boolean;
  v_reference          text;
  v_recipient_type     text := p_invoice_recipient_type;
  -- 0050
  v_clinic_caller      boolean;
  v_clinic_fixed       boolean;
begin
  -- Load the order, then authorize: the order's doctor, or the admin of the
  -- clinic the order is for.
  select * into v_order from public.orders where id = p_order_id;
  if not found then
    raise exception 'Order not found';
  end if;
  if not public.can_act_for_order(v_order.doctor_id, v_order.clinic_id) then
    raise exception 'You are not allowed to edit this order';
  end if;
  v_doctor_id := v_order.doctor_id;
  v_clinic_caller := public.current_doctor_id() is distinct from v_doctor_id;
  v_clinic_fixed := v_order.clinic_id is not null
                    and v_order.doctor_work_location_id is null
                    and v_order.buyer_lab_id is null;

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

  -- 0048: a purchase always invoices its buying lab; nobody else may name LAB.
  if v_order.buyer_lab_id is not null then
    select * into v_buyer from public.labs where id = v_order.buyer_lab_id;
  elsif p_invoice_recipient_type = 'LAB' then
    raise exception 'invoice_recipient_not_allowed' using errcode = '22023';
  end if;

  if v_order.buyer_lab_id is not null then
    -- 0048: delivery is always the buying lab's own address, re-synced now;
    -- p_doctor_work_location_id is ignored.
    v_loc := public._sync_lab_buyer_location(v_doctor_id);
  elsif v_clinic_fixed then
    -- 0050: an order placed for a clinic keeps the clinic's delivery and
    -- invoice details.
    null;
  else
    select * into v_loc from public.doctor_work_locations
      where id = p_doctor_work_location_id;
    if not found or v_loc.doctor_id <> v_doctor_id or v_loc.archived_at is not null then
      raise exception 'Work location is not available';
    end if;
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
  if v_order.buyer_lab_id is not null then
    v_snapshot := v_snapshot || jsonb_build_object('patient_reference', v_order.patient_reference);
  end if;

  v_existing_pid := nullif(p_patient->>'existing_id', '')::uuid;
  -- 0048: "no patient" = nothing to look up and nothing to name.
  v_no_patient := v_existing_pid is null
                  and public.patient_name_key(p_patient->>'first_name') = ''
                  and public.patient_name_key(p_patient->>'last_name')  = '';
  if v_no_patient then
    if v_order.buyer_lab_id is null then
      raise exception 'patient_required' using errcode = '22023';
    end if;
    v_patient_id := null;
  elsif v_existing_pid is not null then
    -- 0050: a clinic admin keeps the order's own patient or picks one its
    -- clinic already has an order for.
    select id into v_patient_id from public.patients
      where id = v_existing_pid and doctor_id = v_doctor_id
        and (not v_clinic_caller or id = v_order.patient_id or public.patient_in_admin_clinic(id));
    if v_patient_id is null then
      raise exception 'Patient not found';
    end if;
  elsif coalesce((p_patient->>'force_new')::boolean, false) then
    -- The doctor was shown the patient this name already matches and chose
    -- "create a new one" anyway. Two different people really do share a name,
    -- and without this branch that choice was unrepresentable: the client sent
    -- no existing_id, the match below ran regardless, and the order landed on
    -- the first patient of that name. The doctor's answer has to beat the
    -- heuristic that asked the question.
    insert into public.patients (doctor_id, first_name, last_name, date_of_birth, gender)
    values (
      v_doctor_id,
      public.patient_name_tidy(p_patient->>'first_name'),
      public.patient_name_tidy(p_patient->>'last_name'),
      nullif(p_patient->>'date_of_birth', '')::date,
      nullif(p_patient->>'gender', '')
    )
    returning id into v_patient_id;
  else
    select id into v_patient_id
    from public.patients
    where doctor_id = v_doctor_id
      and public.patient_name_key(first_name) = public.patient_name_key(p_patient->>'first_name')
      and public.patient_name_key(last_name)  = public.patient_name_key(p_patient->>'last_name')
      and (not v_clinic_caller or public.patient_in_admin_clinic(id))
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

  -- 0048: the buying lab's own case reference, with or without a patient.
  if v_order.buyer_lab_id is not null then
    v_reference := nullif(regexp_replace(coalesce(p_patient->>'reference', ''), '^\s+|\s+$', '', 'g'), '');
    if char_length(v_reference) > 200 then
      raise exception 'patient_reference_too_long' using errcode = '22023';
    end if;
  end if;

  if v_order.buyer_lab_id is not null then
    -- 0048: always the buying lab's LLC, as it is now, whatever the client sent.
    v_recipient_type     := 'LAB';
    v_recipient_snapshot := public._lab_buyer_recipient_snapshot(v_buyer);
  elsif v_clinic_fixed then
    -- 0050: unchanged.
    v_recipient_type     := v_order.invoice_recipient_type::text;
    v_recipient_snapshot := v_order.invoice_recipient_snapshot;
  elsif p_invoice_recipient_type = 'DOCTOR' then
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
    doctor_work_location_id    = case when v_clinic_fixed then doctor_work_location_id else v_loc.id end,
    invoice_recipient_type     = v_recipient_type::public.invoice_recipient_type,
    work_location_snapshot     = case when v_clinic_fixed then work_location_snapshot else to_jsonb(v_loc) end,
    invoice_recipient_snapshot = v_recipient_snapshot,
    patient_reference          = case when v_order.buyer_lab_id is not null
                                      then v_reference else patient_reference end,
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
end $function$;

grant execute on function public.edit_order(uuid, jsonb, uuid, text, jsonb, numeric, text, text) to authenticated;

-- 8e. find_matching_patient: 0048, except a clinic admin only ever matches a
-- patient its own clinic has an order for. The doctor matches all their own.
create or replace function public.find_matching_patient(
  p_first text, p_last text, p_dob date, p_gender text, p_doctor_id uuid default null
)
returns table (
  id uuid, first_name text, last_name text, date_of_birth date, gender text, created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  -- Default to the caller's own doctor profile so the doctor path is
  -- unchanged; a clinic admin passes the doctor they are acting for and is
  -- authorized by can_act_for_doctor. An unauthorized id matches nothing
  -- rather than raising: this runs on every keystroke of a name.
  -- 0048: no name at all ("no patient" on a lab's order) matches nothing.
  select p.id, p.first_name, p.last_name, p.date_of_birth, p.gender, p.created_at
  from public.patients p
  where p.doctor_id = coalesce(p_doctor_id, public.current_doctor_id())
    and public.can_act_for_doctor(coalesce(p_doctor_id, public.current_doctor_id()))
    and (coalesce(p.doctor_id = public.current_doctor_id(), false)
         or public.patient_in_admin_clinic(p.id))
    and (public.patient_name_key(p_first) <> '' or public.patient_name_key(p_last) <> '')
    and public.patient_name_key(p.first_name) = public.patient_name_key(p_first)
    and public.patient_name_key(p.last_name)  = public.patient_name_key(p_last)
  order by p.created_at asc
  limit 1;
$$;

grant execute on function public.find_matching_patient(text, text, date, text, uuid)
  to authenticated;


-- ── 9. Acting on an existing order: can_act_for_order ────────────────────
-- Each body is its runtime winner verbatim; only the authorization line
-- changed (from can_act_for_doctor(v_order.doctor_id)).

-- complete_order (0022)
create or replace function public.complete_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where id = p_order_id;
  if v_order.id is null then
    raise exception 'order_not_found';
  end if;
  if not public.can_act_for_order(v_order.doctor_id, v_order.clinic_id) then
    raise exception 'not_your_order';
  end if;

  -- Already closed: nothing to do, and re-stamping completed_at would lose the
  -- original acceptance time.
  if v_order.status = 'COMPLETED' then
    return;
  end if;
  if v_order.status = 'CANCELLED' then
    raise exception 'order_cancelled';
  end if;
  if v_order.status not in ('SENT_TO_CLINIC', 'RECEIVED_BY_CLINIC') then
    raise exception 'not_delivered_yet';
  end if;

  update public.orders
     set status               = 'COMPLETED',
         completed_at         = now(),
         completed_by_user_id = auth.uid()
   where id = p_order_id;
end;
$$;

-- reopen_order (0022)
create or replace function public.reopen_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where id = p_order_id;
  if v_order.id is null then
    raise exception 'order_not_found';
  end if;
  if not public.can_act_for_order(v_order.doctor_id, v_order.clinic_id) then
    raise exception 'not_your_order';
  end if;
  if v_order.status <> 'COMPLETED' then
    raise exception 'order_not_completed';
  end if;

  update public.orders
     set status               = 'RECEIVED_BY_CLINIC',
         completed_at         = null,
         completed_by_user_id = null
   where id = p_order_id;
end;
$$;

-- cancel_order (0045)
create or replace function public.cancel_order(
  p_order_id uuid,
  p_reason   text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order  public.orders%rowtype;
  v_reason text;
begin
  -- FOR UPDATE: a lab moving the order to RECEIVED at the same moment either
  -- commits first (we then read RECEIVED and refuse) or waits for us.
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then
    raise exception 'order_not_found';
  end if;
  -- can_act_for_order coalesces to false, so `not` always fires for a
  -- stranger, an anonymous caller or a null doctor_id.
  if not public.can_act_for_order(v_order.doctor_id, v_order.clinic_id) then
    raise exception 'not_your_order' using errcode = '42501';
  end if;
  if v_order.status = 'CANCELLED' then
    return;
  end if;
  if v_order.status <> 'SUBMITTED' then
    raise exception 'order_already_accepted';
  end if;

  -- Trim whitespace of every kind, not only spaces; empty becomes null.
  v_reason := nullif(regexp_replace(coalesce(p_reason, ''), '^\s+|\s+$', '', 'g'), '');
  if char_length(v_reason) > 1000 then
    raise exception 'reason_too_long' using errcode = '22023';
  end if;

  update public.orders
     set status               = 'CANCELLED',
         cancellation_reason  = v_reason,
         cancelled_at         = now(),
         cancelled_by_user_id = auth.uid(),
         updated_at           = now()
   where id = p_order_id;
end;
$$;

-- answer_clarification (0033)
create or replace function public.answer_clarification(
  p_clarification_id uuid,
  p_answer           text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row   public.order_clarifications%rowtype;
  v_order public.orders%rowtype;
begin
  select * into v_row from public.order_clarifications where id = p_clarification_id;
  if v_row.id is null then
    raise exception 'clarification_not_found';
  end if;

  select * into v_order from public.orders where id = v_row.order_id;
  if not public.can_act_for_order(v_order.doctor_id, v_order.clinic_id) then
    raise exception 'not_your_order';
  end if;
  if v_row.answered_at is not null or v_row.resolved_by_edit_at is not null then
    raise exception 'already_answered';
  end if;
  -- The UI offers no answer box for these, but the RPC is the boundary: a
  -- typed reply would close the row while leaving the order parked in
  -- NEEDS_DOCTOR_INPUT with nothing able to release it.
  if v_row.needs_edit then
    raise exception 'answer_by_edit';
  end if;
  if v_order.status in ('COMPLETED', 'CANCELLED') then
    raise exception 'order_terminal';
  end if;
  if btrim(coalesce(p_answer, '')) = '' then
    raise exception 'answer_required';
  end if;

  update public.order_clarifications
     set answer              = btrim(p_answer),
         answered_by_user_id = auth.uid(),
         answered_at         = now()
   where id = p_clarification_id;
end;
$$;

-- acknowledge_order_invoice (0035)
create or replace function public.acknowledge_order_invoice(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where id = p_order_id;
  if v_order.id is null then
    raise exception 'order_not_found';
  end if;
  -- Covers the doctor and the order's clinic, as everywhere else.
  if not public.can_act_for_order(v_order.doctor_id, v_order.clinic_id) then
    raise exception 'not_your_order';
  end if;
  if not exists (
    select 1 from public.order_files
     where order_id = p_order_id and file_source = 'INVOICE'
  ) then
    raise exception 'no_invoice';
  end if;

  update public.orders
     set invoice_acknowledged_at = now(),
         updated_at              = now()
   where id = p_order_id;
end;
$$;

-- get_order_chat / get_order_staff (0041)
create or replace function public.get_order_chat(p_order_id uuid)
returns table (order_id uuid, invite_link text)
language sql
stable
security definer
set search_path = public
as $$
  select c.order_id, c.invite_link
  from public.order_chats c
  join public.orders o on o.id = c.order_id
  where c.order_id = p_order_id
    and (
      o.doctor_id = public.current_doctor_id()
      or public.current_user_owns_lab(o.lab_id)
      or public.current_user_role() = 'PLATFORM_ADMIN'
      -- 0050: the admin of the order's clinic — same doctor-safe row.
      or public.can_act_for_order(o.doctor_id, o.clinic_id)
    );
$$;

create or replace function public.get_order_staff(p_order_id uuid)
returns table (staff_id uuid, first_name text, last_name text, assigned_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.first_name, s.last_name, a.assigned_at
  from public.order_staff_assignments a
  join public.lab_staff s on s.id = a.staff_id
  join public.orders o on o.id = a.order_id
  where a.order_id = p_order_id
    and (
      o.doctor_id = public.current_doctor_id()
      or public.current_user_owns_lab(o.lab_id)
      or public.current_user_role() = 'PLATFORM_ADMIN'
      -- 0050: the admin of the order's clinic — same names-only rows.
      or public.can_act_for_order(o.doctor_id, o.clinic_id)
    )
  order by a.assigned_at;
$$;


-- ── 10. Clinic finances (0024): the clinic's orders ──────────────────────
-- Bodies verbatim; only the scope changed, from "the order's doctor is in my
-- clinic" to "the order is for my clinic". An ex-member's orders stay.

create or replace function public.clinic_payables_by_doctor(
  p_search          text    default null,
  p_doctor_id       uuid    default null,
  p_lab_id          uuid    default null,
  p_recipient_type  text    default null,
  p_statuses        text[]  default null,
  p_date_from       date    default null,
  p_date_to         date    default null,
  p_overdue_only    boolean default false,
  p_min_amount      numeric default null,
  p_max_amount      numeric default null
)
returns table (
  doctor_id         uuid,
  doctor_name       text,
  order_count       bigint,
  total_billed      numeric,
  total_paid        numeric,
  total_outstanding numeric
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with scope as (
    select
      o.doctor_id,
      trim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')) as doctor_name,
      -- What the lab will actually charge: its confirmed figure once it exists,
      -- the doctor-facing estimate until then, and 0 for a service priced in
      -- the lab's own words that has not been quoted yet (0023/LAB_DESCRIBED).
      coalesce(o.final_total, o.generated_total, 0) as billed,
      coalesce(o.paid_total, 0)                     as paid,
      o.confirmed_due_date,
      o.payment_status,
      o.invoice_recipient_type,
      o.created_at,
      o.order_code,
      o.lab_id,
      coalesce(ls.name, '')                                                   as service_name,
      coalesce(l.public_name, '')                                             as lab_name,
      trim(coalesce(pt.first_name, '') || ' ' || coalesce(pt.last_name, ''))  as patient_name
    from public.orders o
    join public.doctor_profiles dp on dp.id = o.doctor_id
    join public.users u            on u.id = dp.user_id
    left join public.labs l         on l.id = o.lab_id
    left join public.lab_services ls on ls.id = o.lab_service_id
    left join public.patients pt     on pt.id = o.patient_id
    where o.clinic_id is not null
      and o.clinic_id = public.current_admin_clinic_id()
  )
  select
    s.doctor_id,
    s.doctor_name,
    count(*)::bigint                     as order_count,
    sum(s.billed)::numeric               as total_billed,
    sum(s.paid)::numeric                 as total_paid,
    sum(s.billed - s.paid)::numeric      as total_outstanding
  from scope s
  where (p_doctor_id      is null or s.doctor_id = p_doctor_id)
    and (p_lab_id         is null or s.lab_id = p_lab_id)
    and (p_recipient_type is null or s.invoice_recipient_type::text = p_recipient_type)
    and (p_statuses       is null or s.payment_status::text = any(p_statuses))
    and (p_date_from      is null or s.created_at >= p_date_from::timestamptz)
    and (p_date_to        is null or s.created_at < (p_date_to + 1)::timestamptz)
    and (not p_overdue_only or (
          s.confirmed_due_date is not null
          and s.confirmed_due_date < current_date
          and (s.billed - s.paid) > 0))
    and (p_min_amount     is null or (s.billed - s.paid) >= p_min_amount)
    and (p_max_amount     is null or (s.billed - s.paid) <= p_max_amount)
    and (p_search is null or (
          s.order_code   ilike '%' || p_search || '%' or
          s.doctor_name  ilike '%' || p_search || '%' or
          s.patient_name ilike '%' || p_search || '%' or
          s.lab_name     ilike '%' || p_search || '%' or
          s.service_name ilike '%' || p_search || '%'))
  group by s.doctor_id, s.doctor_name
  order by total_outstanding desc, s.doctor_name;
$$;

create or replace function public.clinic_payables_list(
  p_search          text    default null,
  p_doctor_id       uuid    default null,
  p_lab_id          uuid    default null,
  p_recipient_type  text    default null,
  p_statuses        text[]  default null,
  p_date_from       date    default null,
  p_date_to         date    default null,
  p_overdue_only    boolean default false,
  p_min_amount      numeric default null,
  p_max_amount      numeric default null,
  p_sort            text    default 'created_desc',
  p_limit           integer default 25,
  p_offset          integer default 0
)
returns table (
  order_id            uuid,
  order_code          text,
  order_status        text,
  doctor_id           uuid,
  doctor_name         text,
  lab_id              uuid,
  lab_name            text,
  patient_name        text,
  service_name        text,
  recipient_type      text,
  billed              numeric,
  paid_total          numeric,
  outstanding         numeric,
  payment_status      text,
  confirmed_due_date  date,
  requested_due_date  date,
  created_at          timestamptz,
  total_count         bigint
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with scope as (
    select
      o.id,
      o.order_code,
      o.status,
      o.doctor_id,
      trim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, ''))    as doctor_name,
      o.lab_id,
      coalesce(l.public_name, '')                                             as lab_name,
      trim(coalesce(pt.first_name, '') || ' ' || coalesce(pt.last_name, ''))  as patient_name,
      coalesce(ls.name, '')                                                   as service_name,
      o.invoice_recipient_type,
      coalesce(o.final_total, o.generated_total, 0) as billed,
      coalesce(o.paid_total, 0)                     as paid,
      o.payment_status,
      o.confirmed_due_date,
      o.requested_due_date,
      o.created_at
    from public.orders o
    join public.doctor_profiles dp on dp.id = o.doctor_id
    join public.users u            on u.id = dp.user_id
    left join public.labs l          on l.id = o.lab_id
    left join public.lab_services ls on ls.id = o.lab_service_id
    left join public.patients pt     on pt.id = o.patient_id
    where o.clinic_id is not null
      and o.clinic_id = public.current_admin_clinic_id()
  ),
  filtered as (
    select * from scope s
    where (p_doctor_id      is null or s.doctor_id = p_doctor_id)
      and (p_lab_id         is null or s.lab_id = p_lab_id)
      and (p_recipient_type is null or s.invoice_recipient_type::text = p_recipient_type)
      and (p_statuses       is null or s.payment_status::text = any(p_statuses))
      and (p_date_from      is null or s.created_at >= p_date_from::timestamptz)
      and (p_date_to        is null or s.created_at < (p_date_to + 1)::timestamptz)
      and (not p_overdue_only or (
            s.confirmed_due_date is not null
            and s.confirmed_due_date < current_date
            and (s.billed - s.paid) > 0))
      and (p_min_amount     is null or (s.billed - s.paid) >= p_min_amount)
      and (p_max_amount     is null or (s.billed - s.paid) <= p_max_amount)
      and (p_search is null or (
            s.order_code   ilike '%' || p_search || '%' or
            s.doctor_name  ilike '%' || p_search || '%' or
            s.patient_name ilike '%' || p_search || '%' or
            s.lab_name     ilike '%' || p_search || '%' or
            s.service_name ilike '%' || p_search || '%'))
  )
  select
    f.id,
    f.order_code,
    f.status::text,
    f.doctor_id,
    f.doctor_name,
    f.lab_id,
    f.lab_name,
    f.patient_name,
    f.service_name,
    f.invoice_recipient_type::text,
    f.billed,
    f.paid,
    (f.billed - f.paid) as outstanding,
    f.payment_status::text,
    f.confirmed_due_date,
    f.requested_due_date,
    f.created_at,
    count(*) over ()::bigint as total_count
  from filtered f
  order by
    case when p_sort = 'created_desc'     then f.created_at end desc,
    case when p_sort = 'created_asc'      then f.created_at end asc,
    case when p_sort = 'outstanding_desc' then (f.billed - f.paid) end desc,
    case when p_sort = 'outstanding_asc'  then (f.billed - f.paid) end asc,
    -- NULLS LAST on both due-date sorts: an order with no confirmed date is
    -- not "due first", it is simply not scheduled yet.
    case when p_sort = 'due_asc'          then f.confirmed_due_date end asc nulls last,
    case when p_sort = 'due_desc'         then f.confirmed_due_date end desc nulls last,
    f.created_at desc
  limit  greatest(p_limit, 1)
  offset greatest(p_offset, 0);
$$;


-- ── 11. Notifications (0043 / 0046): the order's clinic ──────────────────
-- _notification_parties takes the order's clinic; clinic_owner is that
-- clinic's owner, or null for a private order (notify() then does nothing).
-- Each trigger body is its runtime winner verbatim but for the extra argument.

create or replace function public._notification_parties(
  p_doctor_id uuid,
  p_lab_id    uuid,
  p_clinic_id uuid,
  out doctor_user  uuid,
  out clinic_owner uuid,
  out lab_owner    uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select dp.user_id from public.doctor_profiles dp where dp.id = p_doctor_id),
    (select c.owner_user_id from public.clinics c where c.id = p_clinic_id),
    (select l.owner_user_id from public.labs l where l.id = p_lab_id);
$$;

-- The 0043 two-argument version keyed on the doctor's clinic.
drop function if exists public._notification_parties(uuid, uuid);

-- Rows 1, 2: a new order.
create or replace function public.tg_notify_order_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parties record;
  v_params  jsonb;
begin
  begin
    select * into v_parties from public._notification_parties(new.doctor_id, new.lab_id, new.clinic_id);
    v_params := public._order_notification_params(new);

    -- 1. new_order → the lab
    begin
      perform public.notify(v_parties.lab_owner, 'new_order', new.id, v_params);
    exception when others then
      raise warning 'notify new_order (order %): %', new.id, sqlerrm;
    end;

    -- 2. clinic_order_placed → the order's clinic admin (skipped as the actor
    --    when the clinic placed it; nobody for a private order)
    begin
      perform public.notify(v_parties.clinic_owner, 'clinic_order_placed', new.id, v_params);
    exception when others then
      raise warning 'notify clinic_order_placed (order %): %', new.id, sqlerrm;
    end;
  exception when others then
    raise warning 'tg_notify_order_insert (order %): %', new.id, sqlerrm;
  end;
  return null;
end $$;

-- Rows 4 to 8, 16 to 18: status changes.
create or replace function public.tg_notify_order_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parties     record;
  v_params      jsonb;
  v_uid         uuid;
  v_actor       uuid;
  v_doctor_side boolean;
  v_clinic_copy uuid;
  v_kind        text;
begin
  begin
    select * into v_parties from public._notification_parties(new.doctor_id, new.lab_id, new.clinic_id);
    v_params := public._order_notification_params(new);
    v_uid := auth.uid();
    v_doctor_side := coalesce(v_uid = v_parties.doctor_user, false)
                  or coalesce(v_uid = v_parties.clinic_owner, false);
    v_clinic_copy := case when new.placed_by_user_id = v_parties.clinic_owner
                          then v_parties.clinic_owner end;

    -- 4, 5, 6. lab_needs_change / order_ready / order_sent → the doctor (+ clinic copy).
    --    RECEIVED, IN_PROGRESS, RECEIVED_BY_CLINIC, TRY_IN_PHASE and
    --    NEEDS_CLARIFICATION stay quiet.
    if new.status in ('NEEDS_DOCTOR_INPUT', 'READY_FOR_DELIVERY', 'SENT_TO_CLINIC')
       and not v_doctor_side then
      v_kind := case new.status
                  when 'NEEDS_DOCTOR_INPUT' then 'lab_needs_change'
                  when 'READY_FOR_DELIVERY' then 'order_ready'
                  else 'order_sent'
                end;
      begin
        perform public.notify(v_parties.doctor_user, v_kind, new.id, v_params);
        perform public.notify(v_clinic_copy, v_kind, new.id, v_params);
      exception when others then
        raise warning 'notify % (order %): %', v_kind, new.id, sqlerrm;
      end;
    end if;

    -- 7, 8. Cancelled: by whom decides the recipient.
    if new.status = 'CANCELLED' then
      v_actor := coalesce(v_uid, new.cancelled_by_user_id);
      if v_actor is not null and v_actor = v_parties.lab_owner then
        begin
          perform public.notify(v_parties.doctor_user, 'order_cancelled_by_lab', new.id, v_params);
          perform public.notify(v_clinic_copy, 'order_cancelled_by_lab', new.id, v_params);
        exception when others then
          raise warning 'notify order_cancelled_by_lab (order %): %', new.id, sqlerrm;
        end;
      elsif v_actor is not null
            and (v_actor = v_parties.doctor_user or v_actor = v_parties.clinic_owner) then
        begin
          perform public.notify(v_parties.lab_owner, 'order_cancelled_by_doctor', new.id, v_params);
        exception when others then
          raise warning 'notify order_cancelled_by_doctor (order %): %', new.id, sqlerrm;
        end;
      end if;
    end if;

    -- 16, 17. Completed (complete_order): the lab, and the order's clinic admin.
    if new.status = 'COMPLETED' then
      begin
        perform public.notify(v_parties.lab_owner, 'order_completed', new.id, v_params);
      exception when others then
        raise warning 'notify order_completed (order %): %', new.id, sqlerrm;
      end;
      begin
        perform public.notify(v_parties.clinic_owner, 'clinic_order_completed', new.id, v_params);
      exception when others then
        raise warning 'notify clinic_order_completed (order %): %', new.id, sqlerrm;
      end;
    end if;

    -- 18. Reopened (reopen_order) → the lab.
    if old.status = 'COMPLETED' and new.status <> 'COMPLETED' then
      begin
        perform public.notify(v_parties.lab_owner, 'order_reopened', new.id, v_params);
      exception when others then
        raise warning 'notify order_reopened (order %): %', new.id, sqlerrm;
      end;
    end if;
  exception when others then
    raise warning 'tg_notify_order_status (order %): %', new.id, sqlerrm;
  end;
  return null;
end $$;

-- Rows 9, 20: the lab set or changed the price (0046's body, with the note).
create or replace function public.tg_notify_order_price()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parties     record;
  v_params      jsonb;
  v_uid         uuid;
  v_doctor_side boolean;
begin
  begin
    select * into v_parties from public._notification_parties(new.doctor_id, new.lab_id, new.clinic_id);
    v_params := public._order_notification_params(new)
                || jsonb_build_object('amount', new.final_total,
                                      'note', left(new.final_price_note, 140));
    v_uid := auth.uid();
    v_doctor_side := coalesce(v_uid = v_parties.doctor_user, false)
                  or coalesce(v_uid = v_parties.clinic_owner, false);

    if not v_doctor_side then
      -- 9. price_set → the doctor only; the clinic admin's line is row 20.
      begin
        perform public.notify(v_parties.doctor_user, 'price_set', new.id, v_params);
      exception when others then
        raise warning 'notify price_set (order %): %', new.id, sqlerrm;
      end;
      -- 20. new_payable → the order's clinic admin.
      begin
        perform public.notify(v_parties.clinic_owner, 'new_payable', new.id, v_params);
      exception when others then
        raise warning 'notify new_payable (order %): %', new.id, sqlerrm;
      end;
    end if;
  exception when others then
    raise warning 'tg_notify_order_price (order %): %', new.id, sqlerrm;
  end;
  return null;
end $$;

-- Row 10: the lab confirmed (or moved) the due date or time.
create or replace function public.tg_notify_order_due()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parties     record;
  v_params      jsonb;
  v_uid         uuid;
  v_doctor_side boolean;
  v_clinic_copy uuid;
begin
  begin
    select * into v_parties from public._notification_parties(new.doctor_id, new.lab_id, new.clinic_id);
    v_params := public._order_notification_params(new)
                || jsonb_strip_nulls(jsonb_build_object(
                     'date', to_char(new.confirmed_due_date, 'YYYY-MM-DD'),
                     'time', to_char(new.confirmed_due_time, 'HH24:MI')));
    v_uid := auth.uid();
    v_doctor_side := coalesce(v_uid = v_parties.doctor_user, false)
                  or coalesce(v_uid = v_parties.clinic_owner, false);
    v_clinic_copy := case when new.placed_by_user_id = v_parties.clinic_owner
                          then v_parties.clinic_owner end;

    if not v_doctor_side then
      begin
        perform public.notify(v_parties.doctor_user, 'due_confirmed', new.id, v_params);
        perform public.notify(v_clinic_copy, 'due_confirmed', new.id, v_params);
      exception when others then
        raise warning 'notify due_confirmed (order %): %', new.id, sqlerrm;
      end;
    end if;
  exception when others then
    raise warning 'tg_notify_order_due (order %): %', new.id, sqlerrm;
  end;
  return null;
end $$;

-- Row 19: a payment was recorded (record_payment only moves paid_total).
create or replace function public.tg_notify_order_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parties record;
begin
  begin
    select * into v_parties from public._notification_parties(new.doctor_id, new.lab_id, new.clinic_id);
    perform public.notify(v_parties.clinic_owner, 'payment_recorded', new.id,
                          public._order_notification_params(new)
                          || jsonb_build_object('amount', new.paid_total - old.paid_total));
  exception when others then
    raise warning 'notify payment_recorded (order %): %', new.id, sqlerrm;
  end;
  return null;
end $$;

-- Row 3: the lab asked a question (not an edit request; that is row 4).
create or replace function public.tg_notify_clarification_asked()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order       public.orders%rowtype;
  v_parties     record;
  v_params      jsonb;
  v_uid         uuid;
  v_clinic_copy uuid;
begin
  begin
    select * into v_order from public.orders where id = new.order_id;
    select * into v_parties from public._notification_parties(v_order.doctor_id, v_order.lab_id, v_order.clinic_id);
    v_params := public._order_notification_params(v_order);
    v_uid := auth.uid();
    v_clinic_copy := case when v_order.placed_by_user_id = v_parties.clinic_owner
                          then v_parties.clinic_owner end;

    if not (coalesce(v_uid = v_parties.doctor_user, false)
            or coalesce(v_uid = v_parties.clinic_owner, false)) then
      perform public.notify(v_parties.doctor_user, 'lab_question', v_order.id, v_params);
      perform public.notify(v_clinic_copy, 'lab_question', v_order.id, v_params);
    end if;
  exception when others then
    raise warning 'notify lab_question (clarification %): %', new.id, sqlerrm;
  end;
  return null;
end $$;

-- Row 15: the doctor answered (answer_clarification). Lab only.
create or replace function public.tg_notify_clarification_answered()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order   public.orders%rowtype;
  v_parties record;
begin
  begin
    select * into v_order from public.orders where id = new.order_id;
    select * into v_parties from public._notification_parties(v_order.doctor_id, v_order.lab_id, v_order.clinic_id);
    perform public.notify(v_parties.lab_owner, 'doctor_answered', v_order.id,
                          public._order_notification_params(v_order));
  exception when others then
    raise warning 'notify doctor_answered (clarification %): %', new.id, sqlerrm;
  end;
  return null;
end $$;

-- Rows 11, 12: the lab attached or replaced the invoice.
create or replace function public.tg_notify_invoice_added()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order       public.orders%rowtype;
  v_parties     record;
  v_params      jsonb;
  v_uid         uuid;
  v_clinic_copy uuid;
  v_kind        text;
begin
  begin
    select * into v_order from public.orders where id = new.order_id;
    select * into v_parties from public._notification_parties(v_order.doctor_id, v_order.lab_id, v_order.clinic_id);
    v_params := public._order_notification_params(v_order);
    v_uid := auth.uid();
    v_clinic_copy := case when v_order.placed_by_user_id = v_parties.clinic_owner
                          then v_parties.clinic_owner end;

    v_kind := case
      when position(new.order_id::text in coalesce(current_setting('lab_order.invoice_replaced', true), '')) > 0
        or v_order.invoice_acknowledged_at is not null
        then 'invoice_replaced'
      else 'invoice_attached'
    end;

    if not (coalesce(v_uid = v_parties.doctor_user, false)
            or coalesce(v_uid = v_parties.clinic_owner, false)) then
      perform public.notify(v_parties.doctor_user, v_kind, v_order.id, v_params);
      perform public.notify(v_clinic_copy, v_kind, v_order.id, v_params);
    end if;
  exception when others then
    raise warning 'notify invoice (file %): %', new.id, sqlerrm;
  end;
  return null;
end $$;

-- Rows 13 and 14 (invoice_seen, order_edited) called the 0043 helper too.
create or replace function public.tg_notify_order_invoice_seen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parties record;
begin
  begin
    select * into v_parties from public._notification_parties(new.doctor_id, new.lab_id, new.clinic_id);
    perform public.notify(v_parties.lab_owner, 'invoice_seen', new.id,
                          public._order_notification_params(new));
  exception when others then
    raise warning 'notify invoice_seen (order %): %', new.id, sqlerrm;
  end;
  return null;
end $$;

create or replace function public.tg_notify_order_edited()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parties record;
begin
  begin
    select * into v_parties from public._notification_parties(new.doctor_id, new.lab_id, new.clinic_id);
    perform public.notify(v_parties.lab_owner, 'order_edited', new.id,
                          public._order_notification_params(new));
  exception when others then
    raise warning 'notify order_edited (order %): %', new.id, sqlerrm;
  end;
  return null;
end $$;

-- Row 22: a doctor left a clinic (leave_clinic; clinic_remove_doctor is the
-- admin's own action and is skipped by notify() as the actor). Now on the
-- membership row; the 0043 trigger on doctor_profiles is dropped in 12.
create or replace function public.tg_notify_clinic_doctor_left()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner  uuid;
  v_doctor text;
begin
  begin
    select owner_user_id into v_owner from public.clinics where id = old.clinic_id;
    select nullif(btrim(concat_ws(' ', u.first_name, u.last_name)), '')
      into v_doctor
      from public.doctor_profiles dp
      join public.users u on u.id = dp.user_id
     where dp.id = old.doctor_id;
    perform public.notify(v_owner, 'doctor_left', null,
                          jsonb_strip_nulls(jsonb_build_object('doctor', v_doctor)));
  exception when others then
    raise warning 'notify doctor_left (clinic %, doctor %): %', old.clinic_id, old.doctor_id, sqlerrm;
  end;
  return null;
end $$;

drop trigger if exists clinic_memberships_notify_left on public.clinic_memberships;
create trigger clinic_memberships_notify_left
  after delete on public.clinic_memberships
  for each row execute function public.tg_notify_clinic_doctor_left();

revoke all on function public._notification_parties(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.tg_notify_order_insert()           from public, anon, authenticated;
revoke all on function public.tg_notify_order_status()           from public, anon, authenticated;
revoke all on function public.tg_notify_order_price()            from public, anon, authenticated;
revoke all on function public.tg_notify_order_due()              from public, anon, authenticated;
revoke all on function public.tg_notify_order_paid()             from public, anon, authenticated;
revoke all on function public.tg_notify_clarification_asked()    from public, anon, authenticated;
revoke all on function public.tg_notify_clarification_answered() from public, anon, authenticated;
revoke all on function public.tg_notify_invoice_added()          from public, anon, authenticated;
revoke all on function public.tg_notify_order_invoice_seen()     from public, anon, authenticated;
revoke all on function public.tg_notify_order_edited()           from public, anon, authenticated;
revoke all on function public.tg_notify_clinic_doctor_left()     from public, anon, authenticated;
revoke all on function public.tg_orders_clinic_frozen()          from public, anon, authenticated;
revoke all on function public.tg_clinic_memberships_no_buyer()       from public, anon, authenticated;


-- ── 12. Realtime ─────────────────────────────────────────────────────────
-- A doctor's and a clinic's membership lists follow an accepted invite.
-- Realtime does not RLS-filter DELETE; the client never subscribes to it, so
-- leaving / removal shows on the next fetch, like every delete.

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'publication supabase_realtime does not exist; enable Realtime for the project, then re-run this block';
    return;
  end if;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime' and puballtables) then
    return;
  end if;
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public'
                    and tablename = 'clinic_memberships') then
    alter publication supabase_realtime add table public.clinic_memberships;
  end if;
end $$;


-- ── 13. Retire doctor_profiles.clinic_id ─────────────────────────────────

drop trigger if exists doctor_profiles_notify_left on public.doctor_profiles;
drop function if exists public.tg_notify_doctor_left();
drop trigger if exists doctor_profiles_protect_clinic_id on public.doctor_profiles;
drop function if exists public.tg_doctor_profiles_protect_clinic_id();
alter table public.doctor_profiles drop constraint if exists doctor_profiles_buyer_no_clinic;

-- Nothing may still read the column. A leftover would otherwise keep running
-- against a value nobody maintains; refuse before dropping instead.
do $$
declare
  v_left text;
begin
  select string_agg(p.oid::regprocedure::text, ', ')
    into v_left
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prosrc ~* '(\mdp\.clinic_id|doctor_profiles\.clinic_id|\mset\s+clinic_id\s*=)';
  if v_left is not null then
    raise exception '0050: still reading doctor_profiles.clinic_id, not dropping it: %', v_left
      using errcode = '55000';
  end if;

  select string_agg(schemaname || '.' || tablename || ' ' || policyname, ', ')
    into v_left
    from pg_policies
   where coalesce(qual, '') || ' ' || coalesce(with_check, '')
         ~* '(\mdp\.clinic_id|doctor_profiles\.clinic_id)';
  if v_left is not null then
    raise exception '0050: a policy still reads doctor_profiles.clinic_id: %', v_left
      using errcode = '55000';
  end if;

  -- And nothing still calls the two-argument _notification_parties dropped in
  -- 11 (inside an exception block it would only lose notifications quietly).
  select string_agg(p.oid::regprocedure::text, ', ')
    into v_left
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prosrc ~ '_notification_parties\(\s*[^,()]+,\s*[^,()]+\)';
  if v_left is not null then
    raise exception '0050: still calling _notification_parties(doctor, lab): %', v_left
      using errcode = '55000';
  end if;
end $$;

alter table public.doctor_profiles drop column if exists clinic_id;


-- ---------------------------------------------------------------------------
-- Verify (each should hold):
-- ---------------------------------------------------------------------------
--   -- 1. Shape:
--   select to_regclass('public.clinic_memberships') is not null;
--   select count(*) = 0 from information_schema.columns
--    where table_schema = 'public' and table_name = 'doctor_profiles' and column_name = 'clinic_id';
--   select count(*) = 3 from information_schema.columns
--    where table_schema = 'public'
--      and (table_name, column_name) in (('orders', 'clinic_id'), ('clinics', 'working_address'),
--                                        ('clinics', 'invoice_email'));
--   select is_nullable = 'YES' from information_schema.columns
--    where table_schema = 'public' and table_name = 'orders' and column_name = 'doctor_work_location_id';
--
--   -- 2. The backfill left nothing behind: every membership became a row, and
--   --    no order of a member doctor is clinic-less unless it is newer than 0050
--   --    (both 0 right after applying):
--   select count(*) from public.orders o
--    where o.clinic_id is null and o.buyer_lab_id is null
--      and exists (select 1 from public.clinic_memberships cd where cd.doctor_id = o.doctor_id);
--
--   -- 3. clinic_memberships: RLS on, read-only to clients:
--   select relrowsecurity from pg_class where oid = 'public.clinic_memberships'::regclass;   -- t
--   select has_table_privilege('authenticated', 'public.clinic_memberships', 'select'),       -- t
--          has_table_privilege('authenticated', 'public.clinic_memberships', 'insert'),       -- f
--          has_table_privilege('authenticated', 'public.clinic_memberships', 'delete'),       -- f
--          has_table_privilege('anon', 'public.clinic_memberships', 'select');               -- f
--
--   -- 4. No function or policy names the old column (0 rows each):
--   select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.prosrc ~* '(\mdp\.clinic_id|doctor_profiles\.clinic_id)';
--   select policyname from pg_policies
--    where coalesce(qual, '') || coalesce(with_check, '') ~* 'doctor_profiles\.clinic_id';
--   select count(*) = 0 from pg_policies
--    where schemaname = 'public' and policyname = 'work_locations_clinic_select';
--
--   -- 5. One submit_order and one _submit_order_impl (no ambiguous overloads):
--   select count(*) = 1 from pg_proc where proname = 'submit_order';
--   select count(*) = 1 from pg_proc where proname = '_submit_order_impl';
--   select count(*) = 1 from pg_proc where proname = '_notification_parties';
--   select count(*) = 1 from pg_proc where proname = 'leave_clinic';
--
--   -- 6. Two clinics, one doctor, in a transaction you roll back (as postgres;
--   --    set request.jwt.claims for each actor). Expected:
--   --    * the doctor (sub = their user id): sees every order of theirs;
--   --      submit_order(..., p_clinic_id => A) → an order with clinic_id = A,
--   --      delivered to A's working_address, recipient CLINIC with A's legal name;
--   --      p_private => true → clinic_id null, their own location;
--   --      p_clinic_id => a clinic they are not in → not_in_clinic;
--   --      A with no working_address → clinic_address_missing.
--   --    * admin of A: select * from orders → only clinic_id = A rows; the
--   --      private order and B's orders are invisible; complete / cancel /
--   --      edit_order on a B order → not_your_order / not allowed;
--   --      find_matching_patient for a patient only B has orders for → no row.
--   --    * admin of B: the mirror image.
--   --    * leave_clinic(A) as the doctor → A still sees and can act on its
--   --      orders; A's clinic_submit_order for the doctor → not in your clinic.
--   --    * a lab owner (buying profile): respond_clinic_invite → not_a_doctor;
--   --      submit_order(p_clinic_id => any) → not_in_clinic.
-- ---------------------------------------------------------------------------
