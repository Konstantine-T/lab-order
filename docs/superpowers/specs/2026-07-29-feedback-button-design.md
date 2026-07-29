# Feedback button & admin feedback inbox — design

**Date:** 2026-07-29
**Status:** approved, ready for implementation

## Problem

Doctors, labs and clinics have no way to report a broken screen or suggest an
improvement from inside the app. Today that traffic goes through ad-hoc channels
and is lost. The platform admin needs a single place where it lands.

This is a development-stage tool: the goal is to collect reports while the
product is being built, not to run a support desk.

## Scope

**In:** an envelope button in the app header for every non-admin role, a modal
with one message field, storage in Supabase, and an admin section listing every
feedback with the sender's contact details and a delete action.

**Out:** replying in-app, statuses/triage, notifications or emails on new
feedback, attachments, categories, subjects, rate limiting, and any way for a
sender to see their own past feedback. There is no UPDATE path — feedback is
immutable once sent.

## User-facing behaviour

1. Every signed-in user whose role is not `PLATFORM_ADMIN` sees an envelope
   icon in the header toolbar, left of the theme toggle. Hovering shows:
   `გაუმართაობის ან რჩევების შემთხვევაში მოიწერეთ პირდაპირ აქ`.
2. Clicking opens a modal titled *Feedback* with a single multiline textfield
   and Cancel / Submit buttons. Submit is disabled while the trimmed message is
   empty or the request is in flight.
3. On success the modal closes, the field is cleared and a snackbar confirms
   the message was sent. On failure the modal stays open with an inline error
   and the typed text intact.
4. The platform admin sees a **Feedbacks** entry in the admin nav listing every
   message, newest first, with the sender's name, role, organisation, email and
   phone. The admin can delete any item. Nothing else.

## Architecture

### Database

One migration, `supabase/migrations/20260101_0016_feedback.sql`, applied
manually through the Supabase dashboard SQL Editor as `postgres` — the same
path every other DDL in this project takes.

```sql
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

-- Sender: insert only, only as themselves, never as admin.
drop policy if exists feedback_insert_self on public.feedback;
create policy feedback_insert_self on public.feedback
  for insert to authenticated
  with check (user_id = auth.uid() and public.current_user_role() <> 'PLATFORM_ADMIN');

-- Admin: read all, delete any. No UPDATE policy — feedback is immutable.
drop policy if exists feedback_admin_select on public.feedback;
create policy feedback_admin_select on public.feedback
  for select to authenticated using (public.current_user_role() = 'PLATFORM_ADMIN');

drop policy if exists feedback_admin_delete on public.feedback;
create policy feedback_admin_delete on public.feedback
  for delete to authenticated using (public.current_user_role() = 'PLATFORM_ADMIN');
```

The admin list is read through one `SECURITY DEFINER` function, mirroring the
existing `clinic_doctors()` pattern:

```sql
create or replace function public.admin_feedback_list()
returns table (id uuid, message text, page_path text, lang text, created_at timestamptz,
               user_id uuid, first_name text, last_name text, email text, phone text,
               role public.user_role, org_name text)
language sql stable security definer set search_path = public as $$
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
```

Three decisions encoded above:

- **Organisation name comes from scalar subselects, not joins.** `users → labs`
  is 1:N, so a `left join` would emit one row per owned lab and duplicate the
  feedback. Doctors have neither a lab nor a clinic and get `null`, rendered as
  an em-dash.
- **Senders cannot read their own rows back.** There is no SELECT policy for
  them, so the client insert must not chain `.select()` — supabase-js sends
  `Prefer: return=minimal` for a bare `.insert()`, which satisfies RLS. Adding
  `.select()` would make every send fail.
- **The admin check sits in the function's `where` clause**, so a non-admin
  caller receives an empty set rather than an error.

Contact details are joined live rather than snapshotted into the row. A support
contact card should show the person's current phone number, not the one they had
when they wrote in — the opposite of the snapshot rule that governs `orders`,
where historical accuracy is the point.

### Frontend

| File | Responsibility |
|---|---|
| `src/components/FeedbackButton.tsx` (new) | Header icon + tooltip; owns the open/closed state; renders `null` for `PLATFORM_ADMIN` |
| `src/components/FeedbackDialog.tsx` (new) | The modal, its textfield, validation and the insert mutation |
| `src/layouts/AppShell.tsx` (edit) | One line: `<FeedbackButton />` as the first child of the existing toolbar `<Stack>` |
| `src/pages/admin/FeedbacksPage.tsx` (new) | Admin list, delete-confirm dialog |
| `src/layouts/AdminLayout.tsx` (edit) | Nav entry `admin:nav.feedbacks` |
| `src/routes.tsx` (edit) | `/admin/feedbacks` inside the existing `PLATFORM_ADMIN` subtree |
| `src/types/database.ts` (edit) | `FeedbackRow`, `AdminFeedbackListRow` |
| `src/locales/{en,ka,ru}/{common,admin}.json` (edit) | All strings |

