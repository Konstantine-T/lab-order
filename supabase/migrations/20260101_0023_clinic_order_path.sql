-- ---------------------------------------------------------------------------
-- 0023 — Let a clinic admin walk the doctor's own ordering path.
--
-- The clinic had a separate, thinner order-create screen. It is being replaced
-- by the doctor's wizard driven with an "acting doctor", which needs two things
-- the server does not currently allow.
--
--   1. Drafts. order_drafts is primary-keyed on doctor_id alone — one slot per
--      doctor — and readable only by that doctor. Simply widening the policy
--      would let a clinic admin's autosave silently overwrite a draft the
--      doctor is in the middle of. The draft is keyed by *author* as well, so
--      the doctor and each of their clinic admins get their own.
--
--   2. Patient matching. find_matching_patient compares against
--      current_doctor_id(), which is NULL for a clinic admin, so the duplicate
--      warning never fires on the clinic path — it silently creates the exact
--      duplicates 0020 set out to stop. It now takes the doctor explicitly and
--      authorizes with can_act_for_doctor.
-- ---------------------------------------------------------------------------

-- ── 1. Drafts are per (doctor, author) ─────────────────────────────────────
alter table public.order_drafts
  add column if not exists author_user_id uuid references public.users(id);

-- Every existing draft was written by the doctor themselves.
update public.order_drafts d
   set author_user_id = dp.user_id
  from public.doctor_profiles dp
 where dp.id = d.doctor_id
   and d.author_user_id is null;

-- A draft whose doctor has no user row cannot be attributed; it is
-- unreachable anyway, so drop it rather than block the NOT NULL.
delete from public.order_drafts where author_user_id is null;

alter table public.order_drafts alter column author_user_id set not null;

-- Swap the primary key. The constraint name is looked up rather than assumed.
do $$
declare
  v_pk text;
begin
  select conname into v_pk
    from pg_constraint
   where conrelid = 'public.order_drafts'::regclass
     and contype = 'p';

  if v_pk is not null then
    execute format('alter table public.order_drafts drop constraint %I', v_pk);
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.order_drafts'::regclass and contype = 'p'
  ) then
    alter table public.order_drafts
      add constraint order_drafts_pkey primary key (doctor_id, author_user_id);
  end if;
end $$;

-- The author owns their draft, and must still be allowed to act for the
-- doctor it is for — so revoking a clinic link also revokes the draft.
drop policy if exists order_drafts_doctor_all on public.order_drafts;
create policy order_drafts_author_all on public.order_drafts
  for all to authenticated
  using (
    author_user_id = auth.uid()
    and public.can_act_for_doctor(doctor_id)
  )
  with check (
    author_user_id = auth.uid()
    and public.can_act_for_doctor(doctor_id)
  );

-- ── 2. Patient matching for whoever is acting ──────────────────────────────
-- Signature changes (4 args -> 5), so drop the old one instead of leaving an
-- ambiguous overload for PostgREST to pick between.
drop function if exists public.find_matching_patient(text, text, date, text);
-- A 3-arg overload predating this migrations folder also exists on the dev
-- database (nothing in the repo declares it). Two overloads let PostgREST pick
-- by which keys the client happens to send, so drop it too.
drop function if exists public.find_matching_patient(text, text, date);

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
  select p.id, p.first_name, p.last_name, p.date_of_birth, p.gender, p.created_at
  from public.patients p
  where p.doctor_id = coalesce(p_doctor_id, public.current_doctor_id())
    and public.can_act_for_doctor(coalesce(p_doctor_id, public.current_doctor_id()))
    and public.patient_name_key(p.first_name) = public.patient_name_key(p_first)
    and public.patient_name_key(p.last_name)  = public.patient_name_key(p_last)
  order by p.created_at asc
  limit 1;
$$;

grant execute on function public.find_matching_patient(text, text, date, text, uuid)
  to authenticated;
