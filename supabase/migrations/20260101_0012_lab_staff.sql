-- Phase: lab staff directory + order team assignments + order chats.
-- See docs/SPEC-lab-staff-telegram.md.
--
-- Staff are plain records owned by a lab — NOT auth accounts. Phone is
-- required (Telegram chat creation resolves members by phone); email optional.
--
-- NOTE: this migration intentionally does NOT redefine handle_new_user() or
-- submit_order — 20260101_0011_clinics.sql must remain the runtime winner for
-- handle_new_user() (it carries the signup-role security guard).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.lab_staff (
  id                uuid primary key default gen_random_uuid(),
  lab_id            uuid not null references public.labs(id) on delete cascade,
  first_name        text not null,
  last_name         text not null,
  phone             text not null,          -- E.164, normalized client-side
  email             text,                   -- optional
  telegram_user_id  bigint,                 -- cached after first successful resolution
  archived_at       timestamptz,            -- soft delete (keeps history on past orders)
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists lab_staff_lab_idx on public.lab_staff(lab_id);
create unique index if not exists lab_staff_unique_active_phone
  on public.lab_staff (lab_id, phone) where archived_at is null;

create table if not exists public.order_staff_assignments (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references public.orders(id) on delete cascade,
  staff_id            uuid not null references public.lab_staff(id) on delete cascade,
  assigned_by_user_id uuid references public.users(id) on delete set null,
  assigned_at         timestamptz not null default now(),
  unique (order_id, staff_id)
);

create index if not exists order_staff_assignments_order_idx on public.order_staff_assignments(order_id);
create index if not exists order_staff_assignments_staff_idx on public.order_staff_assignments(staff_id);

create table if not exists public.order_chats (
  order_id           uuid primary key references public.orders(id) on delete cascade,
  telegram_chat_id   bigint not null,
  invite_link        text not null,
  unadded_members    jsonb not null default '[]'::jsonb,  -- [{name, phone, reason}]
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at maintenance (reuses tg_set_updated_at from 0003_triggers.sql)
-- ---------------------------------------------------------------------------
drop trigger if exists lab_staff_set_updated_at on public.lab_staff;
create trigger lab_staff_set_updated_at
  before update on public.lab_staff
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- Integrity guard: an assignment's staff member must belong to the order's lab.
-- (RLS below also enforces this for client writes; the trigger protects
-- against any privileged path drifting.)
-- ---------------------------------------------------------------------------
create or replace function public.tg_assert_staff_matches_order_lab()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.orders o
    join public.lab_staff s on s.id = new.staff_id
    where o.id = new.order_id
      and s.lab_id = o.lab_id
  ) then
    raise exception 'staff member does not belong to the order''s lab'
      using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists order_staff_assignments_check_lab on public.order_staff_assignments;
create trigger order_staff_assignments_check_lab
  before insert or update on public.order_staff_assignments
  for each row execute function public.tg_assert_staff_matches_order_lab();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.lab_staff enable row level security;
alter table public.order_staff_assignments enable row level security;
alter table public.order_chats enable row level security;

-- lab_staff: lab owner full control; platform admin read.
-- Deliberately NO doctor policy — phones/emails never reach doctors; doctors
-- get names via the get_order_staff() RPC below.
drop policy if exists lab_staff_owner_all on public.lab_staff;
create policy lab_staff_owner_all on public.lab_staff
  for all to authenticated
  using (public.current_user_owns_lab(lab_id))
  with check (public.current_user_owns_lab(lab_id));

drop policy if exists lab_staff_admin_select on public.lab_staff;
create policy lab_staff_admin_select on public.lab_staff
  for select to authenticated
  using (public.current_user_role() = 'PLATFORM_ADMIN');

-- order_staff_assignments: the order's lab owner reads always, and may
-- assign/unassign while the order is non-terminal. Platform admin reads.
drop policy if exists order_staff_assignments_lab_select on public.order_staff_assignments;
create policy order_staff_assignments_lab_select on public.order_staff_assignments
  for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id and public.current_user_owns_lab(o.lab_id)
    )
  );

drop policy if exists order_staff_assignments_lab_insert on public.order_staff_assignments;
create policy order_staff_assignments_lab_insert on public.order_staff_assignments
  for insert to authenticated
  with check (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and public.current_user_owns_lab(o.lab_id)
        and o.status not in ('COMPLETED','CANCELLED')
    )
    and exists (
      select 1 from public.lab_staff s
      where s.id = staff_id
        and public.current_user_owns_lab(s.lab_id)
        and s.archived_at is null
    )
    -- Attribution can only be the caller (or null) — clients can't forge who assigned.
    and (assigned_by_user_id is null or assigned_by_user_id = auth.uid())
  );

drop policy if exists order_staff_assignments_lab_delete on public.order_staff_assignments;
create policy order_staff_assignments_lab_delete on public.order_staff_assignments
  for delete to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and public.current_user_owns_lab(o.lab_id)
        and o.status not in ('COMPLETED','CANCELLED')
    )
  );

drop policy if exists order_staff_assignments_admin_select on public.order_staff_assignments;
create policy order_staff_assignments_admin_select on public.order_staff_assignments
  for select to authenticated
  using (public.current_user_role() = 'PLATFORM_ADMIN');

-- order_chats: the row carries phone numbers in unadded_members
-- ([{name, phone, reason}]) that the userbot could not add by phone, so it is
-- read directly ONLY by the order's lab owner (who needs the phones to share the
-- invite link) and PLATFORM_ADMIN. Doctors do NOT get table access — that would
-- leak staff phones and defeat the names-only guarantee that get_order_staff()
-- exists to enforce. Doctors receive only the invite link via get_order_chat().
-- Written ONLY by the create-order-chat Edge Function under the service role
-- (bypasses RLS) — no client INSERT/UPDATE/DELETE policies.
drop policy if exists order_chats_participants_select on public.order_chats;
drop policy if exists order_chats_lab_select on public.order_chats;
create policy order_chats_lab_select on public.order_chats
  for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (
          public.current_user_owns_lab(o.lab_id)
          or public.current_user_role() = 'PLATFORM_ADMIN'
        )
    )
  );

-- ---------------------------------------------------------------------------
-- Doctor-safe chat read: invite link only (never phones / telegram_chat_id /
-- unadded_members), gated to the order's participants.
-- ---------------------------------------------------------------------------
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
    );
$$;

-- ---------------------------------------------------------------------------
-- Doctor-safe staff read: names only (no phone/email), gated to participants.
-- ---------------------------------------------------------------------------
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
    )
  order by a.assigned_at;
$$;
