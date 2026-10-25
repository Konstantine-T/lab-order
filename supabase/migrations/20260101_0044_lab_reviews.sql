-- ---------------------------------------------------------------------------
-- 0044 — doctors review labs after an order is completed.
--
-- Trello 6lxcY6wP (attachment reviews.txt). The owner's rules:
--
--   * The order's DOCTOR (never the clinic admin) reviews a COMPLETED order,
--     within 30 days of completed_at: 1 to 5 stars, a comment that is optional
--     at 3 to 5 stars and required at 1 or 2. One review per order.
--   * The doctor edits and deletes any time; only WRITING a new review is
--     limited to the window. A reopened order keeps its review (J1).
--   * Everyone reads the reviews, guests included, but only through
--     lab_reviews_public(), which returns stars, comment, "Irakli K.", the
--     service, dates and the lab's reply. Never doctor_id, order_id, the order
--     code, hidden_* or reports: a table-level anon grant would tell the world
--     which doctor ordered from which lab and when.
--   * The lab writes one public reply per review and may report a review; a
--     platform admin hides, unhides or keeps it. Hidden reviews leave the
--     public list and the averages but stay visible, marked, to their doctor
--     and the lab (J5).
--   * lab_rating_summary carries the public average and count per lab,
--     recomputed by a trigger over VISIBLE reviews. A separate table, not
--     columns on labs: labs_owner_update is column-blind (a lab could write its
--     own rating) and every new labs column would also need 0039's guest
--     column list. PostgREST embeds it from labs by the foreign key.
--   * Two notifications (0043's notify()): lab_review_new → the lab owner,
--     lab_review_reply → the review's doctor. Nothing on edits, deletes, reply
--     edits, reports or moderation (owner).
--
-- reviewer_display and the service name are STORED, not joined, so a guest
-- never needs access to users, doctor_profiles or orders (J2). The display is
-- computed by public._lab_reviewer_display(doctor_id) and refreshed on each
-- doctor edit. It is a separate function on purpose: the next ticket
-- (hc61AYfA, a lab orders from another lab through a hidden "buying"
-- doctor_profiles row) redefines it to return the buying lab's public name,
-- so nothing here assumes every doctor_profiles row is a person.
--
-- "Edited" (lab_reviews_public.edited) = updated_at > created_at + 1 minute.
-- Only save_lab_review on an existing review moves updated_at; a lab reply,
-- a report and an admin hide never do.
--
-- SECURITY (the 0039 lesson): Supabase's default privileges grant ALL on every
-- new table and EXECUTE on every new function to anon and authenticated, so
-- each one is revoked explicitly below and granted back only as needed.
--   lab_reviews, lab_review_reports: SELECT to authenticated under RLS (the
--     doctor, the lab, the admin), nothing to anon, no client writes at all.
--   lab_rating_summary: SELECT to anon and authenticated (public numbers),
--     no client writes.
--   Writes only through the SECURITY DEFINER RPCs below, each granted to
--     authenticated and refusing anyone but the right party.
--
-- NEVER BREAK THE WRITE: the summary refresh and each notification sit in
-- their own begin … exception when others then raise warning … end block, as
-- in 0043. The summary is recomputed, never incremented, so the next write to
-- a lab's reviews repairs any refresh that failed.
--
-- Needs 0022 (orders.completed_at), 0042 (service_snapshot translations, read
-- defensively; orders placed before 0042 simply have none) and 0043
-- (notifications, notify()). Fully idempotent — safe to re-run.
-- ---------------------------------------------------------------------------


-- ── 1. Tables ────────────────────────────────────────────────────────────

create table if not exists public.lab_reviews (
  id                   uuid primary key default gen_random_uuid(),
  -- One review per order.
  order_id             uuid not null unique references public.orders(id) on delete cascade,
  lab_id               uuid not null references public.labs(id) on delete cascade,
  -- J8: a deleted doctor account takes its reviews with it.
  doctor_id            uuid not null references public.doctor_profiles(id) on delete cascade,
  rating               smallint not null check (rating between 1 and 5),
  comment              text check (comment is null or char_length(comment) <= 2000),
  -- Captured server-side; never written by a client.
  reviewer_display     text not null,                      -- "Irakli K."
  service_name         text,                               -- service_snapshot ->> 'name'
  service_translations jsonb not null default '{}'::jsonb, -- service_snapshot -> 'translations' (0042)
  lab_reply            text check (lab_reply is null or char_length(lab_reply) <= 2000),
  lab_replied_at       timestamptz,
  hidden_at            timestamptz,                        -- set by a platform admin
  hidden_by_user_id    uuid references public.users(id) on delete set null,
  hidden_note          text check (hidden_note is null or char_length(hidden_note) <= 1000),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint lab_reviews_low_rating_needs_comment
    check (rating > 2 or char_length(btrim(coalesce(comment, ''))) > 0)
);

create index if not exists lab_reviews_lab_recent_idx on public.lab_reviews (lab_id, created_at desc);
create index if not exists lab_reviews_doctor_idx on public.lab_reviews (doctor_id);

comment on table public.lab_reviews is
  'A doctor''s review of the lab for one completed order (0044). Written only '
  'through save_lab_review / delete_lab_review / reply_to_lab_review / '
  'moderate_lab_review; the public reads it through lab_reviews_public().';

create table if not exists public.lab_review_reports (
  id                  uuid primary key default gen_random_uuid(),
  review_id           uuid not null references public.lab_reviews(id) on delete cascade,
  reported_by_user_id uuid not null references public.users(id) on delete cascade,
  reason              text not null check (char_length(btrim(reason)) between 1 and 1000),
  created_at          timestamptz not null default now(),
  resolved_at         timestamptz,
  resolution          text check (resolution in ('HIDDEN', 'KEPT')),
  resolved_by_user_id uuid references public.users(id) on delete set null
);

-- At most one open report per review.
create unique index if not exists lab_review_reports_one_open
  on public.lab_review_reports (review_id) where resolved_at is null;
create index if not exists lab_review_reports_review_idx
  on public.lab_review_reports (review_id, created_at desc);

create table if not exists public.lab_rating_summary (
  lab_id       uuid primary key references public.labs(id) on delete cascade,
  review_count integer not null default 0,
  rating_avg   numeric(3,2)
);

comment on table public.lab_rating_summary is
  'Average and count of each lab''s VISIBLE reviews (0044). Written only by the '
  'lab_reviews trigger; public read. The 3-review display threshold is the '
  'client''s (J3).';


-- ── 2. Who can read what ────────────────────────────────────────────────

alter table public.lab_reviews        enable row level security;
alter table public.lab_review_reports enable row level security;
alter table public.lab_rating_summary enable row level security;

-- lab_reviews: the doctor who wrote it, the lab it is about (hidden ones
-- included, J5), the platform admin. No anon policy, ever.
drop policy if exists lab_reviews_doctor_read on public.lab_reviews;
create policy lab_reviews_doctor_read on public.lab_reviews
  for select to authenticated
  using (doctor_id = public.current_doctor_id());

drop policy if exists lab_reviews_lab_read on public.lab_reviews;
create policy lab_reviews_lab_read on public.lab_reviews
  for select to authenticated
  using (public.current_user_owns_lab(lab_id));

drop policy if exists lab_reviews_admin_read on public.lab_reviews;
create policy lab_reviews_admin_read on public.lab_reviews
  for select to authenticated
  using (public.current_user_role() = 'PLATFORM_ADMIN');

-- lab_review_reports: the lab the reported review is about, and the admin.
-- The subquery runs under lab_reviews' own RLS, which lets the lab owner see
-- exactly its own lab's reviews.
drop policy if exists lab_review_reports_lab_read on public.lab_review_reports;
create policy lab_review_reports_lab_read on public.lab_review_reports
  for select to authenticated
  using (exists (
    select 1 from public.lab_reviews r
     where r.id = lab_review_reports.review_id
       and public.current_user_owns_lab(r.lab_id)
  ));

drop policy if exists lab_review_reports_admin_read on public.lab_review_reports;
create policy lab_review_reports_admin_read on public.lab_review_reports
  for select to authenticated
  using (public.current_user_role() = 'PLATFORM_ADMIN');

-- lab_rating_summary: as public as the reviews themselves.
drop policy if exists lab_rating_summary_read on public.lab_rating_summary;
create policy lab_rating_summary_read on public.lab_rating_summary
  for select to anon, authenticated
  using (true);

revoke all on public.lab_reviews        from public, anon, authenticated;
revoke all on public.lab_review_reports from public, anon, authenticated;
revoke all on public.lab_rating_summary from public, anon, authenticated;
grant select on public.lab_reviews        to authenticated;
grant select on public.lab_review_reports to authenticated;
grant select on public.lab_rating_summary to anon, authenticated;


-- ── 3. Helpers ───────────────────────────────────────────────────────────

-- "Irakli K." / "ირაკლი ქ.": the first name and the first letter of the last
-- name, as typed. No upper(): Georgian has no case, and some collations map
-- Mkhedruli to Mtavruli capitals. '' when the account has no name at all; the
-- client then shows a translated "Doctor".
-- hc61AYfA redefines this to return the buying lab's public name for a
-- buying profile.
create or replace function public._lab_reviewer_display(p_doctor_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select btrim(concat_ws(' ',
             nullif(btrim(u.first_name), ''),
             case when nullif(btrim(u.last_name), '') is not null
                  then left(btrim(u.last_name), 1) || '.' end))
      from public.doctor_profiles dp
      join public.users u on u.id = dp.user_id
     where dp.id = p_doctor_id
  ), '');
