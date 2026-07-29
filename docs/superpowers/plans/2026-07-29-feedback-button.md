# Feedback Button & Admin Feedback Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every non-admin user an envelope button in the app header that opens a one-field feedback modal, and give the platform admin a section listing every message with the sender's contact details and a delete action.

**Architecture:** A new `public.feedback` table holds the messages. Senders INSERT their own row directly under RLS (`user_id = auth.uid()` and not an admin); the platform admin reads through one `SECURITY DEFINER` function `admin_feedback_list()` that joins the sender's `users` row plus their lab or clinic name, and deletes rows directly under an admin RLS policy. On the frontend, a self-gating `FeedbackButton` is added once to the shared `AppShell` toolbar and returns `null` for `PLATFORM_ADMIN`, so no layout needs to know about roles.

**Tech Stack:** React 18 + TypeScript (strict), MUI v5, TanStack React Query, react-i18next (en/ka/ru), Supabase (Postgres + RLS + RPC), Vite.

**Spec:** `docs/superpowers/specs/2026-07-29-feedback-button-design.md`

## Testing deviation — read this first

**This repository has no test framework and no CI** (`docs/ARCHITECTURE.md` §2: "No test framework, no CI"). There is no `vitest`, no `jest`, no `playwright` in `package.json`. Adding one is out of scope for this feature and was not part of the approved design.

So the red/green TDD cycle in this plan is expressed with the verification tools the project actually has:

| Normal TDD step | What it is here |
|---|---|
| Write failing test | Write the exact verification command or SQL query, and record the failing output you expect *before* the change |
| Run, see it fail | Run it, confirm the failure matches |
| Implement | Write the code |
| Run, see it pass | Re-run the same command/query, confirm the expected passing output |

The three verification tools:

- `npm run typecheck` — must be clean.
- `npm run i18n:check` — **already red** in the `doctor` and `lab` namespaces before this work starts (pre-existing, documented in `SESSION-HANDOFF.md`). Capture its output once at the beginning and compare; this work must add **no new** `common` or `admin` findings.
- Supabase dashboard **SQL Editor** and the running app at `http://localhost:5174` for behavioural checks, with exact queries and expected row counts given in each task.

## Global Constraints

- **Every user-facing string is an i18n key** and must exist in all three locales: `src/locales/{en,ka,ru}/`. Never hardcode display text.
- **Georgian tooltip copy is fixed and must be used verbatim:** `გაუმართაობის ან რჩევების შემთხვევაში მოიწერეთ პირდაპირ აქ`
- **Never call `.select()` after the feedback insert.** Senders have no SELECT policy on `feedback`; a `RETURNING` clause makes the insert fail RLS. A bare `.insert()` sends `Prefer: return=minimal`, which is required here.
- **No UPDATE path anywhere.** Feedback is immutable: create, read (admin), delete (admin).
- **DDL is applied by hand** through the Supabase dashboard SQL Editor as the `postgres` role. The anon key cannot run DDL. The migration file in the repo is the record, not the mechanism.
- **Colours and spacing come from the theme** (`sx` + tokens), never ad-hoc hex — `docs/ARCHITECTURE.md` §7.
- **Path alias:** import app code as `@/…`, never relative paths across directories.
- **Build is stricter than lint:** `tsc -b` treats unused locals/params as hard errors. Do not leave an unused import behind.
- Supabase project: **lab-order-dev**, ref `zukelhnhdaoiufzkkjmm`. Dev server runs on **port 5174**.

---

### Task 1: Database — `feedback` table, RLS, and the admin read function

**Files:**
- Create: `supabase/migrations/20260101_0016_feedback.sql`
- Apply: Supabase dashboard → SQL Editor (manual, as `postgres`)

**Interfaces:**
- Consumes: existing `public.users`, `public.labs`, `public.clinics`, and the helper `public.current_user_role()`.
- Produces:
  - Table `public.feedback (id uuid, user_id uuid, message text, page_path text, lang text, created_at timestamptz)`.
  - Function `public.admin_feedback_list()` returning rows of
    `(id uuid, message text, page_path text, lang text, created_at timestamptz, user_id uuid, first_name text, last_name text, email text, phone text, role public.user_role, org_name text)`.
  - Policy names: `feedback_insert_self`, `feedback_admin_select`, `feedback_admin_delete`.

