# Spec — Clinic ↔ Doctors & Clinic Order Oversight

> Status: **DESIGN — awaiting build** (2026-07-17).
> Purpose (owner): a clinic is an umbrella over doctors. The clinic admin sees **all order data of every doctor under the clinic**, and can drill into a single doctor's orders. Read-only oversight/reporting.
> Decisions locked: **doctors join via clinic invite → doctor accepts** (explicit consent — the privacy boundary); **one clinic per doctor** (extendable to multi later).

This turns the currently-empty `CLINIC_ADMIN` role (registration + a "coming soon" page) into a working role. See `SPEC-lab-staff-telegram.md` for the house patterns (SECURITY DEFINER RPCs for cross-role reads, RLS as the only authz boundary).

## 1. Why consent is mandatory (the privacy boundary)

Orders carry **patient PII** (names, cases, clinical answers). "Clinic sees all its doctors' orders" = the clinic reads that PII for every linked doctor. Therefore the doctor↔clinic link must be **doctor-consented**: a clinic can only ever see data for doctors who explicitly accepted its invite. A clinic can **never** unilaterally attach a doctor. This is enforced in the DB (the accept RPC runs as the doctor), not just the UI.

## 2. Data model (new migration `20260101_0013_clinic_doctors.sql`)

```sql
-- The link: a doctor is under at most one clinic.
alter table public.doctor_profiles
  add column if not exists clinic_id uuid references public.clinics(id) on delete set null;
create index if not exists doctor_profiles_clinic_idx on public.doctor_profiles(clinic_id);

-- Invitations (clinic -> doctor email).
create table if not exists public.clinic_doctor_invites (
  id                 uuid primary key default gen_random_uuid(),
  clinic_id          uuid not null references public.clinics(id) on delete cascade,
  doctor_email       text not null,   -- lower/trimmed; matched to the doctor's users.email
  status             text not null default 'PENDING'
                       check (status in ('PENDING','ACCEPTED','DECLINED','REVOKED')),
  invited_by_user_id uuid references public.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  responded_at       timestamptz
);
-- At most one open invite per (clinic, email).
create unique index if not exists clinic_doctor_invites_one_pending
  on public.clinic_doctor_invites (clinic_id, lower(doctor_email)) where status = 'PENDING';
create index if not exists clinic_doctor_invites_email_idx
  on public.clinic_doctor_invites (lower(doctor_email));
```

### Helper

```sql
-- The clinic this authenticated user OWNS (clinic admin), or null.
create or replace function public.current_admin_clinic_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.clinics where owner_user_id = auth.uid();
$$;
```

### RLS

- **`clinic_doctor_invites`**
  - Clinic admin: full control of rows where `clinic_id = current_admin_clinic_id()` (create/list/revoke its own invites).
  - Doctor: SELECT rows where `lower(doctor_email) = lower(<their users.email>)` (see invites addressed to them). No direct UPDATE — responding goes through the RPC.
  - `PLATFORM_ADMIN`: SELECT.
- **`doctor_profiles.clinic_id`** — set only via RPCs (accept / leave / remove), never a raw client UPDATE of `clinic_id`. (Doctors already own their `doctor_profiles` row; the accept RPC is SECURITY DEFINER so consent + one-clinic rules are enforced centrally.)
- **Clinic read access to orders & related** (the oversight grant) — add a clinic SELECT policy to each table the order views read, gated by "the order's doctor is under my clinic":
  - `orders`: `exists (select 1 from doctor_profiles dp where dp.id = orders.doctor_id and dp.clinic_id = current_admin_clinic_id())` (and `current_admin_clinic_id() is not null`).
  - Same shape (join orders → doctor_profiles) for the tables an order detail reads: `order_answers`, `order_edits`, `patients`/`patient_cases` (only patients referenced by those orders), and read of the doctor `users`/`doctor_profiles` rows for the roster. Each is a narrow additive SELECT policy — no writes.
  - ⚠️ This is the broad, swarm-review-worthy part. Every table the clinic UI reads needs a matching policy or a SECURITY DEFINER RPC; miss one and the page breaks (deny) — leak one too wide and PII escapes. Prefer a small number of **RPCs** that return exactly the columns the clinic screens need (mirrors `get_order_staff`), so the column surface is explicit.

### RPCs (SECURITY DEFINER, `search_path = public`)

