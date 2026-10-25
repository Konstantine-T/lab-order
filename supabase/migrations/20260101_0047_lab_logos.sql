-- ---------------------------------------------------------------------------
-- 0047 — lab logos are uploaded files, not pasted links.
--
-- `labs.logo_url` (0002) was filled by pasting a URL into the lab profile, so
-- the picture on every marketplace card lived on somebody else's server and
-- broke whenever that server did; and the field was disabled for an approved
-- lab, which therefore could not change its logo at all. Owner decisions:
--
--   * Upload only. The text box goes; the lab uploads a PNG, JPG or WebP into
--     our own bucket and the column holds that file's public URL. A logo
--     already set by a link keeps showing until the lab uploads a new one.
--   * An approved lab may change its logo at any time, with no new review —
--     storefront content, not identity (same rule as 0037's translations).
--     0040's identity lock already leaves logo_url out, so nothing to unlock.
--
-- STORAGE
--   A PUBLIC bucket, `lab-logos`, exactly like `service-images` (0025): the
--   logo is on every catalogue card, guests included, so <img src> loads it
--   directly instead of minting a signed URL per card per page load.
--   PNG, JPEG and WebP only, 2 MB. No SVG: an SVG can carry script.
--
--   Path convention: <lab_id>/<uuid>.<ext>. The policies read folder [1] as
--   the owning lab, so the shape is load-bearing. Insert / update / delete for
--   `authenticated` in the caller's own lab folder, compared as text as 0025
--   does (a policy predicate must never throw on a badly shaped path), plus a
--   SELECT on that same folder — not for reading the logo (public objects are
--   served without RLS) but because a DELETE that reads the row is also held
--   to SELECT policies; without it removing the old file silently matches
--   nothing (0038 has the same policy for the same reason). Nobody else can
--   list the bucket.
--
--   The policies mirror 0025's and, like them, do not look at the lab's
--   approval status: a SUSPENDED or REJECTED lab is out of the catalogue
--   (labs_marketplace_read), so its logo is shown nowhere public. The profile
--   page offers the upload only to a lab in review or approved.
--
-- CLOSING THE URL LOOPHOLE
--   Without the text box a lab could still `PATCH labs.logo_url` to any address
--   through the REST API (`labs_owner_update`, 0004, is column-blind). A BEFORE
--   UPDATE trigger, fired only when logo_url changes, lets through:
--     * NULL (removing the logo);
--     * a URL of a file in this lab's own folder of the bucket — an http(s) URL
--       whose path is exactly /storage/v1/object/public/lab-logos/<labs.id>/<file>
--       (one file segment; no further folders, query or fragment), which is
--       what supabase-js getPublicUrl() returns for the client's upload;
--     * any value written by a trusted path: an RPC running as its definer, the
--       SQL editor, the service role (`current_user` not anon / authenticated —
--       the function is deliberately NOT SECURITY DEFINER, as in 0040), or a
--       platform admin;
--   and refuses everything else from a client with `logo_url_not_uploaded`
--   (42501). The client maps it to translated text (labProfileErrors.ts).
--   A logo already set by a link is untouched: the trigger fires only on a
--   change, so a lab saving the rest of its profile never trips over it (the
--   profile form no longer sends logo_url at all).
--
--   NOT CHECKED: the URL's host. The database does not know the project's own
--   URL, so a crafted https://elsewhere/storage/v1/object/public/lab-logos/<id>/x
--   passes. The path check still stops a pasted third-party link and a pointer
--   at another lab's folder, which is what the ticket asks for.
--
-- Trigger order: Postgres fires BEFORE triggers in name order;
-- labs_logo_url_uploaded_only sorts after 0040's labs_lock_identity_after_approval
-- and before 0003's / 0037's / 0038's. None of those touches logo_url.
--
-- No client-facing schema change (logo_url already exists and is already in
-- 0039's guest column list), so this can be applied before or after the client.
--
-- Fully idempotent — safe to re-run.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'lab-logos',
  'lab-logos',
  true,
  2097152, -- 2 MB
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- The owning lab's folder, compared as text as 0025 does: a policy predicate
-- must never throw on a path that isn't shaped as expected, and `'x'::uuid`
-- would. Written as 0038's EXISTS rather than 0025's `= (select l.id …)`:
-- the same rows for an owner with one lab, but owner_user_id is not unique,
-- and a scalar subquery returning two rows raises.

drop policy if exists "lab-logos: lab upload" on storage.objects;
create policy "lab-logos: lab upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'lab-logos'
    and exists (
      select 1 from public.labs l
      where l.owner_user_id = auth.uid()
        and l.id::text = (storage.foldername(name))[1]
    )
  );

-- Update covers re-uploading over an existing key (the client never does —
-- every upload is a new <uuid> name — but it keeps the set aligned with 0025).
drop policy if exists "lab-logos: lab update" on storage.objects;
create policy "lab-logos: lab update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'lab-logos'
    and exists (
      select 1 from public.labs l
      where l.owner_user_id = auth.uid()
        and l.id::text = (storage.foldername(name))[1]
    )
  );

