-- Feedback: any non-admin user can send a short message to the platform admin.
-- Admin reads and deletes; nobody replies in-app and nothing is ever updated.
--
-- See docs/superpowers/specs/2026-07-29-feedback-button-design.md.

create table if not exists public.feedback (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  message    text not null check (char_length(btrim(message)) between 1 and 2000),
  page_path  text,          -- in-app route at send time, e.g. /doctor/orders/new
  lang       text,          -- UI language at send time: en | ka | ru
  created_at timestamptz not null default now()
);

create index if not exists feedback_created_idx on public.feedback (created_at desc);

alter table public.feedback enable row level security;

-- Sender: insert only, only as themselves, never as admin. There is no SELECT
-- policy for senders — this is a write-only mailbox, so the client must insert
-- WITHOUT .select() (a RETURNING clause would be blocked here).
drop policy if exists feedback_insert_self on public.feedback;
create policy feedback_insert_self on public.feedback
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.current_user_role() <> 'PLATFORM_ADMIN'
  );

-- Admin: read all, delete any. No UPDATE policy anywhere — feedback is immutable.
drop policy if exists feedback_admin_select on public.feedback;
create policy feedback_admin_select on public.feedback
  for select to authenticated
  using (public.current_user_role() = 'PLATFORM_ADMIN');

drop policy if exists feedback_admin_delete on public.feedback;
create policy feedback_admin_delete on public.feedback
  for delete to authenticated
  using (public.current_user_role() = 'PLATFORM_ADMIN');

-- ---------------------------------------------------------------------------
-- Admin list: feedback joined to the sender's contact card.
--
-- org_name uses scalar subselects, NOT joins: users -> labs is 1:N, so a left
-- join would emit one row per owned lab and duplicate the feedback. Doctors own
-- neither a lab nor a clinic and get null.
--
-- Contact details are read live rather than snapshotted onto the feedback row:
-- a support contact card should show the person's current phone, not the one
-- they had when they wrote in.
-- ---------------------------------------------------------------------------
create or replace function public.admin_feedback_list()
returns table (
  id uuid,
  message text,
  page_path text,
  lang text,
  created_at timestamptz,
  user_id uuid,
  first_name text,
  last_name text,
  email text,
  phone text,
  role public.user_role,
  org_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select f.id, f.message, f.page_path, f.lang, f.created_at,
         u.id, u.first_name, u.last_name, u.email, u.phone, u.role,
         coalesce(
           (select l.public_name from public.labs l
             where l.owner_user_id = u.id order by l.created_at limit 1),
           (select c.public_name from public.clinics c
             where c.owner_user_id = u.id order by c.created_at limit 1))
  from public.feedback f
  join public.users u on u.id = f.user_id
  where public.current_user_role() = 'PLATFORM_ADMIN'
  order by f.created_at desc;
$$;

grant execute on function public.admin_feedback_list() to authenticated;