$$;

-- Recompute one lab's public numbers over its visible reviews.
create or replace function public._refresh_lab_rating_summary(p_lab_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_lab_id is null then
    return;
  end if;
  insert into public.lab_rating_summary as s (lab_id, review_count, rating_avg)
  select p_lab_id,
         count(*)::integer,
         round(avg(r.rating)::numeric, 2)
    from public.lab_reviews r
   where r.lab_id = p_lab_id
     and r.hidden_at is null
  on conflict (lab_id) do update
     set review_count = excluded.review_count,
         rating_avg   = excluded.rating_avg;
end $$;


-- ── 4. Triggers ──────────────────────────────────────────────────────────

-- The summary, for the affected lab (old and new on an update).
create or replace function public.tg_lab_reviews_refresh_summary()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    if tg_op in ('UPDATE', 'DELETE') then
      perform public._refresh_lab_rating_summary(old.lab_id);
    end if;
    if tg_op in ('INSERT', 'UPDATE')
       and (tg_op = 'INSERT' or new.lab_id is distinct from old.lab_id) then
      perform public._refresh_lab_rating_summary(new.lab_id);
    end if;
  exception when others then
    raise warning 'tg_lab_reviews_refresh_summary (review %): %',
      coalesce(new.id, old.id), sqlerrm;
  end;
  return null;
end $$;

drop trigger if exists lab_reviews_refresh_summary on public.lab_reviews;
create trigger lab_reviews_refresh_summary
  after insert or update or delete on public.lab_reviews
  for each row execute function public.tg_lab_reviews_refresh_summary();

-- lab_review_new → the lab owner.
create or replace function public.tg_notify_lab_review_new()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_code  text;
begin
  begin
    select l.owner_user_id into v_owner from public.labs l where l.id = new.lab_id;
    select o.order_code into v_code from public.orders o where o.id = new.order_id;
    perform public.notify(v_owner, 'lab_review_new', new.order_id,
                          jsonb_build_object('code', v_code, 'rating', new.rating));
  exception when others then
    raise warning 'notify lab_review_new (review %): %', new.id, sqlerrm;
  end;
  return null;
end $$;

drop trigger if exists lab_reviews_notify_new on public.lab_reviews;
create trigger lab_reviews_notify_new
  after insert on public.lab_reviews
  for each row execute function public.tg_notify_lab_review_new();

-- lab_review_reply → the review's doctor, when the reply first appears (an
-- edit of an existing reply sends nothing).
create or replace function public.tg_notify_lab_review_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doctor_user uuid;
  v_order       public.orders%rowtype;
  v_lab         text;
