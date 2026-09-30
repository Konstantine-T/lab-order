-- ---------------------------------------------------------------------------
-- 0038 — a lab's price lists: up to three files, one per language.
--
-- Doctors asked to see a lab's full price list before ordering — the services
-- on the marketplace show "from" prices, not the lab's whole sheet. A lab can
-- now upload one file per language (ka, en, ru), each optional; the
-- marketplace card and the lab's public page show one "Price list" button that
-- opens the file for the reader's language, falling back ka → en → ru.
--
-- STORAGE
--   A PUBLIC bucket, `lab-price-lists`, like `service-images` (0025) and for
--   the same reason: the catalogue is public — guests browse it signed out —
--   and a price list is something the lab chose to publish on it. Public means
--   the button is a plain link, not a signed URL minted per card per page load.
--   PDF, JPG and PNG only, 10 MB each.
--
--   Path convention: <lab_id>/<lang>.<ext>. The write policies read folder [1]
--   as the owning lab and the file name as the language, so the shape is
--   load-bearing. Uploads overwrite in place (upsert), which in Supabase needs
--   SELECT and UPDATE policies next to INSERT; SELECT is the owner's own
--   folder only. Nobody else needs one: public objects are served without RLS,
--   and there is no reason to let anyone list the bucket.
--
-- THE ROW
--   labs.price_lists jsonb, default '{}':
--     {"ka": {"path": "<lab_id>/ka.pdf", "name": "ფასები 2026.pdf",
--             "uploaded_at": "2026-10-01T09:30:00.000Z"}, "en": {...}}
--   `name` is the file name the lab picked, shown back to it on its profile;
--   `uploaded_at` goes on the public URL as ?v= so replacing a file under the
--   same path doesn't serve a cached copy of the old one.
--
-- WHO MAY WRITE IT
--   Owner decision: price lists are operational content, not identity, so an
--   APPROVED lab manages them without a new admin review. The write path is
--   `set_lab_price_list`, a SECURITY DEFINER RPC that checks ownership, the
--   language and the path shape, and touches only this column.
--   `labs_owner_update` (0004) is column-blind, so a trigger
--   (labs_price_lists_via_rpc, below) refuses a direct client write to this
--   column, as 0037 does for translations. The CHECK constraint below also
--   holds every write to the same shape — in particular, every path must sit
--   in the lab's own folder, so a lab cannot point its button at another lab's
--   file. (That policy's wider gap — approved labs can directly edit their
--   locked fields — is described in 0037 and not changed here.)
--
-- NO RLS OR GRANT CHANGE ON labs — see 0037; the column is readable wherever
-- the row is, which is what lets guests see the button.
--
-- ⚠️ Apply BEFORE shipping the client that selects this column (marketplace,
--    lab public page, lab profile), for the same reason as 0037.
--
-- Fully idempotent — safe to re-run.
-- ---------------------------------------------------------------------------

alter table public.labs
  add column if not exists price_lists jsonb not null default '{}'::jsonb;

comment on column public.labs.price_lists is
  'Optional price-list files, one per language:
   {"ka": {"path": "<lab_id>/ka.pdf", "name": "...", "uploaded_at": "..."}, "en": {...}, "ru": {...}}
   Files live in the public lab-price-lists bucket. Written through
   set_lab_price_list (0038).';


-- ── The shape, in one place ────────────────────────────────────────────────
-- Takes the row's id because a path is only valid inside that lab's folder.
-- Immutable: it reads nothing but its arguments.
create or replace function public.lab_price_lists_valid(p_lab_id uuid, p jsonb)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  v_lang  text;
  v_entry jsonb;
  v_key   text;
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    return false;
  end if;

  for v_lang, v_entry in select key, value from jsonb_each(p) loop
    if v_lang not in ('ka', 'en', 'ru') or jsonb_typeof(v_entry) <> 'object' then
      return false;
    end if;
    for v_key in select jsonb_object_keys(v_entry) loop
      if v_key not in ('path', 'name', 'uploaded_at') then
        return false;
      end if;
    end loop;
    if jsonb_typeof(v_entry -> 'path') is distinct from 'string'
       or jsonb_typeof(v_entry -> 'name') is distinct from 'string'
       or jsonb_typeof(v_entry -> 'uploaded_at') is distinct from 'string' then
      return false;
    end if;
    -- The lab's own folder, this language, an allowed extension.
    if (v_entry ->> 'path') !~
       ('^' || p_lab_id::text || '/' || v_lang || '\.(pdf|jpg|jpeg|png)$') then
      return false;
    end if;
    if char_length(v_entry ->> 'name') not between 1 and 255
       or char_length(v_entry ->> 'uploaded_at') > 40 then
      return false;
    end if;
  end loop;

  return true;