- [ ] **Step 1: Write the failing check**

Open the Supabase dashboard SQL Editor for project `lab-order-dev` and run:

```sql
select to_regclass('public.feedback') as tbl,
       to_regprocedure('public.admin_feedback_list()') as fn;
```

- [ ] **Step 2: Run it to confirm it fails**

Expected output right now — both columns `NULL`:

```
tbl   | fn
------+-----
NULL  | NULL
```

If either is non-null, the migration was already partly applied. Stop and inspect before continuing.

- [ ] **Step 3: Write the migration file**

Create `supabase/migrations/20260101_0016_feedback.sql` with exactly this content:

```sql
-- Feedback: any non-admin user can send a short message to the platform admin.
-- Admin reads and deletes; nobody replies in-app and nothing is ever updated.
--
-- See docs/superpowers/specs/2026-07-29-feedback-button-design.md.

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

-- Sender: insert only, only as themselves, never as admin. There is no SELECT
-- policy for senders — this is a write-only mailbox, so the client must insert
-- WITHOUT .select() (a RETURNING clause would be blocked here).
drop policy if exists feedback_insert_self on public.feedback;
create policy feedback_insert_self on public.feedback
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.current_user_role() <> 'PLATFORM_ADMIN'
  );

-- Admin: read all, delete any. No UPDATE policy anywhere — feedback is immutable.
drop policy if exists feedback_admin_select on public.feedback;
create policy feedback_admin_select on public.feedback
  for select to authenticated
  using (public.current_user_role() = 'PLATFORM_ADMIN');

drop policy if exists feedback_admin_delete on public.feedback;
create policy feedback_admin_delete on public.feedback
  for delete to authenticated
  using (public.current_user_role() = 'PLATFORM_ADMIN');

-- ---------------------------------------------------------------------------
-- Admin list: feedback joined to the sender's contact card.
--
-- org_name uses scalar subselects, NOT joins: users -> labs is 1:N, so a left
-- join would emit one row per owned lab and duplicate the feedback. Doctors own
-- neither a lab nor a clinic and get null.
--
-- Contact details are read live rather than snapshotted onto the feedback row:
-- a support contact card should show the person's current phone, not the one
-- they had when they wrote in.
-- ---------------------------------------------------------------------------
create or replace function public.admin_feedback_list()
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
  org_name text
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
             where c.owner_user_id = u.id order by c.created_at limit 1))
  from public.feedback f
  join public.users u on u.id = f.user_id
  where public.current_user_role() = 'PLATFORM_ADMIN'
  order by f.created_at desc;
$$;

grant execute on function public.admin_feedback_list() to authenticated;
```

- [ ] **Step 4: Apply it and verify it passes**

Paste the whole file into the Supabase SQL Editor and run it. Then re-run the Step 1 query.

Expected output:

```
tbl              | fn
-----------------+--------------------------------
public.feedback  | admin_feedback_list()
```

Then verify RLS is on and all three policies exist:

```sql
select relrowsecurity from pg_class where oid = 'public.feedback'::regclass;
select policyname, cmd from pg_policies
 where schemaname = 'public' and tablename = 'feedback'
 order by policyname;
```

Expected: `relrowsecurity` = `t`, and exactly three rows:

```
feedback_admin_delete | DELETE
feedback_admin_select | SELECT
feedback_insert_self  | INSERT
```

If a fourth policy appears, or any `UPDATE` row shows up, something else created it — investigate before moving on.

- [ ] **Step 5: Verify the message length constraint rejects junk**

```sql
insert into public.feedback (user_id, message)
select id, '   ' from public.users limit 1;
```

