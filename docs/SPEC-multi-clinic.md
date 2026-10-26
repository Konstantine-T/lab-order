# Spec — A doctor in several clinics; orders belong to a clinic

> Status: **DESIGN LOCKED — building** (2026-10-26). §9 answered: every recommended option.
> Replaces the "one clinic per doctor" rule of `SPEC-clinic-doctors.md` (§2, §5).
> Decisions locked (owner, 2026-10-26):
> 1. A doctor can belong to **several clinics**.
> 2. **A clinic sees only its own orders.** Every order belongs to one clinic, or to none (the doctor's private work). Clinic access is keyed on the **order's** clinic, never again on the doctor's membership.
> 3. When the doctor places an order, they **pick its clinic in the wizard** ("For: Clinic A / Clinic B / Myself (private)"). An order a clinic admin places belongs to that clinic.
> 4. **Existing orders** belong to the doctor's current clinic (today that is every order a clinic can see, so nothing visible changes).
> 5. For a clinic order the doctor **does not type an address**: delivery (and invoice) details come from the clinic.

## 1. Why the current model cannot just allow two clinics

Today every clinic grant asks *"is this order's doctor in my clinic right now?"* (`doctor_in_admin_clinic`, `order_in_admin_clinic`, `patient_in_admin_clinic`, `can_act_for_doctor`, the payables RPCs, `_notification_parties`; ~19 migrations reuse them). Membership is one column, `doctor_profiles.clinic_id`. Consequences, even before multi-clinic:

- A clinic sees **all** of a member doctor's orders, patients and prices, whatever they were for, including history from before the doctor joined.
- When a doctor leaves or is removed, the clinic instantly loses **every** one of those orders, including ones it placed itself and still owes the lab for (payables vanish).

With two clinics the first point becomes a leak between competing clinics. Moving the key from the doctor to the order fixes both.

## 2. Data model (migration `20260101_0050_multi_clinic.sql`)

```sql
-- Membership: many clinics per doctor. Written only by the membership RPCs (§4).
create table if not exists public.clinic_memberships (
  clinic_id  uuid not null references public.clinics(id) on delete cascade,
  doctor_id  uuid not null references public.doctor_profiles(id) on delete cascade,
  joined_at  timestamptz not null default now(),
  primary key (clinic_id, doctor_id)
);
create index if not exists clinic_memberships_doctor_idx on public.clinic_memberships (doctor_id);

-- The clinic an order is for; null = the doctor's private work.
alter table public.orders
  add column if not exists clinic_id uuid references public.clinics(id) on delete set null;
create index if not exists orders_clinic_idx on public.orders (clinic_id);

-- What a clinic order is delivered and invoiced to (clinics had neither).
alter table public.clinics
  add column if not exists working_address text,
  add column if not exists invoice_email   text;

-- A clinic order has no doctor-typed location: the snapshot comes from the clinic.
alter table public.orders alter column doctor_work_location_id drop not null;
```

- `orders.clinic_id` is **set once, at submit**, and frozen by a BEFORE UPDATE trigger (the `placed_by_user_id` pattern of 0043, including letting the FK's `on delete set null` through). `edit_order` cannot move an order between clinics.
- **`doctor_profiles.clinic_id` is dropped at the end of 0050**, together with its protect trigger, its `doctor_left` trigger and 0048's `doctor_profiles_buyer_no_clinic` CHECK, after every reader and writer has been redefined. Dropping it makes any reference that was missed fail loudly ("column does not exist") instead of silently granting access from a stale value: fail closed.
- `clinic_memberships` gets RLS: a doctor reads their own rows; a clinic admin reads its clinic's rows; the platform admin reads all. No client write grant (the 0039 lesson: `revoke all` first). Added to the realtime publication.

### Backfill (in 0050, idempotent)

```sql
insert into public.clinic_memberships (clinic_id, doctor_id, joined_at)
select dp.clinic_id, dp.id, coalesce(<the accepted invite's responded_at>, now())
  from public.doctor_profiles dp where dp.clinic_id is not null
on conflict do nothing;

update public.orders o
   set clinic_id = dp.clinic_id
  from public.doctor_profiles dp
 where dp.id = o.doctor_id and dp.clinic_id is not null and o.clinic_id is null;
```

Both run before the column is dropped. Existing orders keep their doctor-typed `work_location_snapshot` / `invoice_recipient_snapshot`; snapshots are never rewritten.

## 3. Access rules: old → new

New helpers (SECURITY DEFINER, `search_path = public`). The membership test is only used for **who a clinic may order for**; everything about an existing order uses the order's own clinic.

```sql
-- Is this doctor a member of the caller's clinic? (roster, ordering for, drafts)
doctor_in_admin_clinic(p_doctor_id)  :=  exists (clinic_memberships cd
                                          where cd.doctor_id = p_doctor_id
                                            and cd.clinic_id = current_admin_clinic_id())
-- May the caller act on this order? The order's doctor, or its clinic's admin.
can_act_for_order(p_doctor_id, p_clinic_id)
                                     :=  coalesce(p_doctor_id = current_doctor_id(), false)
                                      or coalesce(p_clinic_id is not null
                                                  and p_clinic_id = current_admin_clinic_id(), false)
```

A clinic **keeps full rights on its orders after the doctor leaves** (they are its cases and its bills). See §9 Q3 to change that.

| Object (runtime winner) | Today | After 0050 |
|---|---|---|
| `orders_clinic_select` (0015) | `doctor_in_admin_clinic(orders.doctor_id)` | `orders.clinic_id = current_admin_clinic_id()` |
| `orders_clinic_update` (0022) | same, + not terminal | same switch, + not terminal |
| `order_answers_clinic_select` / `order_in_admin_clinic` (0015) | order's doctor in my clinic | order's `clinic_id` is mine |
| `patients_clinic_select` / `patient_in_admin_clinic` (0015) | any order of the patient has a doctor in my clinic | any order of the patient **for my clinic** |
| `order_files` select/insert/delete, `storage.objects` order-files read/upload/delete (0021) | `can_act_for_doctor(o.doctor_id)` | `can_act_for_order(o.doctor_id, o.clinic_id)` |
| `order_clarifications_participants_select` (0029) | `can_act_for_doctor` | `can_act_for_order` |
| `order_drafts_author_all` (0023) | author + `can_act_for_doctor(doctor_id)` | author + (own doctor **or** `doctor_in_admin_clinic`) |
| `work_locations_clinic_select` (0015) | clinic reads the doctor's typed locations | **dropped**: clinic orders no longer use them, and they would show a clinic the doctor's other workplaces |
| `edit_order` (0048), `complete_order` / `reopen_order` (0022), `cancel_order` (0045), `answer_clarification` (0033), `acknowledge_order_invoice` (0035), `get_order_chat` / `get_order_staff` (0041) | `can_act_for_doctor(v_order.doctor_id)` | `can_act_for_order(v_order.doctor_id, v_order.clinic_id)` |
| `clinic_submit_order` (0032) | `can_act_for_doctor(p_doctor_id)` | `doctor_in_admin_clinic(p_doctor_id)`; the order's clinic is the caller's |
| `find_matching_patient` (0048) | the doctor's patients, for the doctor or their clinic | the doctor calling: all their patients; a clinic admin calling: only patients with an order **for that clinic** (no matches leak another clinic's patients) |
| `clinic_doctors()` (0013) | `dp.clinic_id = mine` | `clinic_memberships` rows of my clinic |
| `clinic_payables_by_doctor` / `clinic_payables_list` (0024) | all orders of member doctors | `o.clinic_id = mine` (ex-members' orders stay; names from `doctor_snapshot`) |
| `_notification_parties` + order triggers (0043/0046) | owner of the doctor's **current** clinic | owner of the **order's** clinic (new param); private orders notify no clinic |
| `doctor_left` (0043, on `doctor_profiles`) | column goes non-null → null | AFTER DELETE on `clinic_memberships` → that clinic's owner |
| `my_clinic()` (0049) | 0 or 1 row | all memberships, with the display fields the wizard needs (§5) |
| `can_act_for_doctor` (0036) | doctor or member-clinic admin | kept only where the question really is about the doctor (none left after this table); redefined on membership so a stray caller stays correct |

Unchanged: `clinic_doctor_invites` policies (ownership-keyed), `clinics` owner policies, `lab_reviews` (doctor only, by design), `order_edits` (the clinic still cannot read edit history: an existing gap, out of scope).

`clinic_payables_*` and every new helper are re-checked in the review pass: anything that still names `dp.clinic_id` after 0050 is a bug, and dropping the column turns it into a runtime error instead of a leak.

## 4. Membership RPCs

| RPC | Change |
|---|---|
| `respond_clinic_invite` | Accept inserts into `clinic_memberships` (`on conflict do nothing`). `already_in_clinic` is gone; accepting a clinic you are already in is a no-op. Buying profiles still refused (0048). |
| `leave_clinic(p_clinic_id uuid)` | Deletes that one membership. Replaces the no-argument version (which the unreleased Leave button calls; it is updated in the same change). |
| `clinic_remove_doctor(p_doctor_id)` | Deletes the membership for the caller's clinic. |

Leaving or being removed **does not move any order**: the clinic keeps its orders, the doctor keeps theirs (they are the order's doctor). The doctor can no longer place orders for that clinic, and the clinic can no longer order for them.

## 5. Placing an order

### Server (`_submit_order_impl`, `submit_order`, `clinic_submit_order`, `edit_order`)

- `submit_order` gains `p_clinic_id uuid default null` and `p_private boolean default null`:
  - `p_clinic_id` set: the doctor must be a member (`clinic_memberships`), else `not_in_clinic`.
  - `p_private = true`: a private order.
  - Both null (an **old client** during the deploy gap): the doctor's only clinic if they have exactly one, else private. That is today's behaviour, so an old tab keeps working.
- `clinic_submit_order`: the clinic is always the caller's own.
- For a **clinic order**:
  - `p_doctor_work_location_id` is ignored; `doctor_work_location_id` stays null.
  - `work_location_snapshot` is built from the clinic in the **same shape as a location row** (`clinic_name`, `branch_name` null, `address` = `working_address`, `city`, `phone`, `clinic_identification_code`, `clinic_invoice_email`, plus `clinic_id`), so every reader of the snapshot (order header, lab sheet, queue filters, the edit diff) keeps working untouched.
  - The invoice recipient is **the clinic** (see §9 Q1): type `CLINIC`, snapshot `name` = `legal_name`, else `public_name`, `identification_code`, `address` = `legal_address`, else `working_address`, `city`, `invoice_email` = `invoice_email`, else `contact_email`.
  - A clinic with no address at all refuses with `clinic_address_missing` (§9 Q2).
- For a **private order**: exactly today's rules (a doctor-typed location, DOCTOR/CLINIC toggle).
- `edit_order`: an order **placed for a clinic** (`clinic_id` set and no doctor location) keeps its clinic snapshots (the location and recipient params are ignored). A private order, and an order from before 0050 (backfilled to the doctor's clinic but still carrying the doctor's own location), are edited as today.

No hidden location rows (unlike 0048's buying profile): the order carries the clinic's address directly, so no location query anywhere needs a new filter.

### Wizard (`OrderCreateWizard`, `SummaryRail`)

- **Doctor with at least one clinic:** a "For" choice at the top of the summary rail: each clinic, plus "Myself (private)". Default: the clinic of the doctor's most recent order (one query), else private. Saved in the draft.
  - **Clinic chosen:** the delivery and invoice lines become read-only "Delivered to / Invoice to" lines from the clinic (the 0048 `FixedLine` pattern, data from `my_clinic()`); the location picker and the DOCTOR/CLINIC toggle are hidden.
  - **Private:** today's picker and toggle.
- **Doctor with no clinic:** unchanged; no "For" choice.
- **Clinic admin:** the order is for their clinic; delivery and invoice are the fixed clinic lines (from the session's own clinic row). The doctor's typed locations are no longer shown or needed.
- **Edit page:** a clinic order shows the fixed lines (like a purchase); a private one, today's picker.

### The clinic's own details

Clinics cannot edit their details today (no page writes `clinics`). New **`/clinic/profile`** page (react-hook-form + zod, the house pattern): public name, legal name, identification code, legal address, **working (delivery) address**, city, contact phone and email, **invoice email**. Until the delivery address is filled, the clinic home shows a callout, and a clinic order is refused (`clinic_address_missing`) with that message in the wizard.

## 6. Doctor-facing membership UI

- Profile **Clinic card** becomes **Clinics**: one row per clinic with its own "Leave" (confirm dialog, `leave_clinic(id)`); the empty state is unchanged.
- Account menu and home subtitle: "Clinic: A", or "Clinics: A, B".
- `ClinicInvitesCard`: accepting while already in another clinic just works; the `alreadyInClinic` message goes.
- Doctor's order list and order header: the order's clinic is already visible through `work_location_snapshot.clinic_name`; a "Clinic" filter on the list is optional polish (§8 phase 3).

## 7. Realtime and query keys

- Publication: add `clinic_memberships` (INSERT only is delivered usefully; DELETE is not RLS-filtered by realtime, so leaving/removal shows on the next fetch, as with every delete today).
- Clinic admin's `orders` listener can filter `clinic_id=eq.<id>` (RLS already scopes it).
- `liveQueries.ts`: `clinic_memberships` → `['my-clinic']`, `['clinic-doctors']`, `['acting-doctor']`, `['clinic-order-count']`.

## 8. Build order

1. **0050 migration** (§2–§5 server side) + `docs/database.md` / CLAUDE.md notes, with a long `-- Verify:` block: every policy and RPC above under a doctor in two clinics, the admins of both, a doctor in none, and anon.
2. **Client:** types (`OrderRow.clinic_id`, `doctor_work_location_id: string | null`, `ClinicRow` new columns, membership rows), `useMyClinic` → list, wizard "For" + fixed lines, edit page, clinic profile page, membership UI, invites card, liveQueries, en/ka/ru strings.
3. **Review:** an adversarial pass over 0050 (the highest-risk change since 0039): two clinics × one doctor × each table and RPC; then a browser pass as a doctor in two clinics and both clinic admins.
4. Polish (optional): clinic filter on the doctor's order list; "member since" dates.

**Rollout:** apply 0050, then deploy the client. The `p_private` default keeps old tabs working in between. **Replays:** 0050 redefines functions first defined in 0013–0049; replaying any of those files after 0050 brings back an old definition that names the dropped column and fails at runtime. Re-run 0050 after replaying any earlier file (the 0039 rule).

## 9. Owner answers (2026-10-26)

1. **Invoice for a clinic order:** always the clinic. No DOCTOR/CLINIC toggle on clinic orders.
2. **A clinic without a delivery address:** clinic orders are refused (`clinic_address_missing`) until the clinic fills in its working address. No fallback to the legal address for delivery.
3. **After a doctor leaves:** the clinic keeps full rights on its orders (read, pay, edit, complete, cancel).
4. **Branches:** one address per clinic for now.