end $$;

-- Dropped and re-added so a replay picks up any change to the function above.
alter table public.labs drop constraint if exists labs_price_lists_valid;
alter table public.labs
  add constraint labs_price_lists_valid
  check (public.lab_price_lists_valid(id, price_lists));


-- ── The bucket ─────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'lab-price-lists',
  'lab-price-lists',
  true,
  10485760, -- 10 MB
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- The owning lab's folder, compared as text: a policy predicate must never
-- throw on a path that isn't shaped as expected, and `'x'::uuid` would. An
-- EXISTS rather than `= (select l.id …)` because owner_user_id is not unique,
-- and a scalar subquery returning two rows raises.

-- Insert: only <own lab id>/<ka|en|ru>.<pdf|jpg|jpeg|png>, nothing deeper.
drop policy if exists "lab-price-lists: owner insert" on storage.objects;
create policy "lab-price-lists: owner insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'lab-price-lists'
    and array_length(storage.foldername(name), 1) = 1
    and storage.filename(name) ~ '^(ka|en|ru)\.(pdf|jpg|jpeg|png)$'
    and exists (
      select 1 from public.labs l
      where l.owner_user_id = auth.uid()
        and l.id::text = (storage.foldername(name))[1]
    )
  );

-- Update: re-uploading over an existing key (upsert). Same shape both sides.
drop policy if exists "lab-price-lists: owner update" on storage.objects;
create policy "lab-price-lists: owner update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'lab-price-lists'
    and exists (
      select 1 from public.labs l
      where l.owner_user_id = auth.uid()
        and l.id::text = (storage.foldername(name))[1]
    )
  )
  with check (
    bucket_id = 'lab-price-lists'
    and array_length(storage.foldername(name), 1) = 1
    and storage.filename(name) ~ '^(ka|en|ru)\.(pdf|jpg|jpeg|png)$'
    and exists (
      select 1 from public.labs l
      where l.owner_user_id = auth.uid()
        and l.id::text = (storage.foldername(name))[1]
    )
  );

-- Delete: anything in the owner's own folder, so replacing a PDF with a PNG
-- (a different key) or removing a list doesn't orphan the old file.
drop policy if exists "lab-price-lists: owner delete" on storage.objects;
create policy "lab-price-lists: owner delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'lab-price-lists'
    and exists (
      select 1 from public.labs l
      where l.owner_user_id = auth.uid()
        and l.id::text = (storage.foldername(name))[1]
    )
  );

-- Select: the owner's own folder. Needed by upsert and delete, which read the
-- existing object first; public downloads do not go through RLS at all.
drop policy if exists "lab-price-lists: owner select" on storage.objects;
create policy "lab-price-lists: owner select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'lab-price-lists'
    and exists (
      select 1 from public.labs l
      where l.owner_user_id = auth.uid()
        and l.id::text = (storage.foldername(name))[1]
    )
  );


