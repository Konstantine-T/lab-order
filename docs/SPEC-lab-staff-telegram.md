# Spec — Lab Staff, Order Assignments & Telegram Chat Creation

> Status: **Phase 1 & 2 implemented; Phase 3 (Telegram) code-complete, blocked on owner provisioning** (updated 2026-07-17).
> Decisions made by owner: Telegram = **auto via MTProto userbot**, **link-first** strategy; doctor **sees assigned staff names** (phones hidden).
> Security note: doctors read chat data ONLY via the `get_order_chat()` RPC (invite link only) — the `order_chats` table (which holds phones in `unadded_members`) is lab-owner/admin-readable only. This closes the swarm-review finding that the doctor `order_chats` SELECT policy leaked staff phones.

## 1. Feature summary

1. **Lab staff directory** — a lab (`LAB_MAIN_ADMIN`) manages its own staff members. Staff are **plain records, not accounts** (no `auth.users` row). Fields: first name, last name (required), **phone (required)**, email (optional).
2. **Order team assignment** — on an incoming order, the lab attaches/detaches staff members so everyone knows who's working on that order. The doctor sees assigned staff **names** (read-only, no phones).
3. **"Create chat"** — one click on the order sheet creates a **Telegram group** containing: the assigned staff, the doctor who sent the order, and the lab (via its contact phone). Implemented with an MTProto userbot (a dedicated platform-owned Telegram account) running in a **Supabase Edge Function** — the first server-side component in this app.

## 2. Data model (new migration `supabase/migrations/20260101_0012_lab_staff.sql`)

```sql
create table public.lab_staff (
  id                uuid primary key default gen_random_uuid(),
  lab_id            uuid not null references public.labs(id) on delete cascade,
  first_name        text not null,
  last_name         text not null,
  phone             text not null,          -- E.164 normalized client-side; required
  email             text,                   -- optional
  telegram_user_id  bigint,                 -- cached after first successful resolution
  archived_at       timestamptz,            -- soft delete (keep history on past orders)
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index on public.lab_staff (lab_id);
create unique index lab_staff_unique_active_phone
  on public.lab_staff (lab_id, phone) where archived_at is null;

create table public.order_staff_assignments (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references public.orders(id) on delete cascade,
  staff_id            uuid not null references public.lab_staff(id) on delete cascade,
  assigned_by_user_id uuid references public.users(id),
  assigned_at         timestamptz not null default now(),
  unique (order_id, staff_id)
);
create index on public.order_staff_assignments (order_id);
create index on public.order_staff_assignments (staff_id);

create table public.order_chats (
  order_id           uuid primary key references public.orders(id) on delete cascade,
  telegram_chat_id   bigint not null,
  invite_link        text not null,
  unadded_members    jsonb not null default '[]', -- [{name, phone, reason}] who need the invite link
  created_by_user_id uuid references public.users(id),
  created_at         timestamptz not null default now()
);
```

### RLS

- `lab_staff`: `current_user_owns_lab(lab_id)` → ALL ops. `PLATFORM_ADMIN` → SELECT. **No doctor policy** (phones stay hidden).
- `order_staff_assignments`: lab owner of the order's lab → SELECT/INSERT/DELETE (join through `orders.lab_id`); `PLATFORM_ADMIN` → SELECT. Assignment changes blocked on terminal orders (`COMPLETED`/`CANCELLED`) via policy predicate.
- `order_chats`: SELECT for the order's lab owner **and** the order's doctor; INSERT only by the Edge Function (service role — no client INSERT policy).
- **Doctor name visibility** via SECURITY DEFINER RPC (not table policy, so `phone`/`email` never leave the DB):

```sql
create function public.get_order_staff(p_order_id uuid)
returns table (staff_id uuid, first_name text, last_name text)
language sql security definer set search_path = public as $$
  select s.id, s.first_name, s.last_name
  from order_staff_assignments a
  join lab_staff s on s.id = a.staff_id
  join orders o on o.id = a.order_id
  where a.order_id = p_order_id
    and (o.doctor_id = current_doctor_id() or current_user_owns_lab(o.lab_id)
         or current_user_role() = 'PLATFORM_ADMIN');
$$;
```

> ⚠️ Per repo convention: this migration must NOT redefine `handle_new_user()`/`submit_order` — keep the 0011 security guard the runtime winner.

