-- ---------------------------------------------------------------------------
-- 0025 — Cover images for lab services.
--
-- `lab_services.cover_image_url` has existed since 0002 but the only way to
-- fill it was to paste a URL into a text box, which means the image lived on
-- somebody else's server and broke whenever that server did. This gives the
-- column a home: labs upload the file and we store our own URL.
--
-- The bucket is PUBLIC, unlike order-files and feedback-images. Those hold
-- patient work and private complaints; this holds a picture a lab chose to put
-- on its own marketplace listing, shown to every doctor browsing. A public
-- bucket means the marketplace renders <img src> directly instead of minting a
-- signed URL per card per page load.
--
-- Path convention: <lab_id>/<uuid>.<ext> — the write policies read element [1]
-- as the owning lab, so the shape is load-bearing.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'service-images',
  'service-images',
  true,
  5242880, -- 5 MB
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- The owning lab's folder, as text. Compared as text rather than cast to uuid:
-- a policy predicate must never throw on a path that isn't shaped as expected,
-- and `'not-a-uuid'::uuid` would.
--
-- Write access only. Reads need no policy — the bucket is public.
drop policy if exists "service-images: lab upload" on storage.objects;
create policy "service-images: lab upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'service-images'
    and (storage.foldername(name))[1] =
        (select l.id::text from public.labs l where l.owner_user_id = auth.uid())
  );

-- Update covers re-uploading over an existing key.
drop policy if exists "service-images: lab update" on storage.objects;
create policy "service-images: lab update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'service-images'
    and (storage.foldername(name))[1] =
        (select l.id::text from public.labs l where l.owner_user_id = auth.uid())
  );

-- Delete, so replacing or clearing a cover doesn't leave the old file orphaned
-- in the bucket forever.
drop policy if exists "service-images: lab delete" on storage.objects;
create policy "service-images: lab delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'service-images'
    and (storage.foldername(name))[1] =
        (select l.id::text from public.labs l where l.owner_user_id = auth.uid())
  );