Expected: the statement **fails** with `new row for relation "feedback" violates check constraint "feedback_message_check"`. (Whitespace-only is rejected by `btrim`.) No row is created.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260101_0016_feedback.sql
git commit -m "feat(feedback): feedback table, RLS and admin list function"
```

---

### Task 2: Types and translations

Doing types and all three locales in one task keeps `npm run i18n:check` green at every commit — splitting them would land a commit with keys in `en` only.

**Files:**
- Modify: `src/types/database.ts` (append near the other row types)
- Modify: `src/locales/en/common.json`, `src/locales/ka/common.json`, `src/locales/ru/common.json`
- Modify: `src/locales/en/admin.json`, `src/locales/ka/admin.json`, `src/locales/ru/admin.json`

**Interfaces:**
- Consumes: `UserRole` from `src/types/database.ts`.
- Produces:
  - `FeedbackRow` — `{ id, user_id, message, page_path, lang, created_at }`
  - `AdminFeedbackListRow` — `{ id, message, page_path, lang, created_at, user_id, first_name, last_name, email, phone, role, org_name }`
  - i18n keys `common:feedback.{tooltip,title,placeholder,success}`, `admin:nav.feedbacks`, `admin:feedbacks.{title,empty,sentFrom,deleteConfirmTitle,deleteConfirmBody,deleteAction}`

- [ ] **Step 1: Capture the pre-existing i18n baseline**

Run: `npm run i18n:check`

Save the output somewhere you can compare against (it is **already failing** on `doctor` and `lab` — that is expected and not yours to fix). What matters is that no `common` or `admin` finding appears in it now, and none appears after your change.

- [ ] **Step 2: Add the row types**

In `src/types/database.ts`, append after the existing row interfaces:

```ts
export interface FeedbackRow {
  id: string;
  user_id: string;
  message: string;
  page_path: string | null;
  lang: string | null;
  created_at: string;
}

/** One row of the `admin_feedback_list()` RPC: the message plus the sender's
 *  live contact card. `org_name` is the sender's lab or clinic name, null for
 *  doctors. */
export interface AdminFeedbackListRow {
  id: string;
  message: string;
  page_path: string | null;
  lang: string | null;
  created_at: string;
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  org_name: string | null;
}
```

- [ ] **Step 3: Add the `feedback` block to all three `common.json` files**

`src/locales/en/common.json` — add as a sibling of `"actions"`:

```json
  "feedback": {
    "tooltip": "Found a problem or have a suggestion? Write to us directly here.",
    "title": "Feedback",
    "placeholder": "Describe the problem or your suggestion…",
    "success": "Thanks! Your message has been sent."
  },
```

`src/locales/ka/common.json`:

```json
  "feedback": {
    "tooltip": "გაუმართაობის ან რჩევების შემთხვევაში მოიწერეთ პირდაპირ აქ",
    "title": "უკუკავშირი",
    "placeholder": "აღწერეთ ხარვეზი ან თქვენი რჩევა…",
    "success": "მადლობა! თქვენი შეტყობინება გაიგზავნა."
  },
```

`src/locales/ru/common.json`:

```json
  "feedback": {
    "tooltip": "Нашли проблему или есть предложение? Напишите нам напрямую здесь.",
    "title": "Обратная связь",
    "placeholder": "Опишите проблему или ваше предложение…",
    "success": "Спасибо! Ваше сообщение отправлено."
  },
```

- [ ] **Step 4: Add the admin keys to all three `admin.json` files**

In each file add `"feedbacks"` inside the existing `"nav"` object, and a new top-level `"feedbacks"` block.

`src/locales/en/admin.json` — `nav.feedbacks`: `"Feedbacks"`, then:

```json
  "feedbacks": {
    "title": "Feedbacks",
    "empty": "No feedback yet.",
    "sentFrom": "Sent from",
    "deleteConfirmTitle": "Delete this feedback?",
    "deleteConfirmBody": "This permanently removes the message from {{name}}.",
    "deleteAction": "Delete"
  },
```

`src/locales/ka/admin.json` — `nav.feedbacks`: `"უკუკავშირი"`, then:

```json
  "feedbacks": {
    "title": "უკუკავშირი",
    "empty": "უკუკავშირი ჯერ არ არის.",
    "sentFrom": "გაგზავნილია გვერდიდან",
    "deleteConfirmTitle": "წავშალოთ ეს უკუკავშირი?",
    "deleteConfirmBody": "{{name}}-ის შეტყობინება სამუდამოდ წაიშლება.",
    "deleteAction": "წაშლა"
  },