## 3. Telegram chat creation (Supabase Edge Function `create-order-chat`)

**Why Edge Function + MTProto:** the Bot API cannot create groups or add users by phone. A real Telegram account (dedicated, platform-owned) driven by GramJS can. Secrets must live server-side; the app has no server today, so this is the first one.

**Flow** (`supabase/functions/create-order-chat/index.ts`, Deno + GramJS):
1. Verify the caller's Supabase JWT; load the order with service role; require caller `current_user_owns_lab(order.lab_id)` (re-checked server-side, not trusted from client).
2. Idempotency: if `order_chats` row exists → return existing `invite_link`.
3. Collect participants:
   - assigned staff → `lab_staff.phone` (must be ≥1 assigned, else 400),
   - doctor → `users.phone` (nullable! see §6),
   - lab → `labs.contact_phone`.
4. MTProto: `contacts.importContacts(phones)` → resolve to Telegram users; `messages.createChat(title: "Order #<order_number> — <lab name>")` with resolvable users; `messages.exportChatInvite` → invite link.
5. Anyone unresolvable (no Telegram, privacy blocks phone-add, `PeerFloodError`) goes into `unadded_members` — the UI shows the invite link with per-person share shortcuts instead of failing the whole call.
6. Persist `order_chats`, cache `telegram_user_id` on resolved staff, return `{invite_link, chat_id, unadded_members}`.

**Secrets** (`supabase secrets set`): `TG_API_ID`, `TG_API_HASH`, `TG_SESSION` (StringSession generated once by a local login script `scripts/tg-login.mjs` — interactive, run by a human), plus `SUPABASE_SERVICE_ROLE_KEY` (auto-injected).

**Owner provisioning (human TODO, blocks Phase 3):** create a dedicated Telegram account (platform SIM), register an app at my.telegram.org → `api_id`/`api_hash`, run the login script, set secrets, `supabase functions deploy create-order-chat`.

## 4. Frontend

| Piece | File | Notes |
|---|---|---|
| Staff page | `src/pages/lab/LabStaffPage.tsx` + route `/lab/staff` in `routes.tsx` | List of active staff (cards, matching lab pages style); Add/Edit dialog (RHF + zod: names + phone required, E.164-ish validation, email optional); Archive action (soft delete, confirm dialog) |
| Staff schema | `src/features/lab/staff/staffSchema.ts` | zod, mirrors work-location dialog pattern |
| Nav | `src/layouts/LabLayout.tsx` | `{ to: '/lab/staff', label: t('nav.staff'), icon: <GroupsIcon /> }` |
| Order team section | `src/pages/lab/LabOrderSheetPage.tsx` (new section/component `src/features/lab/staff/OrderTeamSection.tsx`) | Multi-select (Autocomplete) of active staff → insert/delete `order_staff_assignments`; assigned shown as chips; hidden/disabled on terminal orders |
| Create chat button | same section | Calls `supabase.functions.invoke('create-order-chat')`; loading state; on success shows invite link (copy button) + `unadded_members` list with share hints; if chat exists, button becomes "Open chat" link |
| Doctor visibility | `src/pages/doctor/OrderDetailPage.tsx` | Read-only "Lab team" block via `get_order_staff` RPC (names only) + chat invite link if `order_chats` row visible |
| Types | `src/types/database.ts` | `LabStaffRow`, `OrderStaffAssignmentRow`, `OrderChatRow` |
| React Query keys | — | `['lab-staff', labId]`, `['order-staff', orderId]`, `['order-chat', orderId]`; invalidate on mutate |

**i18n:** new keys in `lab.json` (`nav.staff`, `staff.*`, `orderSheet.team.*`) and `doctor.json` (`orderDetail.labTeam.*`) — **all three locales** (en/ka/ru), gated by `npm run i18n:check`.

## 5. Implementation phases

1. **Staff directory** — migration (tables + RLS + RPC) applied via dashboard SQL Editor, types, `LabStaffPage`, nav, i18n. *Pure Supabase, shippable alone.*
2. **Order assignments** — `OrderTeamSection` on the order sheet, doctor's read-only block, invalidations. *Shippable alone.*
3. **Telegram** — Edge Function + login script + order-sheet chat UI. *Blocked on owner provisioning (§3).*

## 6. Risks & edge cases

