-- ---------------------------------------------------------------------------
-- 0037 — a lab's public profile in three languages.
--
-- Everything the platform wrote is trilingual; everything a lab wrote is not:
-- a Georgian, an English and a Russian doctor all read whatever the lab typed.
-- This adds optional per-language copies of the two doctor-facing text fields,
-- `public_name` and `short_description`.
--
-- SHAPE
--   labs.public_translations jsonb, default '{}':
--     {"en": {"public_name": "...", "short_description": "..."}, "ru": {...}}
--   The existing columns stay the base and the fallback, whichever language the
--   lab wrote them in, so there is no "primary language" setting and a lab that
--   never translates reads exactly as before. One jsonb column, not six, so the
--   deferred rounds (services, materials) can follow the same pattern without a
--   migration per field. Legal and banking fields are deliberately excluded —
--   a registered name and an IBAN are identity, not copy — and so is `city`,
--   which doubles as the marketplace filter key.
--
-- WHO MAY WRITE IT
--   Owner decision: an APPROVED lab may edit its translations without a new
--   admin review, while its base name, legal and bank details stay locked after
--   approval. The write path is `set_lab_public_translations`, a SECURITY
--   DEFINER RPC that checks the caller owns the lab, validates the shape and
--   touches only this column.
--
--   PRE-EXISTING GAP, NOT WIDENED HERE: `labs_owner_update` (0004) is a
--   column-blind owner UPDATE policy and `tg_labs_protect_admin_columns` (0003)
--   only guards approval_status / approval_note / is_active / approved_*. So an
--   approved owner can already change public_name, legal_name, IBAN, … with a
--   direct `.update()` — "locked after approval" is enforced by the UI only.
--   That policy would make this column directly writable too, so a trigger
--   (labs_public_translations_via_rpc, below) refuses any change to it made by
--   a client role (anon / authenticated); the RPC runs as its definer and
--   passes. The shape rules also live in a CHECK constraint, so even a write
--   from the SQL editor is held to them. If the direct owner UPDATE is ever
--   narrowed to pending labs, the RPC keeps translations working for approved
--   ones.
--
-- NO RLS OR GRANT CHANGE
--   `labs` is table-level `select` to anon (0034) and `labs_marketplace_read`
--   is row-level, so the new column is readable wherever the row is — the
--   marketplace, the lab page and the order wizard, for guests too.
--
-- SIDE EFFECT
--   Orders snapshot the whole lab row (`to_jsonb(v_lab)`), so new orders carry
--   the translations in `lab_snapshot`. Order rows still read the base name;
--   snapshots are never rewritten.
--
-- ⚠️ Apply BEFORE shipping the client that selects this column: the
--    marketplace, lab page, landing catalogue and wizard queries name it, and
--    PostgREST rejects a select of a column that does not exist.
--
-- Fully idempotent — safe to re-run.
-- ---------------------------------------------------------------------------

alter table public.labs
  add column if not exists public_translations jsonb not null default '{}'::jsonb;

comment on column public.labs.public_translations is
  'Doctor-facing display text in other languages:
   {"en": {"public_name": "...", "short_description": "..."}, "ru": {...}, "ka": {...}}
   public_name / short_description remain the base and the fallback. Written
   through set_lab_public_translations (0037). Deliberately NOT the legal or
   banking fields — a legal name and an IBAN are identity, not copy.';


-- ── The shape, in one place ────────────────────────────────────────────────
-- Used by the CHECK below and by the RPC. plpgsql rather than SQL so the type
-- tests run before jsonb_each() — SQL gives no evaluation-order guarantee, and
-- jsonb_each() on a non-object raises instead of returning false.
--
--   * an object whose keys are only ka / en / ru
--   * each value an object whose keys are only public_name / short_description
--   * each of those a non-blank string: public_name 2–200 characters,
--     short_description up to 2000
create or replace function public.lab_public_translations_valid(p jsonb)
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
      if v_field not in ('public_name', 'short_description')
         or jsonb_typeof(v_val) <> 'string' then
        return false;
      end if;
      v_text := v_val #>> '{}';
      -- Blank means absent, and absent is stored as a missing key.
      if v_text !~ '\S' then
        return false;
      end if;
      if v_field = 'public_name'
         and (char_length(regexp_replace(v_text, '^\s+|\s+$', '', 'g')) < 2
              or char_length(v_text) > 200) then
        return false;
      end if;
      if v_field = 'short_description' and char_length(v_text) > 2000 then
        return false;
      end if;
    end loop;
  end loop;

  return true;
end $$;

-- Dropped and re-added so a replay picks up any change to the function above.
alter table public.labs drop constraint if exists labs_public_translations_valid;
alter table public.labs
  add constraint labs_public_translations_valid
  check (public.lab_public_translations_valid(public_translations));