```

`src/locales/ru/admin.json` — `nav.feedbacks`: `"Обратная связь"`, then:

```json
  "feedbacks": {
    "title": "Обратная связь",
    "empty": "Обратной связи пока нет.",
    "sentFrom": "Отправлено со страницы",
    "deleteConfirmTitle": "Удалить эту обратную связь?",
    "deleteConfirmBody": "Сообщение от {{name}} будет удалено навсегда.",
    "deleteAction": "Удалить"
  },
```

- [ ] **Step 5: Verify**

Run: `npm run typecheck`
Expected: clean, no output errors.

Run: `npm run i18n:check`
Expected: the same `doctor` / `lab` findings as the Step 1 baseline and **nothing new** mentioning `common` or `admin`. If a `common` or `admin` line appeared, a key is missing from one of the three locales — fix it before committing.

Also confirm the JSON is valid (a trailing comma is the usual slip):

```bash
node -e "['en','ka','ru'].forEach(l=>['common','admin'].forEach(n=>{JSON.parse(require('fs').readFileSync('src/locales/'+l+'/'+n+'.json','utf8'));console.log(l,n,'ok')}))"
```

Expected: six `ok` lines.

- [ ] **Step 6: Commit**

```bash
git add src/types/database.ts src/locales
git commit -m "feat(feedback): row types and en/ka/ru strings"
```

---

### Task 3: Sender side — dialog, header button, AppShell wiring

**Files:**
- Create: `src/components/FeedbackDialog.tsx`
- Create: `src/components/FeedbackButton.tsx`
- Modify: `src/layouts/AppShell.tsx` (import, plus one line inside the toolbar `<Stack>` at line ~166)

**Interfaces:**
- Consumes: `useAuth()` → `{ user }` from `@/auth/AuthProvider` (`user.id`, `user.role`); `supabase` from `@/lib/supabase`; `FeedbackRow` shape from Task 2; keys `common:feedback.*` from Task 2.
- Produces:
  - `FeedbackDialog({ open, onClose, onSent }: { open: boolean; onClose: () => void; onSent: () => void })`
  - `FeedbackButton()` — no props; renders `null` for `PLATFORM_ADMIN` and for a signed-out user.

- [ ] **Step 1: Write the failing check**

Start the dev server in your own terminal (background tasks get reaped in this environment):

```bash
npm run dev
```

Open `http://localhost:5174`, log in as a **doctor**, and look at the header toolbar.

Expected right now: only the theme toggle, the language switcher and the avatar. **No envelope.** That is the failing state.

- [ ] **Step 2: Create the dialog**

Create `src/components/FeedbackDialog.tsx`:

```tsx
import { useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from '@mui/material';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';

const MAX_MESSAGE_LENGTH = 2000;

export function FeedbackDialog({
  open,
  onClose,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  onSent: () => void;
}) {
  const { t, i18n } = useTranslation('common');
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);

  const send = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('not_authenticated');
      // No .select() — senders have no SELECT policy on feedback, so a
      // RETURNING clause would be blocked by RLS. A bare insert sends
      // Prefer: return=minimal, which is what this needs.
      const { error } = await supabase.from('feedback').insert({
        user_id: user.id,
        message: message.trim(),
        page_path: pathname,
        // The language detector can return a region tag ("en-US"); the column
        // stores the plain two-letter code used everywhere else.
        lang: (i18n.resolvedLanguage ?? i18n.language).slice(0, 2),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setMessage('');
      setFailed(false);
      onSent();
      onClose();
    },
    onError: () => setFailed(true),
  });

  const canSubmit = message.trim().length > 0 && !send.isPending;

  const handleClose = () => {
    if (send.isPending) return;
    setFailed(false);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle>{t('feedback.title')}</DialogTitle>
      <DialogContent>
        {failed && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {t('errors.generic')}
          </Alert>
        )}
        <TextField
          autoFocus
          fullWidth
          multiline
          minRows={4}
          maxRows={10}
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
          placeholder={t('feedback.placeholder')}
          inputProps={{ maxLength: MAX_MESSAGE_LENGTH }}
          sx={{ mt: 1 }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={send.isPending}>
          {t('actions.cancel')}
        </Button>
        <Button variant="contained" disabled={!canSubmit} onClick={() => send.mutate()}>
          {t('actions.submit')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```