- **Doctor has no phone** (`users.phone` nullable): doctor goes to `unadded_members` and joins via invite link. Optional follow-up: prompt doctors to add a phone.
- **Privacy settings / PeerFloodError:** adding strangers by phone often fails or gets the userbot flagged. The invite-link fallback is the safety net; keep adds low-volume and sequential. Worst case the account gets limited → chats degrade to "everyone joins via link", still functional.
- **Idempotency & races:** `order_chats` PK on `order_id` + upfront existence check; double-click safe.
- **Staff archived after assignment:** assignment rows persist (history); archived staff excluded from the assignment picker and from new chats.
- **No Edge Functions used before:** adds `supabase/functions/` + CLI deploy step to the workflow; document in SETUP.
- **Phone normalization:** store E.164 (`+995…`); zod transform strips spaces/dashes; Georgian default prefix helper in the dialog.

## 7. Verification plan

- `npm run typecheck`, `npm run i18n:check` (no new red).
- RLS negative tests (anon key): lab B cannot read lab A staff; doctor cannot select `lab_staff` directly; doctor gets names via RPC only on own order; **doctor cannot `select * from order_chats`** (policy is lab/admin only) — must use `get_order_chat()`.
- Live: create staff → assign on a real order → doctor sees names → create chat with real Telegram numbers → group exists, link works, unadded fallback renders.

## 8. Runbook — provisioning & deploying Phase 3 (Telegram)

**All the code exists** (`scripts/tg-login.mjs`, `supabase/functions/create-order-chat/`, the client buttons, the migration RPC). What's left is the human/ops steps below. Do them in order.

### Step A — re-apply the migration delta to the live DB (one-time, no Telegram needed)
The `0012` migration was amended after it was first applied: the `order_chats` SELECT policy is now lab/admin-only, plus a new `get_order_chat()` RPC and an `assigned_by_user_id = auth.uid()` insert guard. Re-run `supabase/migrations/20260101_0012_lab_staff.sql` in the dashboard **SQL Editor** (it is idempotent — `drop policy if exists` / `create or replace`). Until you do, the doctor's "Open chat" link query returns nothing (harmless) and the phone-leak fix isn't live.

### Step B — get a dedicated Telegram account + API credentials (you, ~15 min)
1. Get a phone number you control that is **not your personal number** (a cheap second SIM or eSIM). This account will run automation and could get rate-limited.
2. Install Telegram, register that number, set a name (e.g. "LabOrder Bot").
3. Go to **https://my.telegram.org** → log in with that number → **API development tools** → create an app (any title/short-name). Copy the **`api_id`** and **`api_hash`**.

### Step C — mint the session string (you, ~2 min)
```bash
npm i telegram                                   # local dep for the login script only
TG_API_ID=<api_id> TG_API_HASH=<api_hash> node scripts/tg-login.mjs
# → enter the phone, the code Telegram texts you, and 2FA password if set
# → copy the three TG_* lines it prints
```

### Step D — set the secrets & deploy (you, ~5 min)
```bash
supabase link --project-ref zukelhnhdaoiufzkkjmm      # if not already linked
supabase secrets set TG_API_ID=<...> TG_API_HASH=<...> TG_SESSION=<...>
supabase functions deploy create-order-chat
```
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically — do **not** set them.

### Step E — live test
Create staff → assign ≥1 to a real order → click **Create Telegram chat** on the lab order sheet → a group appears, the invite link works, and anyone unreachable by phone shows under "couldn't be added". Open the doctor's order detail → **Open Telegram chat** link appears (link only, never phones).

### If GramJS won't run on the Edge runtime
GramJS drives MTProto over a socket; the Supabase Edge (Deno) runtime is the one unknown we can only validate at deploy (Step D). If `functions deploy`/invoke fails on transport/crypto:
1. First try adding `useWSS: true` to the `new TelegramClient(...)` options (WebSocket transport is friendlier to restricted runtimes).
2. If it still fights, move the same `index.ts` logic to a tiny standalone Node service (Fly.io / Railway / a container) and have the client call that instead of `functions.invoke` — the auth/authorization re-checks and the DB writes are identical; only the transport host changes.

### Ops caveats (from spec §6)
Keep phone-adds low-volume and sequential (already the case — the function resolves contacts one at a time). If the userbot gets limited by Telegram, chats degrade to "everyone joins via the invite link", which still works. The link is the guarantee; auto-add is the nicety.