-- Delete, so replacing or removing a logo doesn't leave the old file orphaned
-- in the bucket forever.
drop policy if exists "lab-logos: lab delete" on storage.objects;
create policy "lab-logos: lab delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'lab-logos'
    and exists (
      select 1 from public.labs l
      where l.owner_user_id = auth.uid()
        and l.id::text = (storage.foldername(name))[1]
    )
  );

-- Select: the owner's own folder only. Not for showing the logo — public
-- objects are served without RLS — but because Postgres applies SELECT
-- policies to any UPDATE / DELETE that reads the row (storage's remove() is a
-- DELETE … WHERE name IN (…) RETURNING), so without it the delete policy
-- matches nothing and a replaced logo stays in the bucket. 0038 has the same
-- policy for the same reason; 0025 lacks it (see the note in the ticket's
-- report). Nobody else can list the bucket.
drop policy if exists "lab-logos: lab select" on storage.objects;
create policy "lab-logos: lab select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'lab-logos'
    and exists (
      select 1 from public.labs l
      where l.owner_user_id = auth.uid()
        and l.id::text = (storage.foldername(name))[1]
    )
  );

create or replace function public.tg_labs_logo_url_uploaded_only()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Removing the logo is always allowed.
  if new.logo_url is null then
    return new;
  end if;

  -- Not a client request: an RPC running as its definer, the SQL editor, the
  -- service role.
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if coalesce(public.current_user_role() = 'PLATFORM_ADMIN', false) then
    return new;
  end if;

  -- A file in this lab's own folder of the public bucket. The id is a uuid
  -- (hex and dashes), so it needs no regex escaping.
  if new.logo_url ~ ('^https?://[^/?#]+/storage/v1/object/public/lab-logos/'
                     || new.id::text || '/[^/?#]+$') then
    return new;
  end if;

  raise exception 'logo_url_not_uploaded'
    using errcode = '42501',
          detail  = 'logo_url must point at a file uploaded to this lab''s folder of the lab-logos bucket, or be null.',
          hint    = 'Upload the logo from the lab profile page.';
end $$;

-- No EXECUTE grant or revoke: a trigger function cannot be called on its own,
-- and firing it is not privilege-checked against the writer.

drop trigger if exists labs_logo_url_uploaded_only on public.labs;
create trigger labs_logo_url_uploaded_only
  before update on public.labs
  for each row
  when (new.logo_url is distinct from old.logo_url)
  execute function public.tg_labs_logo_url_uploaded_only();

-- ---------------------------------------------------------------------------
-- Verify:
-- ---------------------------------------------------------------------------
--   -- 1. The bucket (expect: true | 2097152 | {image/png,image/jpeg,image/webp}):
--   select public, file_size_limit, allowed_mime_types
--     from storage.buckets where id = 'lab-logos';
--
--   -- 2. The four policies (expect 4 rows: DELETE, INSERT, SELECT, UPDATE):
--   select cmd from pg_policies
--    where schemaname = 'storage' and tablename = 'objects'
--      and policyname like 'lab-logos:%' order by cmd;
--
--   -- 3. The trigger, BEFORE UPDATE with its WHEN clause, enabled
--   --    (expect 1 row: labs_logo_url_uploaded_only | O | true):
--   select tgname, tgenabled, pg_get_triggerdef(oid) like '%WHEN%logo_url%'
--     from pg_trigger
--    where tgrelid = 'public.labs'::regclass and tgname = 'labs_logo_url_uploaded_only';
--
--   -- 4. As a lab owner, in a transaction you roll back:
--   --      begin;
--   --      select set_config('request.jwt.claims', '{"sub":"<owner uuid>","role":"authenticated"}', true);
--   --      set local role authenticated;
--   --      update public.labs set logo_url = 'https://example.com/x.png' where id = '<their lab>';
--   --      -- ERROR 42501 logo_url_not_uploaded
--   --      rollback;
--   --    Same for '…/storage/v1/object/public/lab-logos/<ANOTHER lab id>/x.png'.
--   --    These succeed (UPDATE 1):
--   --      update public.labs set logo_url = null where id = '<their lab>';
--   --      update public.labs set logo_url =
--   --        'https://<ref>.supabase.co/storage/v1/object/public/lab-logos/<their lab>/a.png'
--   --       where id = '<their lab>';
--   --      update public.labs set short_description = 'x' where id = '<their lab>';
--   --      -- (a lab in review whose logo is an old pasted link: not a logo change)
--
--   -- 5. From the app: /lab/profile → Upload logo → the marketplace card, the
--   --    profile header and the landing catalogue show it; a file appears
--   --    under lab-logos/<lab id>/ in Storage; Replace / Remove delete it.
-- ---------------------------------------------------------------------------