Note the failure path: `onError` only flips `failed`, so the dialog stays open **with the typed message intact** and the user can retry without re-typing.

- [ ] **Step 3: Create the button**

Create `src/components/FeedbackButton.tsx`:

```tsx
import { useState } from 'react';
import { Alert, IconButton, Snackbar, Tooltip } from '@mui/material';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { FeedbackDialog } from './FeedbackDialog';

/** Header entry point for user feedback. Rendered once in AppShell for every
 *  area — the role gate lives here rather than in the four layouts, so the
 *  shell stays role-agnostic. Admins receive feedback; they don't send it. */
export function FeedbackButton() {
  const { t } = useTranslation('common');
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);

  if (!user || user.role === 'PLATFORM_ADMIN') return null;

  return (
    <>
      <Tooltip title={t('feedback.tooltip')}>
        <IconButton onClick={() => setOpen(true)} color="inherit" aria-label={t('feedback.title')}>
          <MailOutlineIcon />
        </IconButton>
      </Tooltip>

      <FeedbackDialog open={open} onClose={() => setOpen(false)} onSent={() => setSent(true)} />

      <Snackbar
        open={sent}
        autoHideDuration={5000}
        onClose={() => setSent(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" onClose={() => setSent(false)} variant="filled">
          {t('feedback.success')}
        </Alert>
      </Snackbar>
    </>
  );
}
```

All `useState` calls sit above the early `return null`, so hook order is stable. `color="inherit"` and the default icon size match `ColorModeToggle` exactly.

- [ ] **Step 4: Wire it into the shell**

In `src/layouts/AppShell.tsx`, add the import next to the other component imports (near line 28):

```tsx
import { FeedbackButton } from '@/components/FeedbackButton';
```

Then in the toolbar `<Stack>` (line ~166), add it as the **first** child so the envelope sits left of the theme toggle:

```tsx
          <Stack direction="row" spacing={0.5} alignItems="center">
            <FeedbackButton />
            <ColorModeToggle />
            <LanguageSwitcher variant="icon" />
```

- [ ] **Step 5: Verify it passes**

Run: `npm run typecheck`
Expected: clean.

Then in the browser:

1. As a **doctor**: the envelope appears left of the theme toggle. Hover it — with the UI in Georgian the tooltip reads `გაუმართაობის ან რჩევების შემთხვევაში მოიწერეთ პირდაპირ აქ`.
2. Click it. Submit is **disabled** with an empty field, and stays disabled if you type only spaces.
3. Type `test feedback from doctor`, click Submit. The dialog closes and a green snackbar shows the success message.
4. Repeat as a **lab admin** and as a **clinic admin** — the button is present for both.
5. As the **platform admin**: there is **no** envelope in the header.

Confirm the rows landed, in the Supabase SQL Editor:

```sql
select u.role, f.message, f.page_path, f.lang
  from public.feedback f join public.users u on u.id = f.user_id
 order by f.created_at desc;
```

Expected: one row per message sent above, with `page_path` matching the route you were on (e.g. `/doctor`) and `lang` exactly two characters (`en`, `ka` or `ru` — **not** `en-US`).

- [ ] **Step 6: Commit**

```bash
git add src/components/FeedbackButton.tsx src/components/FeedbackDialog.tsx src/layouts/AppShell.tsx
git commit -m "feat(feedback): header envelope button and send dialog"
```

---

### Task 4: Admin side — Feedbacks page, route, nav entry

**Files:**
- Create: `src/pages/admin/FeedbacksPage.tsx`
- Modify: `src/routes.tsx` (import + one `<Route>` in the admin subtree, line ~124)
- Modify: `src/layouts/AdminLayout.tsx` (nav entry)