begin
  begin
    select dp.user_id into v_doctor_user from public.doctor_profiles dp where dp.id = new.doctor_id;
    select * into v_order from public.orders where id = new.order_id;
    v_lab := coalesce(nullif(btrim(v_order.lab_snapshot ->> 'public_name'), ''),
                      (select l.public_name from public.labs l where l.id = new.lab_id));
    perform public.notify(v_doctor_user, 'lab_review_reply', new.order_id,
                          jsonb_build_object('code', v_order.order_code, 'lab', v_lab));
  exception when others then
    raise warning 'notify lab_review_reply (review %): %', new.id, sqlerrm;
  end;
  return null;
end $$;

drop trigger if exists lab_reviews_notify_reply on public.lab_reviews;
create trigger lab_reviews_notify_reply
  after update of lab_reply on public.lab_reviews
  for each row
  when (old.lab_reply is null and new.lab_reply is not null)
  execute function public.tg_notify_lab_review_reply();


-- ── 5. Writes (SECURITY DEFINER RPCs) ───────────────────────────────────

-- Create or update the caller's review of one order. Returns the review id.
create or replace function public.save_lab_review(
  p_order_id uuid,
  p_rating   int,
  p_comment  text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doctor  uuid := public.current_doctor_id();
  v_order   public.orders%rowtype;
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
  v_id      uuid;
begin
  -- Serialises two saves of the same order (a double click), so the second
  -- one updates instead of hitting the unique index.
  select * into v_order from public.orders where id = p_order_id for update;
  -- The order's doctor only: not can_act_for_doctor, which would also admit
  -- the clinic admin (owner: doctor only). An unknown order says the same, so
  -- nothing about other orders leaks.
  if v_order.id is null or v_doctor is null or v_order.doctor_id is distinct from v_doctor then
    raise exception 'not_your_order' using errcode = '42501';
  end if;

  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'invalid_rating' using errcode = '22023';
  end if;
  if v_comment is not null and char_length(v_comment) > 2000 then
    raise exception 'comment_too_long' using errcode = '22023';
  end if;
  if p_rating <= 2 and v_comment is null then
    raise exception 'comment_required' using errcode = '22023';
  end if;

  select id into v_id from public.lab_reviews where order_id = p_order_id for update;

  if v_id is not null then
    -- Edit: any time, any status (a reopened order keeps its review). Never
    -- touches the reply or the moderation columns.
    update public.lab_reviews
       set rating           = p_rating,
           comment          = v_comment,
           reviewer_display = public._lab_reviewer_display(v_doctor),
           updated_at       = now()
     where id = v_id;
    return v_id;
  end if;

  -- Create: completed, and within 30 days of completion (J1: a reopened and
  -- re-completed order gets a fresh window).
  if v_order.status <> 'COMPLETED' or v_order.completed_at is null then
    raise exception 'order_not_completed' using errcode = '22023';
  end if;
  if now() > v_order.completed_at + interval '30 days' then
    raise exception 'review_window_closed' using errcode = '22023';
  end if;

  insert into public.lab_reviews (
    order_id, lab_id, doctor_id, rating, comment, reviewer_display,
    service_name, service_translations
  ) values (
    v_order.id,
    v_order.lab_id,
    v_doctor,
    p_rating,
    v_comment,
    public._lab_reviewer_display(v_doctor),
    nullif(btrim(v_order.service_snapshot ->> 'name'), ''),
    case when jsonb_typeof(v_order.service_snapshot -> 'translations') = 'object'
         then v_order.service_snapshot -> 'translations'
         else '{}'::jsonb end
  )
  returning id into v_id;
  return v_id;
end $$;

-- The review's doctor deletes it. The reply and any reports go with it.
create or replace function public.delete_lab_review(p_review_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doctor uuid := public.current_doctor_id();
  v_owner  uuid;
begin
  select doctor_id into v_owner from public.lab_reviews where id = p_review_id;
  if v_owner is null or v_doctor is null or v_owner <> v_doctor then
    raise exception 'not_your_review' using errcode = '42501';
  end if;
  delete from public.lab_reviews where id = p_review_id;
end $$;

-- The lab owner writes, edits or (with an empty reply) removes its one reply.
create or replace function public.reply_to_lab_review(p_review_id uuid, p_reply text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lab   uuid;
  v_old   text;
  v_reply text := nullif(btrim(coalesce(p_reply, '')), '');
begin
  select lab_id, lab_reply into v_lab, v_old from public.lab_reviews where id = p_review_id;
  if v_lab is null or not public.current_user_owns_lab(v_lab) then
    raise exception 'not_your_lab' using errcode = '42501';
  end if;
  if v_reply is not null and char_length(v_reply) > 2000 then
    raise exception 'reply_too_long' using errcode = '22023';
  end if;
  if v_reply is not distinct from v_old then
    return;  -- nothing changed: keep lab_replied_at
  end if;
  -- updated_at is deliberately left alone: a reply does not make the review
  -- "edited".
  update public.lab_reviews
     set lab_reply      = v_reply,
         lab_replied_at = case when v_reply is null then null else now() end
   where id = p_review_id;
end $$;

-- The lab owner reports a review to the platform. One open report at a time.
create or replace function public.report_lab_review(p_review_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lab    uuid;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_id     uuid;
begin
  select lab_id into v_lab from public.lab_reviews where id = p_review_id for update;
  if v_lab is null or not public.current_user_owns_lab(v_lab) then
    raise exception 'not_your_lab' using errcode = '42501';
  end if;
  if v_reason is null then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  if char_length(v_reason) > 1000 then
    raise exception 'reason_too_long' using errcode = '22023';
  end if;
  if exists (select 1 from public.lab_review_reports
              where review_id = p_review_id and resolved_at is null) then
    raise exception 'already_reported' using errcode = '23505';
  end if;
  insert into public.lab_review_reports (review_id, reported_by_user_id, reason)
  values (p_review_id, auth.uid(), v_reason)
  returning id into v_id;
  return v_id;
exception
  when unique_violation then
    -- Two reports racing past the check above: the partial index decides.
    raise exception 'already_reported' using errcode = '23505';
end $$;

-- The platform admin hides, unhides or keeps a review. None of these move
-- updated_at.
create or replace function public.moderate_lab_review(
  p_review_id uuid,
  p_action    text,
  p_note      text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if public.current_user_role() is distinct from 'PLATFORM_ADMIN' then
    raise exception 'not_platform_admin' using errcode = '42501';
  end if;
  if not exists (select 1 from public.lab_reviews where id = p_review_id) then
    raise exception 'review_not_found' using errcode = 'P0002';
  end if;
  if v_note is not null and char_length(v_note) > 1000 then
    raise exception 'note_too_long' using errcode = '22023';
  end if;

  if p_action = 'HIDE' then
    update public.lab_reviews
       set hidden_at         = now(),
           hidden_by_user_id = auth.uid(),
           hidden_note       = v_note
     where id = p_review_id;
    update public.lab_review_reports
       set resolved_at = now(), resolution = 'HIDDEN', resolved_by_user_id = auth.uid()
     where review_id = p_review_id and resolved_at is null;
  elsif p_action = 'UNHIDE' then
    update public.lab_reviews
       set hidden_at = null, hidden_by_user_id = null, hidden_note = null
     where id = p_review_id;
  elsif p_action = 'KEEP' then
    update public.lab_review_reports
       set resolved_at = now(), resolution = 'KEPT', resolved_by_user_id = auth.uid()
     where review_id = p_review_id and resolved_at is null;
  else
    raise exception 'invalid_action' using errcode = '22023';
  end if;
end $$;


-- ── 6. Public read ───────────────────────────────────────────────────────

-- A lab's visible reviews, newest first, for anyone (guests included). The
-- column list IS the privacy rule: nothing that names the doctor beyond
-- reviewer_display, nothing that identifies the order, no moderation data.
-- Drop first: a changed OUT column list cannot be replaced in place.
drop function if exists public.lab_reviews_public(uuid, int, int);
create function public.lab_reviews_public(
  p_lab_id uuid,
  p_limit  int default 10,
  p_offset int default 0
)
returns table (
  id                   uuid,
  rating               smallint,
  comment              text,
  reviewer_display     text,
  service_name         text,
  service_translations jsonb,
  lab_reply            text,
  lab_replied_at       timestamptz,
  created_at           timestamptz,
  edited               boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.rating, r.comment, r.reviewer_display, r.service_name,
         r.service_translations, r.lab_reply, r.lab_replied_at, r.created_at,
         r.updated_at > r.created_at + interval '1 minute'
    from public.lab_reviews r
    join public.labs l on l.id = r.lab_id
   where r.lab_id = p_lab_id
     and r.hidden_at is null
     -- The same gate as labs_marketplace_read.
     and l.approval_status = 'APPROVED_ACTIVE'
     and l.is_active
   order by r.created_at desc, r.id
   limit least(greatest(coalesce(p_limit, 10), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
$$;


-- ── 7. Backfill the summary (a no-op on first apply) ────────────────────

do $$
declare
  v_lab uuid;
begin
  for v_lab in select distinct lab_id from public.lab_reviews loop
    perform public._refresh_lab_rating_summary(v_lab);
  end loop;
end $$;


-- ── 8. Notification kinds (0043's CHECK, plus the two new ones) ─────────

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  -- doctor
  'lab_question', 'lab_needs_change', 'order_ready', 'order_sent',
  'order_cancelled_by_lab', 'price_set', 'due_confirmed',
  'invoice_attached', 'invoice_replaced', 'clinic_invite',
  'lab_review_reply',
  -- lab
  'new_order', 'order_edited', 'doctor_answered', 'invoice_seen',
  'order_completed', 'order_reopened', 'order_cancelled_by_doctor',
  'lab_approved', 'lab_suspended', 'lab_changes_requested', 'lab_rejected',
  'lab_review_new',
  -- clinic admin
  'clinic_order_placed', 'clinic_order_completed', 'doctor_left',
  'payment_recorded', 'new_payable',
  -- platform admin
  'admin_new_lab', 'admin_new_feedback'
));


-- ── 9. Privileges on functions ──────────────────────────────────────────

revoke all on function public._lab_reviewer_display(uuid)          from public, anon, authenticated;
revoke all on function public._refresh_lab_rating_summary(uuid)    from public, anon, authenticated;
revoke all on function public.tg_lab_reviews_refresh_summary()     from public, anon, authenticated;
revoke all on function public.tg_notify_lab_review_new()           from public, anon, authenticated;
revoke all on function public.tg_notify_lab_review_reply()         from public, anon, authenticated;

revoke all on function public.save_lab_review(uuid, int, text)          from public, anon, authenticated;
revoke all on function public.delete_lab_review(uuid)                   from public, anon, authenticated;
revoke all on function public.reply_to_lab_review(uuid, text)           from public, anon, authenticated;
revoke all on function public.report_lab_review(uuid, text)             from public, anon, authenticated;
revoke all on function public.moderate_lab_review(uuid, text, text)     from public, anon, authenticated;
grant execute on function public.save_lab_review(uuid, int, text)       to authenticated;
grant execute on function public.delete_lab_review(uuid)                to authenticated;
grant execute on function public.reply_to_lab_review(uuid, text)        to authenticated;
grant execute on function public.report_lab_review(uuid, text)          to authenticated;
grant execute on function public.moderate_lab_review(uuid, text, text)  to authenticated;

revoke all on function public.lab_reviews_public(uuid, int, int)        from public, anon, authenticated;
grant execute on function public.lab_reviews_public(uuid, int, int)     to anon, authenticated;


-- ── 10. Realtime publication ────────────────────────────────────────────
--
-- Realtime applies the RLS above per subscriber: a doctor hears their own
-- reviews, the lab its lab's reviews and reports, the admin everything.
-- lab_rating_summary is not published: guests never open a socket (J7) and
-- the people involved refetch it from their lab_reviews events.

do $$
declare
  v_table text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'publication supabase_realtime does not exist; enable Realtime for the project, then re-run this block';
    return;
  end if;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime' and puballtables) then
    return;  -- already publishes every table
  end if;
  foreach v_table in array array['lab_reviews', 'lab_review_reports'] loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end $$;


-- ---------------------------------------------------------------------------
-- Verify (every one should be true):
-- ---------------------------------------------------------------------------
--   select bool_and(relrowsecurity) from pg_class
--     where oid in ('public.lab_reviews'::regclass, 'public.lab_review_reports'::regclass,
--                   'public.lab_rating_summary'::regclass);
--   -- guests get nothing from the review tables, and the summary read-only:
--   select not has_table_privilege('anon', 'public.lab_reviews', 'SELECT')
--      and not has_table_privilege('anon', 'public.lab_review_reports', 'SELECT')
--      and has_table_privilege('anon', 'public.lab_rating_summary', 'SELECT')
--      and not has_table_privilege('anon', 'public.lab_rating_summary', 'INSERT');
--   -- signed-in users read under RLS and write nothing directly:
--   select has_table_privilege('authenticated', 'public.lab_reviews', 'SELECT')
--      and not has_table_privilege('authenticated', 'public.lab_reviews', 'INSERT')
--      and not has_table_privilege('authenticated', 'public.lab_reviews', 'UPDATE')
--      and not has_table_privilege('authenticated', 'public.lab_reviews', 'DELETE')
--      and not has_table_privilege('authenticated', 'public.lab_review_reports', 'INSERT')
--      and not has_table_privilege('authenticated', 'public.lab_rating_summary', 'UPDATE');
--   -- the RPCs: writes for authenticated only, the public read for everyone:
--   select has_function_privilege('authenticated', 'public.save_lab_review(uuid,int,text)', 'EXECUTE')
--      and not has_function_privilege('anon', 'public.save_lab_review(uuid,int,text)', 'EXECUTE')
--      and not has_function_privilege('anon', 'public.moderate_lab_review(uuid,text,text)', 'EXECUTE')
--      and has_function_privilege('anon', 'public.lab_reviews_public(uuid,int,int)', 'EXECUTE')
--      and not has_function_privilege('authenticated', 'public._lab_reviewer_display(uuid)', 'EXECUTE');
--   -- the public read returns exactly these ten columns:
--   select array_agg(a order by n) = array['id','rating','comment','reviewer_display','service_name',
--            'service_translations','lab_reply','lab_replied_at','created_at','edited']
--     from pg_proc p, unnest(p.proargnames, p.proargmodes) with ordinality as x(a, m, n)
--    where p.oid = 'public.lab_reviews_public(uuid,int,int)'::regprocedure and m = 't';
--   select count(*) = 3 from pg_trigger
--     where not tgisinternal and tgname in (
--       'lab_reviews_refresh_summary', 'lab_reviews_notify_new', 'lab_reviews_notify_reply');
--   -- the kind list is 0043's 28 plus the two review kinds:
--   select pg_get_constraintdef(oid) like '%''lab_review_new''%'
--      and pg_get_constraintdef(oid) like '%''lab_review_reply''%'
--      and pg_get_constraintdef(oid) like '%''lab_rejected''%'
--     from pg_constraint
--    where conname = 'notifications_kind_check' and conrelid = 'public.notifications'::regclass;
--   select count(*) = 2 from pg_publication_tables
--     where pubname = 'supabase_realtime' and schemaname = 'public'
--       and tablename in ('lab_reviews', 'lab_review_reports');
--   -- the summary matches the visible reviews:
--   select not exists (
--     select 1 from public.lab_rating_summary s
--      where s.review_count <> (select count(*) from public.lab_reviews r
--                                where r.lab_id = s.lab_id and r.hidden_at is null));
--
--   -- A notification or summary bug never rolls back the write (in a transaction):
--   --   begin;
--   --   alter table public.notifications rename to notifications_x;
--   --   alter table public.lab_rating_summary rename to lab_rating_summary_x;
--   --   insert into public.lab_reviews (order_id, lab_id, doctor_id, rating, reviewer_display)
--   --     values ('<an order>', '<its lab>', '<its doctor>', 5, 'Test T.');  -- succeeds, WARNINGs
--   --   rollback;
-- ---------------------------------------------------------------------------
