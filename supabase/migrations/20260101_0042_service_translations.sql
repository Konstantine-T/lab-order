-- ---------------------------------------------------------------------------
-- 0042 — a lab's services in three languages.
--
-- 0037 made the lab's own name and description trilingual. The services under
-- it were not: a Georgian, an English and a Russian doctor all read whatever
-- the lab typed as the service name, description and turnaround label. This
-- adds optional per-language copies of those three fields.
--
-- SHAPE (0037's, field names aside)
--   lab_services.translations jsonb, default '{}':
--     {"en": {"name": "...", "short_description": "...",
--             "average_turnaround_label": "..."}, "ru": {...}}
--   The existing columns stay the base and the fallback, whichever language
--   the lab wrote them in: a translation wins only when present and non-blank,
--   so a service that is never translated reads exactly as before.
--
-- WHAT IS NOT HERE, AND WHY
--   The lab's custom questions (label, helper_text, options[]), its material
--   names and its price description are translated too, but they live in the
--   form version's configuration_json / pricing_configuration_json, which the
--   editor already rewrites on every save (publish_lab_form, or a fresh DRAFT
--   version). Their translations ride inside that JSON as an optional
--   `translations` key, stored verbatim — publish_lab_form does not validate
--   or strip either document — so they need no DDL. Versions are immutable,
--   so an order keeps the wording it was answered with (owner decision).
--
-- WHO MAY WRITE IT
--   `set_lab_service_translations`, a SECURITY DEFINER RPC that checks the
--   caller owns the service's lab, validates the shape and touches only this
--   column. `lab_services_owner_all` (phase4-6) is an owner policy on every
--   column, so on its own that RPC would be decoration: the trigger
--   `lab_services_translations_via_rpc` refuses any change to the column made
--   by a client role (anon / authenticated) — an UPDATE that changes it, or an
--   INSERT that sets it to anything but {} — exactly as 0037 does for
--   labs.public_translations. Inside the RPC `current_user` is the function's
--   owner, so it passes; SQL-editor maintenance (postgres) passes too, and the
--   CHECK below still holds every write to the shape rules. As in 0037 the
--   RPC is the owner's: a platform admin edits a service's translations from
--   the SQL editor, not from the app.
--
--   Any approval status, and no new review: translations are copy, not
--   identity (the owner decision recorded in 0037). 0040's identity lock is on
--   `labs` only and does not touch services.
--
-- GUESTS (anon) — DECIDED, NOT ASSUMED
--   Since 0039, `anon` reads `labs` through a column list. `lab_services` is
--   different: it still carries the TABLE-level `grant select … to anon` of
--   phase4-6 §7, restated by 0034 and 0039, so this new column is readable by
--   a signed-out visitor (rows still gated by `lab_services_public_read`) —
--   which the guest catalogue, lab page and order wizard need. It is restated
--   below so this file says so itself, and step 5 of the verify block proves
--   it. Converting lab_services (and lab_forms, lab_form_versions and the two
--   platform template tables) to column lists, as 0039 did for labs, is a
--   separate change: none of them holds anything private today. WHEN THAT
--   CHANGE IS MADE, `translations` must be in lab_services' list, or the guest
--   catalogue and lab page fail with 42501 on this column.
--
-- SIDE EFFECT
--   Orders snapshot the whole service row (`to_jsonb(v_service)` in
--   _submit_order_impl), so new orders carry the translations in
--   `service_snapshot`. Order rows still read the snapshot's base name;
--   snapshots are never rewritten.
--
-- ⚠️ Apply BEFORE shipping the client that selects this column: the
--    marketplace, lab page and landing queries name it, and PostgREST rejects
--    a select of a column that does not exist.
--
-- Fully idempotent — safe to re-run.
-- ---------------------------------------------------------------------------

alter table public.lab_services
  add column if not exists translations jsonb not null default '{}'::jsonb;

comment on column public.lab_services.translations is
  'Doctor-facing display text in other languages:
   {"en": {"name": "...", "short_description": "...", "average_turnaround_label": "..."},
    "ru": {...}, "ka": {...}}
   name / short_description / average_turnaround_label remain the base and the
   fallback. Written through set_lab_service_translations (0042).';


-- ── The shape, in one place ────────────────────────────────────────────────
-- Used by the CHECK below and by the RPC. plpgsql rather than SQL so the type
-- tests run before jsonb_each() (see 0037).
--
--   * an object whose keys are only ka / en / ru
--   * each value an object whose keys are only name / short_description /
--     average_turnaround_label
--   * each of those a non-blank string: name 2–200 characters (trimmed, as
--     0037's public_name), short_description up to 2000,
--     average_turnaround_label up to 200
create or replace function public.lab_service_translations_valid(p jsonb)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  v_lang  text;
  v_body  jsonb;
  v_field text;
  v_val   jsonb;
  v_text  text;
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    return false;
  end if;

  for v_lang, v_body in select key, value from jsonb_each(p) loop
    if v_lang not in ('ka', 'en', 'ru') or jsonb_typeof(v_body) <> 'object' then
      return false;
    end if;

    for v_field, v_val in select key, value from jsonb_each(v_body) loop
      if v_field not in ('name', 'short_description', 'average_turnaround_label')
         or jsonb_typeof(v_val) <> 'string' then
        return false;
      end if;
      v_text := v_val #>> '{}';
      -- Blank means absent, and absent is stored as a missing key.
      if v_text !~ '\S' then
        return false;
      end if;
      if v_field = 'name'
         and (char_length(regexp_replace(v_text, '^\s+|\s+$', '', 'g')) < 2
              or char_length(v_text) > 200) then
        return false;
      end if;
      if v_field = 'short_description' and char_length(v_text) > 2000 then
        return false;
      end if;
      if v_field = 'average_turnaround_label' and char_length(v_text) > 200 then
        return false;
      end if;
    end loop;
  end loop;

  return true;
end $$;

-- Dropped and re-added so a replay picks up any change to the function above.
alter table public.lab_services drop constraint if exists lab_services_translations_valid;
alter table public.lab_services
  add constraint lab_services_translations_valid
  check (public.lab_service_translations_valid(translations));


-- ── The write path ─────────────────────────────────────────────────────────
-- Replaces the service's translations wholesale with `p_translations`, after:
--   * trimming every string and dropping blank fields and empty languages, so
--     an untouched language stores nothing rather than {"name": ""} and
--     "has this been translated?" stays answerable;
--   * rejecting unknown languages, unknown fields and non-string values;
--   * the length rules above.
-- A service that does not exist and one of another lab refuse alike, so the
-- error does not tell a stranger which service ids exist. Returns what was
-- stored.
create or replace function public.set_lab_service_translations(
  p_service_id   uuid,
  p_translations jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lab_id uuid;
  v_clean  jsonb := '{}'::jsonb;
  v_out    jsonb;
  v_lang   text;
  v_body   jsonb;
  v_field  text;
  v_val    jsonb;
  v_text   text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select s.lab_id into v_lab_id from public.lab_services s where s.id = p_service_id;
  -- coalesce: a NULL here must refuse, not fall through (0036's lesson).
  if v_lab_id is null or not coalesce(public.current_user_owns_lab(v_lab_id), false) then
    raise exception 'not_your_lab' using errcode = '42501';
  end if;

  if p_translations is null or jsonb_typeof(p_translations) = 'null' then
    p_translations := '{}'::jsonb;
  end if;
  if jsonb_typeof(p_translations) <> 'object' then
    raise exception 'invalid_translations' using errcode = '22023';
  end if;

  for v_lang, v_body in select key, value from jsonb_each(p_translations) loop
    if v_lang not in ('ka', 'en', 'ru') then
      raise exception 'invalid_translations' using errcode = '22023';
    end if;
    continue when jsonb_typeof(v_body) = 'null';
    if jsonb_typeof(v_body) <> 'object' then
      raise exception 'invalid_translations' using errcode = '22023';
    end if;

    v_out := '{}'::jsonb;
    for v_field, v_val in select key, value from jsonb_each(v_body) loop
      if v_field not in ('name', 'short_description', 'average_turnaround_label') then
        raise exception 'invalid_translations' using errcode = '22023';
      end if;
      continue when jsonb_typeof(v_val) = 'null';
      if jsonb_typeof(v_val) <> 'string' then
        raise exception 'invalid_translations' using errcode = '22023';
      end if;
      -- Trim whitespace of every kind, not only spaces (btrim's default).
      v_text := regexp_replace(v_val #>> '{}', '^\s+|\s+$', '', 'g');
      continue when v_text = '';
      v_out := v_out || jsonb_build_object(v_field, v_text);
    end loop;

    if v_out <> '{}'::jsonb then
      v_clean := v_clean || jsonb_build_object(v_lang, v_out);
    end if;
  end loop;

  -- The length rules; the CHECK would refuse the update anyway, but with a
  -- message the client cannot map.
  if not public.lab_service_translations_valid(v_clean) then
    raise exception 'invalid_translations' using errcode = '22023';
  end if;

  update public.lab_services
     set translations = v_clean
   where id = p_service_id;

  return v_clean;
end $$;

revoke all on function public.set_lab_service_translations(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.set_lab_service_translations(uuid, jsonb)
  to authenticated;


-- ── Only through the RPC ───────────────────────────────────────────────────
-- `lab_services_owner_all` lets an owner INSERT and UPDATE any column of its
-- services, so without this a direct `.update({ translations })` would skip
-- the RPC's trimming and blank-dropping. A client request runs as `anon` or
-- `authenticated`; inside the SECURITY DEFINER RPC `current_user` is the
-- function's owner, so the RPC passes and a direct write is refused. Not
-- SECURITY DEFINER itself — that would make `current_user` the owner here
-- too. One step past 0037: INSERT is covered as well (a lab creates its own
-- service rows; it creates no `labs` row), so a new service starts at {}.
-- SQL-editor maintenance (postgres) is not blocked; the CHECK still applies.
create or replace function public.tg_lab_services_translations_via_rpc()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated')
     and (
       (tg_op = 'INSERT' and new.translations is distinct from '{}'::jsonb)
       or (tg_op = 'UPDATE' and new.translations is distinct from old.translations)
     ) then
    raise exception 'translations_rpc_only' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists lab_services_translations_via_rpc on public.lab_services;
create trigger lab_services_translations_via_rpc
  before insert or update of translations on public.lab_services
  for each row execute function public.tg_lab_services_translations_via_rpc();


-- ── Guests read it (see the header) ────────────────────────────────────────
-- Already true through the table-level grant; restated so this file alone
-- says what anon may do with the table it changes (as 0034 and 0039 do).
grant select on table public.lab_services to anon;

-- ---------------------------------------------------------------------------
-- Verify:
-- ---------------------------------------------------------------------------
--   -- 1. The column exists, defaults to {} and is not null:
--   select column_name, data_type, column_default, is_nullable
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'lab_services'
--      and column_name = 'translations';
--   -- jsonb | '{}'::jsonb | NO
--
--   -- 2. Every existing service passes the CHECK (it was added without error)
--   --    and reads {}:
--   select count(*) from public.lab_services where translations <> '{}'::jsonb; -- 0
--
--   -- 3. The validator:
--   select public.lab_service_translations_valid('{}');                                -- true
--   select public.lab_service_translations_valid('{"en":{"name":"Zirconia crown"}}');  -- true
--   select public.lab_service_translations_valid('{"de":{"name":"Krone"}}');           -- false
--   select public.lab_service_translations_valid('{"en":{"price":"10"}}');             -- false
--   select public.lab_service_translations_valid('{"en":{"name":""}}');                -- false
--   select public.lab_service_translations_valid('{"en":{"name":" x "}}');             -- false
--   select public.lab_service_translations_valid('{"en":{"name":1}}');                 -- false
--   select public.lab_service_translations_valid('[]');                                -- false
--
--   -- 4. The trigger and the RPC's grant are in place:
--   select tgname from pg_trigger
--    where tgrelid = 'public.lab_services'::regclass
--      and tgname = 'lab_services_translations_via_rpc';                -- 1 row
--   select has_function_privilege('anon',
--            'public.set_lab_service_translations(uuid, jsonb)', 'execute'),  -- f
--          has_function_privilege('authenticated',
--            'public.set_lab_service_translations(uuid, jsonb)', 'execute');  -- t
--
--   -- 5. anon reads the column (the guest catalogue path):
--   select has_column_privilege('anon', 'public.lab_services', 'translations', 'select'); -- t
--   begin; set local role anon;
--   select id, name, translations from public.lab_services limit 1;
--   rollback;
--
--   -- 6. As a lab owner, in a transaction you roll back:
--   --      begin;
--   --      select set_config('request.jwt.claims', '{"sub":"<owner uuid>"}', true);
--   --      set local role authenticated;
--   --      select public.set_lab_service_translations('<their service>',
--   --        '{"en":{"name":"  Zirconia crown ","short_description":""},"ru":{}}');
--   --      -- {"en": {"name": "Zirconia crown"}}  (trimmed; blanks and empty ru dropped)
--   --      select public.set_lab_service_translations('<another lab''s service>', '{}');
--   --      -- raises not_your_lab
--   --      select public.set_lab_service_translations('<their service>',
--   --        '{"en":{"unit_price":"10"}}');                    -- raises invalid_translations
--   --      update public.lab_services set translations = '{"en":{"name":"Direct"}}'
--   --       where id = '<their service>';                    -- raises translations_rpc_only
--   --      rollback;
-- ---------------------------------------------------------------------------