**Interfaces:**
- Consumes: `AdminFeedbackListRow` from `@/types/database` (Task 2); the `admin_feedback_list()` RPC and the `feedback_admin_delete` policy (Task 1); keys `admin:feedbacks.*`, `admin:nav.feedbacks`, `common:roles.*`, `common:actions.cancel` (Task 2).
- Produces: `FeedbacksPage()` — no props; route `/admin/feedbacks`.

- [ ] **Step 1: Write the failing check**

In the browser, logged in as the **platform admin**, navigate to `http://localhost:5174/admin/feedbacks`.

Expected right now: the 404 / not-found page, and no "Feedbacks" entry in the admin sidebar. That is the failing state.

- [ ] **Step 2: Create the page**

Create `src/pages/admin/FeedbacksPage.tsx`:

```tsx
import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Snackbar,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { supabase } from '@/lib/supabase';
import type { AdminFeedbackListRow } from '@/types/database';

export function FeedbacksPage() {
  const { t } = useTranslation('admin');
  const { t: tc } = useTranslation('common');
  const qc = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<AdminFeedbackListRow | null>(null);
  const [actionError, setActionError] = useState(false);

  const {
    data: items = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['admin-feedback'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_feedback_list');
      if (error) throw error;
      return (data ?? []) as AdminFeedbackListRow[];
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('feedback').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-feedback'] }),
    onError: () => setActionError(true),
  });

  return (
    <Stack spacing={3}>
      <Typography variant="h4">{t('feedbacks.title')}</Typography>

      {isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      )}

      {isError && <Alert severity="error">{tc('errors.loadFailed')}</Alert>}

      {!isLoading && !isError && items.length === 0 && (
        <Typography color="text.secondary">{t('feedbacks.empty')}</Typography>
      )}

      <Stack spacing={2}>
        {items.map((item) => (
          <Card key={item.id} variant="outlined">
            <CardContent>
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="flex-start"
                spacing={2}
              >
                <Stack spacing={0.5} sx={{ minWidth: 0 }}>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                    <Typography fontWeight={600}>
                      {item.first_name} {item.last_name}
                    </Typography>
                    <Chip size="small" label={tc(`roles.${item.role}`)} />
                    <Typography variant="body2" color="text.secondary">
                      {item.org_name ?? '—'}
                    </Typography>
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    {item.email}
                    {item.phone ? ` · ${item.phone}` : ''}
                  </Typography>
                </Stack>

                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="caption" color="text.secondary" noWrap>
                    {dayjs(item.created_at).format('YYYY-MM-DD HH:mm')}
                  </Typography>
                  <Tooltip title={t('feedbacks.deleteAction')}>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => setDeleteTarget(item)}
                      aria-label={t('feedbacks.deleteAction')}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </Stack>

              <Divider sx={{ my: 1.5 }} />

              <Typography sx={{ whiteSpace: 'pre-wrap' }}>{item.message}</Typography>

              <Stack direction="row" spacing={1} sx={{ mt: 1.5 }} flexWrap="wrap">
                {item.page_path && (
                  <Chip
                    size="small"
                    variant="outlined"
                    label={`${t('feedbacks.sentFrom')}: ${item.page_path}`}
                  />
                )}
                {item.lang && <Chip size="small" variant="outlined" label={item.lang} />}
              </Stack>
            </CardContent>
          </Card>
        ))}
      </Stack>

      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>{t('feedbacks.deleteConfirmTitle')}</DialogTitle>
        <DialogContent>
          {deleteTarget && (
            <Typography>
              {t('feedbacks.deleteConfirmBody', {
                name: `${deleteTarget.first_name} ${deleteTarget.last_name}`,
              })}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>{tc('actions.cancel')}</Button>
          <Button
            color="error"
            variant="contained"
            disabled={remove.isPending}
            onClick={async () => {
              if (deleteTarget) {
                await remove.mutateAsync(deleteTarget.id).catch(() => {});
              }
              setDeleteTarget(null);
            }}
          >
            {t('feedbacks.deleteAction')}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={actionError}
        autoHideDuration={5000}
        onClose={() => setActionError(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="error" onClose={() => setActionError(false)} variant="filled">
          {tc('errors.generic')}
        </Alert>
      </Snackbar>
    </Stack>
  );
}
```

