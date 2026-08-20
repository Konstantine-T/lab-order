-- =============================================================================
-- Order files: add DELETE, and let clinics in.
--
-- What already exists (phase4-6.sql) and is NOT recreated here:
--   * the private `order-files` bucket (100 MB/file)
--   * public.order_files + its index, RLS enabled
--
-- What was missing and this migration adds:
--   1. DELETE — neither storage.objects nor order_files had one, so a file
--      could be attached but never removed. The edit page needs this.
--   2. CLINIC — every policy was doctor-or-lab. A clinic admin already submits
--      and edits orders on behalf of its doctors (migration 0014), so it has to
--      be able to see and attach their files too.
--
-- The clinic predicate is `can_act_for_doctor(o.doctor_id)` from 0014, reused
-- rather than reimplemented. Note it already returns true for the doctor
-- themselves, so it REPLACES `o.doctor_id = current_doctor_id()` rather than
-- being OR'd next to it.
--
-- Path convention is load-bearing: <lab_id>/<order_id>/<filename>. The policies
-- below parse element [2] of the path as the order id (Postgres arrays are
-- 1-indexed), so any client that uploads a differently-shaped path will be
-- silently unauthorized.
--
-- Storage objects and order_files rows are kept deliberately symmetric: if a
-- participant may delete the object, they may delete the row. Letting them
-- diverge produces orphans in whichever side is stricter. The UI is narrower
-- than the policy on purpose (the lab is only offered a remove button on files
-- it uploaded) — that's a product choice, not a security boundary.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) storage.objects
-- ---------------------------------------------------------------------------

-- Read: doctor, that doctor's clinic admin, the lab, platform admin.
drop policy if exists "order-files: participants read" on storage.objects;
create policy "order-files: participants read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'order-files'
    and exists (
      select 1 from public.orders o
      where o.id::text = (string_to_array(name, '/'))[2]
        and (
          public.can_act_for_doctor(o.doctor_id)
          or public.current_user_owns_lab(o.lab_id)
          or public.current_user_role() = 'PLATFORM_ADMIN'
        )
    )
  );

-- Upload: replaces the separate "doctor upload" / "lab upload" pair — same
-- predicate shape, one policy, now including clinics. The old two are dropped
-- so they don't linger as redundant grants.
drop policy if exists "order-files: doctor upload" on storage.objects;
drop policy if exists "order-files: lab upload" on storage.objects;
drop policy if exists "order-files: participants upload" on storage.objects;
create policy "order-files: participants upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'order-files'
    and exists (
      select 1 from public.orders o
      where o.id::text = (string_to_array(name, '/'))[2]
        and (
          public.can_act_for_doctor(o.doctor_id)
          or public.current_user_owns_lab(o.lab_id)
        )
    )
  );

-- Delete: the missing piece. Without it a file is permanent once attached.
drop policy if exists "order-files: participants delete" on storage.objects;
create policy "order-files: participants delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'order-files'
    and exists (
      select 1 from public.orders o
      where o.id::text = (string_to_array(name, '/'))[2]
        and (
          public.can_act_for_doctor(o.doctor_id)
          or public.current_user_owns_lab(o.lab_id)
          or public.current_user_role() = 'PLATFORM_ADMIN'
        )
    )
  );

-- ---------------------------------------------------------------------------
-- 2) public.order_files — mirror the same rules on the metadata rows.
-- ---------------------------------------------------------------------------
alter table public.order_files enable row level security;

drop policy if exists order_files_participants_select on public.order_files;
create policy order_files_participants_select on public.order_files
  for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (
          public.can_act_for_doctor(o.doctor_id)
          or public.current_user_owns_lab(o.lab_id)
          or public.current_user_role() = 'PLATFORM_ADMIN'
        )
    )
  );

-- Insert: one policy replacing the doctor/lab pair. `uploaded_by_user_id =
-- auth.uid()` is kept from the originals — it stops a participant attributing
-- an upload to somebody else.
drop policy if exists order_files_doctor_insert on public.order_files;
drop policy if exists order_files_lab_insert on public.order_files;
drop policy if exists order_files_participants_insert on public.order_files;
create policy order_files_participants_insert on public.order_files
  for insert to authenticated
  with check (
    uploaded_by_user_id = auth.uid()
    and exists (
      select 1 from public.orders o
      where o.id = order_id
        and (
          public.can_act_for_doctor(o.doctor_id)
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
          public.can_act_for_doctor(o.doctor_id)
          or public.current_user_owns_lab(o.lab_id)
          or public.current_user_role() = 'PLATFORM_ADMIN'
        )
    )
  );

-- No UPDATE policy anywhere: a file row is immutable — you attach it or you
-- remove it. Same shape as the feedback table.

-- The bucket is created in phase4-6.sql; asserted here (not recreated) so a
-- fresh database that only ran the numbered migrations still gets it.
insert into storage.buckets (id, name, public, file_size_limit)
values ('order-files', 'order-files', false, 104857600)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Verify (every one should be true):
-- ---------------------------------------------------------------------------
--   select count(*) = 3 from pg_policies
--     where schemaname='storage' and tablename='objects'
--       and policyname like 'order-files:%';
--   select count(*) = 3 from pg_policies
--     where schemaname='public' and tablename='order_files';
--   select not public from storage.buckets where id='order-files';