-- ── The write path ─────────────────────────────────────────────────────────
-- Replaces the lab's translations wholesale with `p_translations`, after:
--   * trimming every string and dropping blank fields and empty languages, so
--     an untouched language stores nothing rather than {"public_name": ""} and
--     "has this been translated?" stays answerable;
--   * rejecting unknown languages, unknown fields and non-string values;
--   * the length rules above.
-- Any approval status: translations are copy, not identity (owner decision).
-- Returns what was stored.
create or replace function public.set_lab_public_translations(
  p_lab_id       uuid,
  p_translations jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clean jsonb := '{}'::jsonb;
  v_out   jsonb;
  v_lang  text;
  v_body  jsonb;
  v_field text;
  v_val   jsonb;
  v_text  text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  -- coalesce: a NULL here must refuse, not fall through (0036's lesson).
  if p_lab_id is null or not coalesce(public.current_user_owns_lab(p_lab_id), false) then
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
      if v_field not in ('public_name', 'short_description') then
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
  if not public.lab_public_translations_valid(v_clean) then
    raise exception 'invalid_translations' using errcode = '22023';
  end if;

  update public.labs
     set public_translations = v_clean
   where id = p_lab_id;

  return v_clean;
end $$;

revoke all on function public.set_lab_public_translations(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.set_lab_public_translations(uuid, jsonb)
  to authenticated;


-- ── Only through the RPC ───────────────────────────────────────────────────
-- `labs_owner_update` (0004) lets an owner UPDATE any column of its lab, so
-- without this a direct `.update({ public_translations })` would skip the
-- RPC's trimming and blank-dropping. A client request runs as `anon` or
-- `authenticated`; inside the SECURITY DEFINER RPC `current_user` is the
-- function's owner, so the RPC passes and a direct write is refused. Not
-- SECURITY DEFINER itself — that would make `current_user` the owner here too.
-- SQL-editor maintenance (postgres) is not blocked; the CHECK still applies.
create or replace function public.tg_labs_public_translations_via_rpc()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.public_translations is distinct from old.public_translations
     and current_user in ('anon', 'authenticated') then
    raise exception 'public_translations_rpc_only' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists labs_public_translations_via_rpc on public.labs;
create trigger labs_public_translations_via_rpc
  before update of public_translations on public.labs
  for each row execute function public.tg_labs_public_translations_via_rpc();

-- ---------------------------------------------------------------------------
-- Verify:
-- ---------------------------------------------------------------------------
--   -- 1. The column exists, defaults to {} and is not null:
--   select column_name, data_type, column_default, is_nullable
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'labs'
--      and column_name = 'public_translations';
--   -- jsonb | '{}'::jsonb | NO
--
--   -- 2. Every existing lab passes the CHECK (it was added without error) and
--   --    reads {}:
--   select count(*) from public.labs where public_translations <> '{}'::jsonb; -- 0
--
--   -- 3. The validator:
--   select public.lab_public_translations_valid('{}');                              -- true
--   select public.lab_public_translations_valid('{"en":{"public_name":"Dens Lab"}}'); -- true
--   select public.lab_public_translations_valid('{"de":{"public_name":"Dens"}}');     -- false
--   select public.lab_public_translations_valid('{"en":{"legal_name":"X LLC"}}');     -- false
--   select public.lab_public_translations_valid('{"en":{"public_name":""}}');         -- false
--   select public.lab_public_translations_valid('[]');                                -- false
--
--   -- 4. anon reads it on an approved lab (the marketplace path):
--   set local role anon;
--   select id, public_translations from public.labs
--    where approval_status = 'APPROVED_ACTIVE' and is_active limit 1;
--   reset role;
--
--   -- 5. As a lab owner, in a transaction you roll back:
--   --      select set_config('request.jwt.claims', '{"sub":"<owner uuid>"}', true);
--   --      set local role authenticated;
--   --      select public.set_lab_public_translations('<their lab>',
--   --        '{"en":{"public_name":"  Dens Lab ","short_description":""},"ru":{}}');
--   --      -- {"en": {"public_name": "Dens Lab"}}  (trimmed; blanks and empty ru dropped)
--   --      select public.set_lab_public_translations('<another lab>', '{}');
--   --      -- raises not_your_lab
--   --      select public.set_lab_public_translations('<their lab>',
--   --        '{"en":{"iban":"GE00"}}');                        -- raises invalid_translations
--   --      update public.labs set public_translations = '{"en":{"public_name":"Direct"}}'
--   --       where id = '<their lab>';               -- raises public_translations_rpc_only
-- ---------------------------------------------------------------------------