A card list, not a `DataGrid`: the labs queue uses a grid because its rows are short structured fields, whereas a feedback body is free text of arbitrary length and reads badly in a grid cell.

- [ ] **Step 3: Add the route**

In `src/routes.tsx`, add the import beside the other admin page imports (near line 44):

```tsx
import { FeedbacksPage } from '@/pages/admin/FeedbacksPage';
```

Then inside the existing admin `<Route path="/admin">` block (after the `labs/:labId` route, line ~126):

```tsx
        <Route path="labs/:labId" element={<LabReviewPage />} />
        <Route path="feedbacks" element={<FeedbacksPage />} />
      </Route>
```

- [ ] **Step 4: Add the nav entry**

Replace the body of `src/layouts/AdminLayout.tsx` with:

```tsx
import HomeIcon from '@mui/icons-material/Home';
import ScienceIcon from '@mui/icons-material/Science';
import FeedbackOutlinedIcon from '@mui/icons-material/FeedbackOutlined';
import { useTranslation } from 'react-i18next';
import { AppShell, type NavEntry } from './AppShell';

export function AdminLayout() {
  const { t } = useTranslation('admin');
  const nav: NavEntry[] = [
    { to: '/admin', label: t('nav.home'), icon: <HomeIcon />, end: true },
    { to: '/admin/labs', label: t('nav.labs'), icon: <ScienceIcon /> },
    { to: '/admin/feedbacks', label: t('nav.feedbacks'), icon: <FeedbackOutlinedIcon /> },
  ];
  return <AppShell brand="Lab Order — Admin" navEntries={nav} />;
}
```

- [ ] **Step 5: Verify it passes**

Run: `npm run typecheck`
Expected: clean.

Run: `npm run i18n:check`
Expected: unchanged from the Task 2 baseline — no new `admin` or `common` findings.

In the browser as the **platform admin**:

1. "Feedbacks" appears in the sidebar; clicking it opens `/admin/feedbacks`.
2. Every message sent in Task 3 is listed, newest first, each showing the sender's name, role chip, org name (an em-dash for doctors, the lab/clinic name otherwise), email, phone, timestamp, the message body, and the page-path and language chips.
3. Switch the UI language — the page title, nav label and role chips all translate.
4. Click the delete icon on one item, confirm in the dialog. It disappears from the list immediately and is still gone after a full page reload.

Confirm the delete really hit the database:

```sql
select count(*) from public.feedback;
```

Expected: one fewer than before the delete.

- [ ] **Step 6: Verify a non-admin cannot read the inbox**

Two checks.

In the browser, log in as a **doctor** and navigate directly to `http://localhost:5174/admin/feedbacks`.
Expected: `RoleGuard` bounces you to `/forbidden`. The page never renders.

In the Supabase SQL Editor, confirm there is exactly one SELECT policy and that it is admin-only:

```sql
select policyname, qual from pg_policies
 where schemaname = 'public' and tablename = 'feedback' and cmd = 'SELECT';
```

Expected: a single row, `feedback_admin_select`, whose `qual` reads
`(current_user_role() = 'PLATFORM_ADMIN'::user_role)`. If a second SELECT policy
exists, senders can read each other's messages — fix that before shipping.

The RPC itself is safe by construction: its admin check sits in the function's
`where` clause, so a non-admin caller gets an empty set rather than data or an
error.

- [ ] **Step 7: Commit**

```bash
git add src/pages/admin/FeedbacksPage.tsx src/routes.tsx src/layouts/AdminLayout.tsx
git commit -m "feat(feedback): admin feedbacks inbox with delete"
```

---

## Final verification

After all four tasks:

- [ ] `npm run typecheck` — clean.
- [ ] `npm run i18n:check` — same findings as the Task 2 baseline, nothing new in `common` or `admin`.
- [ ] `npm run build` — succeeds. (`tsc -b` is stricter than ESLint about unused locals; the build is the real gate.)
- [ ] End-to-end: send feedback as a doctor → it appears in the admin inbox with correct contact details → admin deletes it → it is gone after reload.
- [ ] The platform admin has no envelope in their own header.
