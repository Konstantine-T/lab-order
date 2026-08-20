-- Feedback attachments: let a sender screenshot the case they're reporting.
--
-- The original feedback design (docs/superpowers/specs/2026-07-29-feedback-button-design.md)
-- ruled attachments out of scope. They're back in: reports about a specific
-- broken screen are far more actionable with a picture of it.
--
-- Screenshots of this app routinely contain patient names, so the bucket is
-- PRIVATE. Senders write into their own folder and can never read it back —
-- the same write-only-mailbox shape the feedback table already has. Only the
-- platform admin reads (through short-lived signed URLs) and deletes.

-- ---------------------------------------------------------------------------
-- 1) The paths live on the feedback row itself.
-- ---------------------------------------------------------------------------
-- Storage keys, not URLs: the bucket is private, so the admin client mints a
-- signed URL per path at read time. A separate child table would need its own
-- insert policy for a write-only sender and buys nothing at max 3 images.
alter table public.feedback
  add column if not exists image_paths text[] not null default '{}';

-- ---------------------------------------------------------------------------
-- 2) Private bucket.
-- ---------------------------------------------------------------------------
-- 5 MB and an image-only mime allowlist are enforced here as well as in the
-- client, because the client limit is only a courtesy.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'feedback-images',
  'feedback-images',
  false,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Path convention: <user_id>/<uuid>.<ext>

-- Sender: upload into their own folder only. Mirrors feedback_insert_self —
-- admins receive feedback, they don't send it.
drop policy if exists "feedback-images: sender upload" on storage.objects;
create policy "feedback-images: sender upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'feedback-images'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.current_user_role() <> 'PLATFORM_ADMIN'
  );

-- Admin: read every attachment. No sender SELECT policy — write-only mailbox.
drop policy if exists "feedback-images: admin read" on storage.objects;
create policy "feedback-images: admin read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'feedback-images'
    and public.current_user_role() = 'PLATFORM_ADMIN'
  );

-- Admin: delete, so removing a feedback can take its images with it. Senders
-- get no DELETE policy — they must not be able to blank out what was reported.
drop policy if exists "feedback-images: admin delete" on storage.objects;
create policy "feedback-images: admin delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'feedback-images'
    and public.current_user_role() = 'PLATFORM_ADMIN'
  );

-- ---------------------------------------------------------------------------
-- 3) Insert policy: the paths on the row must be the sender's own.
-- ---------------------------------------------------------------------------
-- A table CHECK constraint can't do this (auth.uid() isn't immutable), so the
-- ownership and count limits ride on the RLS policy instead. Without this a
-- sender could point a feedback row at somebody else's folder.
drop policy if exists feedback_insert_self on public.feedback;
create policy feedback_insert_self on public.feedback
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.current_user_role() <> 'PLATFORM_ADMIN'
    and coalesce(array_length(image_paths, 1), 0) <= 3
    and not exists (
      select 1 from unnest(image_paths) as p
      where split_part(p, '/', 1) <> auth.uid()::text
    )
  );

-- ---------------------------------------------------------------------------
-- 4) Admin list gains the paths.
-- ---------------------------------------------------------------------------
-- The OUT column list changes, so the function has to be dropped rather than
-- replaced. Body is otherwise identical to migration 0016.
drop function if exists public.admin_feedback_list();

create function public.admin_feedback_list()
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
  org_name text,
  image_paths text[]
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
             where c.owner_user_id = u.id order by c.created_at limit 1)),
         f.image_paths
  from public.feedback f
  join public.users u on u.id = f.user_id
  where public.current_user_role() = 'PLATFORM_ADMIN'
  order by f.created_at desc;
$$;

grant execute on function public.admin_feedback_list() to authenticated;