-- ── The write path ─────────────────────────────────────────────────────────
-- Sets (p_path given) or clears (p_path null) one language's price list.
-- The client uploads to storage first and then calls this, so the row never
-- points at a file that is not there. That order is not re-checked against
-- storage.objects here: whether the definer may read that table depends on
-- role grants this repo does not control, and a wrong guess would refuse every
-- upload. What the check would add is small — the path is already confined to
-- the caller's own folder, so the worst a hand-made call can do is break the
-- caller's own button.
-- Returns the stored column and the path it replaced, so the client can
-- best-effort remove an old object stored under a different extension.
create or replace function public.set_lab_price_list(
  p_lab_id uuid,
  p_lang   text,
  p_path   text,
  p_name   text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lists jsonb;
  v_prev  text;
  v_path  text := nullif(btrim(coalesce(p_path, '')), '');
  v_name  text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  -- coalesce: a NULL here must refuse, not fall through (0036's lesson).
  if p_lab_id is null or not coalesce(public.current_user_owns_lab(p_lab_id), false) then
    raise exception 'not_your_lab' using errcode = '42501';
  end if;
  if p_lang is null or p_lang not in ('ka', 'en', 'ru') then
    raise exception 'invalid_price_list_lang' using errcode = '22023';
  end if;

  select coalesce(price_lists, '{}'::jsonb) into v_lists
    from public.labs where id = p_lab_id
    for update;
  v_prev := v_lists -> p_lang ->> 'path';

  if v_path is null then
    v_lists := v_lists - p_lang;
  else
    if v_path !~ ('^' || p_lab_id::text || '/' || p_lang || '\.(pdf|jpg|jpeg|png)$') then
      raise exception 'invalid_price_list_type' using errcode = '22023';
    end if;

    -- The name is only ever shown back to the lab; keep it, trimmed and
    -- bounded, and fall back to the stored key when the client sent none.
    v_name := left(regexp_replace(coalesce(p_name, ''), '^\s+|\s+$', '', 'g'), 255);
    if v_name = '' then
      v_name := split_part(v_path, '/', 2);
    end if;

    v_lists := v_lists || jsonb_build_object(
      p_lang,
      jsonb_build_object(
        'path', v_path,
        'name', v_name,
        'uploaded_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      )
    );
  end if;

  update public.labs
     set price_lists = v_lists
   where id = p_lab_id;

  return jsonb_build_object('price_lists', v_lists, 'previous_path', v_prev);
end $$;

revoke all on function public.set_lab_price_list(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.set_lab_price_list(uuid, text, text, text)
  to authenticated;


-- ── Only through the RPC ───────────────────────────────────────────────────
-- Same mechanism as labs_public_translations_via_rpc (0037): a client role
-- (anon / authenticated) may not change the column directly; the SECURITY
-- DEFINER RPC runs as its owner and passes. Not SECURITY DEFINER itself.
create or replace function public.tg_labs_price_lists_via_rpc()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.price_lists is distinct from old.price_lists
     and current_user in ('anon', 'authenticated') then
    raise exception 'price_lists_rpc_only' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists labs_price_lists_via_rpc on public.labs;
create trigger labs_price_lists_via_rpc
  before update of price_lists on public.labs
  for each row execute function public.tg_labs_price_lists_via_rpc();

-- ---------------------------------------------------------------------------
-- Verify:
-- ---------------------------------------------------------------------------
--   -- 1. The column exists, defaults to {} and every lab passes the CHECK:
--   select column_name, column_default, is_nullable
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'labs' and column_name = 'price_lists';
--   -- '{}'::jsonb | NO
--   select count(*) from public.labs where price_lists <> '{}'::jsonb;        -- 0
--
--   -- 2. The bucket: public, 10 MB, three types.
--   select id, public, file_size_limit, allowed_mime_types
--     from storage.buckets where id = 'lab-price-lists';
--   -- lab-price-lists | t | 10485760 | {application/pdf,image/jpeg,image/png}
--
--   -- 3. The four owner policies:
--   select policyname, cmd from pg_policies
--    where schemaname = 'storage' and tablename = 'objects'
--      and policyname like 'lab-price-lists:%' order by 1;
--   -- owner delete | DELETE, owner insert | INSERT, owner select | SELECT, owner update | UPDATE
--
--   -- 4. The validator:
--   select public.lab_price_lists_valid('00000000-0000-0000-0000-000000000001', '{}');   -- true
--   select public.lab_price_lists_valid('00000000-0000-0000-0000-000000000001',
--     '{"ka":{"path":"00000000-0000-0000-0000-000000000001/ka.pdf","name":"a.pdf","uploaded_at":"2026-10-01T00:00:00.000Z"}}'); -- true
--   select public.lab_price_lists_valid('00000000-0000-0000-0000-000000000001',
--     '{"ka":{"path":"00000000-0000-0000-0000-000000000002/ka.pdf","name":"a.pdf","uploaded_at":"x"}}'); -- false (another lab's folder)
--   select public.lab_price_lists_valid('00000000-0000-0000-0000-000000000001',
--     '{"ka":{"path":"00000000-0000-0000-0000-000000000001/en.pdf","name":"a.pdf","uploaded_at":"x"}}'); -- false (wrong language)
--
--   -- 5. As a lab owner, in a transaction you roll back:
--   --      select set_config('request.jwt.claims', '{"sub":"<owner uuid>"}', true);
--   --      set local role authenticated;
--   --      select public.set_lab_price_list('<their lab>', 'ka', '<their lab>/ka.pdf', ' x.pdf ');
--   --      -- {"price_lists": {"ka": {"path": ..., "name": "x.pdf", "uploaded_at": ...}}, "previous_path": null}
--   --      select public.set_lab_price_list('<their lab>', 'ka', '<their lab>/en.pdf', 'x.pdf');
--   --      -- raises invalid_price_list_type (path is not this language's key)
--   --      select public.set_lab_price_list('<another lab>', 'ka', null, null); -- raises not_your_lab
--   --      select public.set_lab_price_list('<their lab>', 'de', null, null);   -- raises invalid_price_list_lang
--   --      update public.labs set price_lists = '{}' where id = '<their lab>';
--   --      -- raises price_lists_rpc_only once the lab has a price list
--
--   -- 6. From the app: upload a PDF for ka on /lab/profile, then as a guest
--   --    open /labs — the card shows "Price list" and the file opens.
-- ---------------------------------------------------------------------------