```sql
-- Doctor responds to an invite. Runs AS THE DOCTOR (auth.uid()); this is the consent gate.
create function public.respond_clinic_invite(p_invite_id uuid, p_accept boolean) returns void ...
--   * load invite; require status='PENDING' and lower(doctor_email)=lower(caller's email); else raise.
--   * if accept: set the caller's doctor_profiles.clinic_id = invite.clinic_id
--       (one-clinic rule: if already in a clinic, raise 'already_in_clinic' — doctor must leave first).
--     set status='ACCEPTED', responded_at=now().
--   * if decline: status='DECLINED', responded_at=now().

-- Doctor leaves their clinic (self-service).  set own clinic_id = null.
create function public.leave_clinic() returns void ...

-- Clinic admin removes a doctor from its roster.
create function public.clinic_remove_doctor(p_doctor_id uuid) returns void ...
--   * require the doctor's clinic_id = current_admin_clinic_id(); then set it null.

-- Clinic roster + order feeds (names + safe columns only), gated to current_admin_clinic_id():
create function public.clinic_doctors() returns table (...);        -- doctors under my clinic
create function public.clinic_orders(p_doctor_id uuid default null)  -- all/one doctor's orders
  returns table (...);
```

## 3. Frontend

| Piece | File | Notes |
|---|---|---|
| Clinic dashboard | `src/pages/clinic/ClinicHomePage.tsx` (replace stub) | KPIs: # doctors, # orders, recent activity; entry points to the two pages below |
| Doctors page | `src/pages/clinic/ClinicDoctorsPage.tsx` + route `/clinic/doctors` | Roster (via `clinic_doctors()`); "Invite doctor" (email); pending/declined invites; remove doctor |
| Orders page | `src/pages/clinic/ClinicOrdersPage.tsx` + route `/clinic/orders` | All orders across doctors (via `clinic_orders()`), filter by doctor; row → read-only order detail |
| Order detail (read-only) | reuse a read-only variant of the doctor order detail | Clinic sees full order data; no edit/actions |
| Doctor: incoming invites | `src/pages/doctor/*` (profile or a banner/notification) | List invites addressed to me → Accept / Decline (calls `respond_clinic_invite`) |
| Nav | `src/layouts/ClinicLayout.tsx` | Add Doctors + Orders nav items (currently an un-i18n'd stub — also fixes ARCHITECTURE §14) |
| Types | `src/types/database.ts` | `ClinicDoctorInviteRow`, RPC row types |
| i18n | new `clinic.json` keys + a few `doctor.json` keys, **en/ka/ru** | gated by `npm run i18n:check` |

## 4. Phases

1. **Link + invites** — migration (link column, invites table, RLS, `respond_clinic_invite`/`leave_clinic`/`clinic_remove_doctor`, `clinic_doctors`), doctor's accept/decline UI, clinic Doctors page. *Ships a working roster with consent; no order data yet.*
2. **Order oversight** — clinic read policies/RPCs for orders + related, Clinic Orders page + per-doctor filter + read-only order detail, dashboard KPIs. *The core value.*
3. **Polish** — aggregates/billing rollups, CSV export, empty/edge states, notifications for new invites.

## 5. Edge cases & risks

- **Doctor already in a clinic** accepts another invite → blocked (`already_in_clinic`); must `leave_clinic` first (one-clinic rule). Revisit if multi-clinic is ever chosen.
- **Invite to an email with no account yet** → invite sits PENDING; it becomes actionable once that person registers as a doctor with that email. (Optionally surface "invited, not yet registered".)
- **Doctor leaves / is removed** → clinic instantly loses access to that doctor's orders (RLS is live). Past orders are NOT copied to the clinic; access is by current link only. Decide if that's desired (it matches "oversight", not "ownership").
- **PII surface**: clinic sees patient data for linked doctors. Consent (accept flow) is the legal/UX basis. Keep the read RPCs column-scoped; never expose more than the screens need.
- **RLS breadth**: the order-oversight policies are the highest-risk change — run a swarm review on Phase 2 before shipping (like lab-staff).
- **`current_admin_clinic_id()` null** for non-clinic users → every clinic policy short-circuits to false. Confirm in tests that doctors/labs are unaffected.

## 6. Verification plan

- `npm run typecheck`, `npm run i18n:check` (no new red).
- RLS negative tests (anon key): clinic A cannot see clinic B's doctors/orders; a clinic cannot see a doctor who hasn't accepted; a doctor cannot set their own `clinic_id` directly; a removed/left doctor's orders disappear from the clinic immediately.
- Consent test: invite → until the doctor accepts, `clinic_orders()` returns nothing for them; after accept, their orders appear.
- Live: clinic invites a real doctor → doctor accepts → clinic sees that doctor's orders end-to-end.