**Why the role gate lives in `FeedbackButton`, not in the layouts.** All four
areas share one `AppShell`. Gating in the shell would mean either threading a
prop through `DoctorLayout` / `LabLayout` / `ClinicLayout` / `AdminLayout` or
reading the role in the shell itself. Letting the button read `useAuth()` and
return `null` keeps the rule in one place and leaves `AppShell` a layout
component with no role knowledge.

**Data flow, sending:** `FeedbackDialog` reads `user` from `useAuth()` and
`pathname` from `useLocation()`, then a React Query `useMutation` inserts
`{ user_id, message, page_path, lang }`. No cache invalidation is needed — the
sender has nothing to re-read.

`lang` stores the two-letter code only. The browser language detector can hand
back a region-tagged value such as `en-US`, so the dialog writes
`(i18n.resolvedLanguage ?? i18n.language).slice(0, 2)` to keep the column
comparable to the `en` / `ka` / `ru` set used everywhere else.

**Data flow, admin:** `useQuery(['admin-feedback'], …)` calls
`supabase.rpc('admin_feedback_list')`. Delete is a `useMutation` running
`supabase.from('feedback').delete().eq('id', id)` under the admin RLS policy,
with `invalidateQueries(['admin-feedback'])` on success.

**Presentation:** a card list, not a `DataGrid`. The labs queue uses a grid
because its rows are short structured fields; a feedback body is free text of
arbitrary length and reads badly in a grid cell. Each card carries the sender
line (name, role chip, organisation), contact line (email, phone), timestamp,
the message in `white-space: pre-wrap`, small `page_path` and `lang` chips, and
a delete icon.

## Copy

| Key | en | ka | ru |
|---|---|---|---|
| `common:feedback.tooltip` | Found a problem or have a suggestion? Write to us directly here. | გაუმართაობის ან რჩევების შემთხვევაში მოიწერეთ პირდაპირ აქ | Нашли проблему или есть предложение? Напишите нам напрямую здесь. |
| `common:feedback.title` | Feedback | უკუკავშირი | Обратная связь |
| `common:feedback.placeholder` | Describe the problem or your suggestion… | აღწერეთ ხარვეზი ან თქვენი რჩევა… | Опишите проблему или ваше предложение… |
| `common:feedback.success` | Thanks! Your message has been sent. | მადლობა! თქვენი შეტყობინება გაიგზავნა. | Спасибо! Ваше сообщение отправлено. |

Cancel and Submit reuse `common:actions.cancel` / `common:actions.submit`, which
already exist in all three locales. The admin page adds `admin:nav.feedbacks`
and an `admin:feedbacks.*` block (title, empty state, delete, delete
confirmation, "sent from" label), also in all three.

## Error handling

- **Send fails** (network, RLS, constraint): the dialog stays open, shows an
  inline `Alert` with `common:errors.generic`, and keeps the typed message. The
  user can retry without re-typing.
- **Empty or whitespace-only message:** Submit stays disabled; the DB
  `char_length(btrim(message)) between 1 and 2000` check is the backstop.
- **Admin list fails to load:** the page shows `common:errors.loadFailed`.
- **Delete fails:** a snackbar with `common:errors.generic`; the list is left
  untouched.
- **Admin somehow opens the dialog:** the insert policy rejects it. The button
  is not rendered for admins, so this is defence in depth, not a flow.

## Verification

The project has no test framework, so verification is the existing command pair
plus a manual smoke test.

- `npm run typecheck` — must be clean.
- `npm run i18n:check` — already red in the `doctor` / `lab` namespaces
  (pre-existing, documented in `SESSION-HANDOFF.md`). This work must add no new
  gaps in `common` or `admin`.
- Manual, against the live dev Supabase project:
  1. As a doctor: the envelope is visible, the tooltip reads correctly in ka,
     sending succeeds, the snackbar appears.
  2. As a lab admin and a clinic admin: same button appears.
  3. As the platform admin: **no** envelope in the header.
  4. As the platform admin: `/admin/feedbacks` lists the messages just sent,
     each with the right name, role, organisation, email, phone, page path and
     language.
  5. Delete an item; it disappears and stays gone after a reload.
