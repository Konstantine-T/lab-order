-- ---------------------------------------------------------------------------
-- 0048 — a lab can order from another lab.
--
-- Trello hc61AYfA. Owner decisions: only an approved, active lab buys; the
-- patient is optional; the invoice always goes to the buying lab's LLC and
-- delivery always to its working address; the selling lab sees the customer
-- clearly as a lab; a purchase is a standalone order the original doctor
-- never sees; the buying lab reviews the seller like a doctor does.
--
-- THE APPROACH (owner: "A"). Everything on the ordering side keys on a
-- doctor: orders.doctor_id, patients.doctor_id, current_doctor_id(),
-- can_act_for_doctor(), the wizard, edit_order, complete/reopen, clarifications,
-- invoices, notifications, reviews. So each approved lab gets ONE hidden
-- "buying profile": a doctor_profiles row whose user_id is the lab owner and
-- whose new buyer_lab_id points at the lab. From then on current_doctor_id()
-- returns that row for the lab owner, and the existing doctor paths serve the
-- lab's purchases unchanged. What this file adds:
--
--   1. invoice_recipient_type gains 'LAB'.
--   2. doctor_profiles.buyer_lab_id (unique; null for every real doctor);
--      personal_id_number becomes optional for a buying profile only (CHECK);
--      a buying profile never belongs to a clinic (CHECK).
--      orders.buyer_lab_id (stamped by the submit RPC, frozen afterwards);
--      orders.patient_id becomes nullable, but only for a purchase (CHECK);
--      orders.patient_reference ("Case 145", <= 200 chars).
--   3. Write guards (triggers, NOT security definer, the 0037 / 0045 pattern:
--      current_user anon / authenticated = a client request, anything else =
--      definer code or the SQL editor):
--        * doctor_profiles.buyer_lab_id: no client may set or change it
--          (buyer_lab_id_read_only). Only ensure_lab_buyer_profile() writes
--          it; handle_new_user never sets it, so signup cannot make one.
--        * orders.buyer_lab_id: refused from a client, frozen for everyone
--          else (0043's placed_by_user_id freeze). And the invariant
--          "invoice recipient LAB <=> a purchase", for every writer: a doctor
--          or clinic can never pick LAB (also not by PATCHing the column), a
--          buying lab can never pick DOCTOR / CLINIC
--          (invoice_recipient_not_allowed).
--        * doctor_work_locations of a buying profile are read-only to clients
--          (buyer_location_read_only). The owner decided "delivery: the lab's
--          working address, no choice": the row is owned by the RPCs and
--          re-synced from the lab on every ensure / submit / edit.
--   4. ensure_lab_buyer_profile() → uuid. SECURITY DEFINER, authenticated
--      only. lab_cannot_buy unless the caller is a LAB_MAIN_ADMIN owning an
--      APPROVED_ACTIVE, is_active lab. Creates the profile once (a second
--      call, or two tabs at once, return the same id) and re-syncs its single
--      work location from the lab: clinic_name = legal_name (else
--      public_name), address = working_address (else legal_address), city,
--      clinic_identification_code = identification_code,
--      clinic_invoice_email = contact_email, phone = contact_phone, default.
--   5. _submit_order_impl (submit_order and clinic_submit_order are thin
--      wrappers and stay as 0032 left them) and edit_order, for a buying
--      profile:
--        * lab_cannot_buy unless the buying lab is still approved, active and
--          owned by the profile's user (submit only: an edit of an order in
--          flight stays allowed, like complete / reopen);
--        * cannot_order_from_own_lab when p_lab_id is the buying lab;
--        * no patient = p_patient null, or no existing_id and both names
--          blank. Allowed for a purchase; a real doctor (or a clinic acting
--          for one) gets patient_required. p_patient->>'reference' is trimmed,
--          blank = null, > 200 chars = patient_reference_too_long, and stored
--          in orders.patient_reference (purchases only, with or without a
--          patient). A named patient belongs to the buying profile like any
--          doctor's: the same matching, force_new and existing_id rules;
--        * p_doctor_work_location_id and p_invoice_recipient_type are ignored:
--          delivery is the profile's own (just re-synced) location, the
--          recipient is always LAB with
--            {type: LAB, lab_id, name: legal_name or public_name,
--             identification_code, address: legal_address, city,
--             invoice_email: contact_email};
--        * doctor_snapshot describes the buying lab:
--            {first_name: public_name, last_name: '', email: contact_email,
--             phone: contact_phone, is_lab: true, lab_id, legal_name,
--             identification_code}
--          so every screen printing "the doctor" from the snapshot (lists,
--          the seller's sheet, finance doctor_name, the notifications'
--          doctor param) prints the lab's name with no change;
--        * edit_order's order_edits snapshot also carries patient_reference
--          for a purchase, so the seller's diff can show a changed reference.
--      A real doctor or clinic sending 'LAB' gets invoice_recipient_not_allowed.
--      Everything else in both bodies is the runtime winner verbatim
--      (0032 for _submit_order_impl, 0031 for edit_order), checked against a
--      pg_get_functiondef dump of a database replayed through 0047.
--   6. find_matching_patient (0023): matches nothing when both names are
--      blank (a "no patient" order must not match a nameless patient row).
--   7. _lab_receivables_rows (0028; lab_receivables_list / _by_customer wrap
--      it unchanged): customer_type 'LAB', customer_id = buyer_lab_id,
--      customer_name = the recipient snapshot's name.
--   8. _lab_reviewer_display (0044): the buying lab's public_name for a
--      buying profile, never the owner's "First L.".
--   9. my_clinic_invites / respond_clinic_invite (0013): real doctor
--      profiles only. The lab owner sees no invites and accepting one says
--      not_a_doctor (instead of tripping the no-clinic CHECK).
--
-- ONE FILE, ONE PASS. `alter type ... add value` is at the top. Postgres 12+
-- accepts it inside the SQL editor's transaction, but the new value cannot be
-- USED before that transaction commits. Nothing below uses it as an enum
-- value at create time: the only places that mention 'LAB' are plpgsql bodies
-- (parsed, not planned, when created; they run in later transactions) and
-- comparisons on invoice_recipient_type::text. So unlike 0035 this file runs
-- in one go. Do not add a CHECK, index predicate, default or SQL-language
-- function that compares the enum to 'LAB' here; put it in a later file.
--
-- NOTIFICATIONS need no change (0043): the buying lab's owner is the order's
-- doctor_user, so it gets the doctor-side kinds; the seller's owner gets
-- new_order and the rest. _order_notification_params builds 'doctor' with
-- btrim(concat_ws(' ', first, last)), so last_name '' leaves no trailing
-- space. No new kind.
--
-- B1 AUDIT (a lab owner now has a current_doctor_id). Every policy and RPC
-- that keys on current_doctor_id / can_act_for_doctor / role 'DOCTOR':
--   PASS for the buying profile (its own rows only, as for a doctor):
--     orders_doctor_select/_update, patients_doctor_all,
--     patient_cases_doctor_all, order_drafts_author_all, order_answers /
--     order_edits / order_clarifications participants, order_files and the
--     order-files storage policies, lab_reviews_doctor_read,
--     doctor_profiles_self_select/_update (buyer_lab_id guarded, clinic_id
--     already guarded by 0013's trigger + the new CHECK); submit_order,
--     edit_order, find_matching_patient, complete_order, reopen_order,
--     cancel_order, answer_clarification, acknowledge_order_invoice,
--     get_order_chat, get_order_staff, save_lab_review, delete_lab_review.
--   READ ONLY: doctor_work_locations_doctor_all (select passes; writes
--     refused by the new trigger, see 3).
--   REFUSED: my_clinic_invites (empty), respond_clinic_invite (not_a_doctor),
--     clinic_submit_order for a buying profile (can_act_for_doctor has no
--     clinic to match), tg_notify_clinic_invite (role = 'DOCTOR' only).
--   NEVER MATCHES (keyed on dp.clinic_id, always null for a buying profile):
--     leave_clinic (a no-op), clinic_doctors, clinic_remove_doctor,
--     clinic_payables_*, doctor_in_admin_clinic, order_in_admin_clinic,
--     patient_in_admin_clinic and the orders/patients/work-location
--     clinic policies.
--   NO 'DOCTOR' role check blocks ordering; nothing had to be widened.
--     handle_new_user's 'DOCTOR' branch and its signup-role allow-list are
--     untouched (not redefined here).
-- B2 (DB side): every lab-side RPC scopes by the caller's own lab, never by
-- "any order I can see": record_payment, request_clarification,
-- request_doctor_input, replace_order_invoice (current_user_owns_lab of the
-- order's lab), reply_to_lab_review / report_lab_review (the review's lab),
-- _lab_receivables_rows (owns p_lab_id, then o.lab_id = p_lab_id), the
-- finance-lock RPCs, publish_lab_form and the set_lab_* RPCs (own lab). But
-- the "doctor OR lab" RLS policies (orders, order_answers, order_edits,
-- order_clarifications, order_files, storage) now show the lab owner its
-- purchases next to its incoming orders: lab screens must filter
-- .eq('lab_id', labId), purchase screens .eq('doctor_id', buyerProfileId).
--
-- Fully idempotent: add value / add column if not exists, constraints in DO
-- blocks that check pg_constraint, create or replace, drop trigger if exists.
-- ---------------------------------------------------------------------------


-- ── 1. The LAB invoice recipient ─────────────────────────────────────────
-- Must stay outside any DO block / function. Read the header before using
-- the value anywhere in this file.
alter type public.invoice_recipient_type add value if not exists 'LAB';


-- ── 2. Columns and constraints ───────────────────────────────────────────

-- 2a. The buying profile.
alter table public.doctor_profiles
  add column if not exists buyer_lab_id uuid unique references public.labs(id) on delete cascade;

comment on column public.doctor_profiles.buyer_lab_id is
  'Set on a lab''s hidden buying profile (0048): the lab that orders through it. Null for every real doctor. '
  'Written only by ensure_lab_buyer_profile(); clients are refused by trigger.';

-- Doctor-only fields become optional for a buying profile, never for a doctor.
alter table public.doctor_profiles alter column personal_id_number drop not null;

do $$ begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.doctor_profiles'::regclass
                    and conname = 'doctor_profiles_doctor_fields_check') then
    alter table public.doctor_profiles add constraint doctor_profiles_doctor_fields_check
      check (buyer_lab_id is not null or personal_id_number is not null);
  end if;
  -- A buying profile never belongs to a clinic.
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.doctor_profiles'::regclass
                    and conname = 'doctor_profiles_buyer_no_clinic') then
    alter table public.doctor_profiles add constraint doctor_profiles_buyer_no_clinic
      check (buyer_lab_id is null or clinic_id is null);
  end if;
end $$;

-- 2b. The buyer on the order, and the optional patient.
alter table public.orders
  add column if not exists buyer_lab_id uuid references public.labs(id),
  add column if not exists patient_reference text;

comment on column public.orders.buyer_lab_id is
  'The buying lab when a lab ordered this from another lab (0048), else null. Stamped by the submit RPC, '
  'frozen afterwards. Read it (or doctor_snapshot.is_lab) to tell a purchase from a doctor''s order.';
comment on column public.orders.patient_reference is
  'A buying lab''s free-text case reference ("Case 145"), with or without a patient (0048). Trimmed, '
  'at most 200 characters, null when blank. Never set for a doctor''s order.';

create index if not exists orders_buyer_lab_idx
  on public.orders (buyer_lab_id) where buyer_lab_id is not null;

alter table public.orders alter column patient_id drop not null;

do $$ begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.orders'::regclass
                    and conname = 'orders_patient_reference_length') then
    alter table public.orders add constraint orders_patient_reference_length
      check (patient_reference is null or char_length(patient_reference) <= 200);
  end if;
  -- A doctor's order still names a patient; only a purchase may not.
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.orders'::regclass
                    and conname = 'orders_patient_required_for_doctors') then
    alter table public.orders add constraint orders_patient_required_for_doctors
      check (patient_id is not null or buyer_lab_id is not null);
  end if;
end $$;


-- ── 3. Write guards ──────────────────────────────────────────────────────
-- None of these is SECURITY DEFINER: current_user must stay the caller's
-- role, so a client request (anon / authenticated) is told apart from a
-- definer RPC or the SQL editor.

-- 3a. doctor_profiles.buyer_lab_id: never from a client.
create or replace function public.tg_doctor_profiles_buyer_lab_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated')
     and (case when tg_op = 'INSERT' then new.buyer_lab_id is not null
               else new.buyer_lab_id is distinct from old.buyer_lab_id end) then
    raise exception 'buyer_lab_id_read_only' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists doctor_profiles_buyer_lab_guard on public.doctor_profiles;
create trigger doctor_profiles_buyer_lab_guard
  before insert or update of buyer_lab_id on public.doctor_profiles
  for each row execute function public.tg_doctor_profiles_buyer_lab_guard();

-- 3b. orders.buyer_lab_id: refused from a client, frozen for everyone else;
-- and a LAB recipient exactly on a purchase, whoever writes.
create or replace function public.tg_orders_buyer_lab_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_client boolean := current_user in ('anon', 'authenticated');
begin
  if tg_op = 'INSERT' then
    if v_client and new.buyer_lab_id is not null then
      raise exception 'buyer_lab_id_read_only' using errcode = '42501';
    end if;
  elsif new.buyer_lab_id is distinct from old.buyer_lab_id then
    if v_client then
      raise exception 'buyer_lab_id_read_only' using errcode = '42501';
    end if;
    -- Definer code and the SQL editor: frozen, as 0043 freezes placed_by_user_id.
    new.buyer_lab_id := old.buyer_lab_id;
  end if;

  -- ::text, never the enum literal: see the header (one-pass file).
  if (new.invoice_recipient_type::text = 'LAB') is distinct from (new.buyer_lab_id is not null) then
    raise exception 'invoice_recipient_not_allowed' using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists orders_buyer_lab_guard on public.orders;
create trigger orders_buyer_lab_guard
  before insert or update of buyer_lab_id, invoice_recipient_type on public.orders
  for each row execute function public.tg_orders_buyer_lab_guard();

-- 3c. A buying profile's delivery address is the RPCs' to write.
-- The lookup runs as the caller, under doctor_profiles' RLS: the caller sees
-- its own profile, which is the only one its location policy lets it write.
create or replace function public.tg_doctor_work_locations_buyer_read_only()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated')
     and exists (
       select 1 from public.doctor_profiles dp
        where dp.buyer_lab_id is not null
          and dp.id in (case when tg_op = 'DELETE' then old.doctor_id else new.doctor_id end,
                        case when tg_op = 'UPDATE' then old.doctor_id end)
     ) then
    raise exception 'buyer_location_read_only' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

drop trigger if exists doctor_work_locations_buyer_read_only on public.doctor_work_locations;
create trigger doctor_work_locations_buyer_read_only
  before insert or update or delete on public.doctor_work_locations
  for each row execute function public.tg_doctor_work_locations_buyer_read_only();

revoke all on function public.tg_doctor_profiles_buyer_lab_guard()        from public, anon, authenticated;
revoke all on function public.tg_orders_buyer_lab_guard()                 from public, anon, authenticated;
revoke all on function public.tg_doctor_work_locations_buyer_read_only()  from public, anon, authenticated;


-- ── 4. Helpers (internal, not callable by clients) ───────────────────────

-- The buying profile's one work location, (re)written from its lab.
-- Locks the profile row, so two tabs syncing at once cannot both insert.
create or replace function public._sync_lab_buyer_location(p_profile_id uuid)
returns public.doctor_work_locations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lab  public.labs;
  v_loc  public.doctor_work_locations;
  v_name text;
  v_addr text;
  v_city text;
begin
  perform 1 from public.doctor_profiles where id = p_profile_id for update;
  select l.* into v_lab
    from public.doctor_profiles dp
    join public.labs l on l.id = dp.buyer_lab_id
   where dp.id = p_profile_id;
  if v_lab.id is null then
    raise exception 'lab_cannot_buy' using errcode = '42501';
  end if;

  v_name := coalesce(nullif(btrim(v_lab.legal_name), ''), v_lab.public_name);
  v_addr := coalesce(nullif(btrim(v_lab.working_address), ''),
                     nullif(btrim(v_lab.legal_address), ''), '');
  v_city := coalesce(btrim(v_lab.city), '');

  -- The row to keep: the live default, else the newest live one, else any.
  select * into v_loc from public.doctor_work_locations
   where doctor_id = p_profile_id
   order by (archived_at is null and is_default) desc, (archived_at is null) desc, created_at desc, id
   limit 1;

  if v_loc.id is null then
    insert into public.doctor_work_locations (
      doctor_id, clinic_name, branch_name, address, city,
      clinic_identification_code, clinic_invoice_email, phone, is_default
    ) values (
      p_profile_id, v_name, null, v_addr, v_city,
      v_lab.identification_code, v_lab.contact_email, v_lab.contact_phone, true
    )
    returning * into v_loc;
    return v_loc;
  end if;

  -- Exactly one: retire any other row first (frees the one-default index).
  update public.doctor_work_locations
     set archived_at = coalesce(archived_at, now()),
         is_default  = false
   where doctor_id = p_profile_id
     and id <> v_loc.id
     and (archived_at is null or is_default);

  -- Only write when something changed (this runs on every marketplace visit).
  update public.doctor_work_locations
     set clinic_name                = v_name,
         branch_name                = null,
         address                    = v_addr,
         city                       = v_city,
         clinic_identification_code = v_lab.identification_code,
         clinic_invoice_email       = v_lab.contact_email,
         phone                      = v_lab.contact_phone,
         is_default                 = true,
         archived_at                = null
   where id = v_loc.id
     and (clinic_name, branch_name, address, city, clinic_identification_code,
          clinic_invoice_email, phone, is_default, archived_at)
         is distinct from
         (v_name, null::text, v_addr, v_city, v_lab.identification_code,
          v_lab.contact_email, v_lab.contact_phone, true, null::timestamptz);

  select * into v_loc from public.doctor_work_locations where id = v_loc.id;
  return v_loc;
end $$;

-- The LAB invoice recipient (A3), from the lab as it is now.
create or replace function public._lab_buyer_recipient_snapshot(p_lab public.labs)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'type',                'LAB',
    'lab_id',              p_lab.id,
    'name',                coalesce(nullif(btrim(p_lab.legal_name), ''), p_lab.public_name),
    'identification_code', p_lab.identification_code,
    'address',             p_lab.legal_address,
    'city',                p_lab.city,
    'invoice_email',       p_lab.contact_email
  );
$$;

revoke all on function public._sync_lab_buyer_location(uuid)             from public, anon, authenticated;
revoke all on function public._lab_buyer_recipient_snapshot(public.labs) from public, anon, authenticated;


-- ── 5. ensure_lab_buyer_profile() ────────────────────────────────────────
-- Called by the client when the lab opens its marketplace or starts an
-- order. The only creator of a buying profile.
create or replace function public.ensure_lab_buyer_profile()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_profile public.doctor_profiles;
  v_lab     public.labs;
begin
  if v_uid is null or coalesce(public.current_user_role()::text, '') <> 'LAB_MAIN_ADMIN' then
    raise exception 'lab_cannot_buy' using errcode = '42501';
  end if;

  select * into v_profile from public.doctor_profiles where user_id = v_uid;
  -- A personal doctor profile on a lab account (only possible by hand) is
  -- never turned into a buyer: user_id is unique, so there is no room for one.
  if v_profile.id is not null and v_profile.buyer_lab_id is null then
    raise exception 'lab_cannot_buy' using errcode = '42501';
  end if;

  if v_profile.id is not null then
    -- Still the owner of the lab it buys for (ownership can move by hand).
    select * into v_lab from public.labs
     where id = v_profile.buyer_lab_id and owner_user_id = v_uid;
  else
    -- Signup gives an owner one lab; should one ever own several, the first.
    select * into v_lab from public.labs
     where owner_user_id = v_uid
     order by created_at, id
     limit 1;
  end if;

  if v_lab.id is null or v_lab.approval_status <> 'APPROVED_ACTIVE' or not v_lab.is_active then
    raise exception 'lab_cannot_buy' using errcode = '42501';
  end if;

  if v_profile.id is null then
    -- Two tabs at once: the second waits on the first's row, then does nothing.
    insert into public.doctor_profiles (user_id, buyer_lab_id)
    values (v_uid, v_lab.id)
    on conflict do nothing;
    select * into v_profile from public.doctor_profiles where user_id = v_uid;
    -- A conflict on buyer_lab_id (another account already buys for this lab).
    if v_profile.id is null or v_profile.buyer_lab_id is distinct from v_lab.id then
      raise exception 'lab_cannot_buy' using errcode = '42501';
    end if;
  end if;

  perform public._sync_lab_buyer_location(v_profile.id);
  return v_profile.id;
end $$;

-- Supabase's default privileges grant EXECUTE to anon (the 0039 lesson).
revoke all on function public.ensure_lab_buyer_profile() from public, anon;
grant execute on function public.ensure_lab_buyer_profile() to authenticated;


-- ── 6. _submit_order_impl (0032 verbatim + the buying profile) ───────────
-- submit_order and clinic_submit_order are untouched wrappers around it.
CREATE OR REPLACE FUNCTION public._submit_order_impl(p_doctor_id uuid, p_lab_id uuid, p_lab_service_id uuid, p_doctor_work_location_id uuid, p_patient jsonb, p_lab_form_version_id uuid, p_invoice_recipient_type text, p_requested_due_date date, p_rush_type text, p_rush_value numeric, p_answers jsonb, p_generated_total numeric, p_continue_case_id uuid, p_parent_order_id uuid, p_continues_order_id uuid, p_requested_due_time time DEFAULT NULL::time)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_doctor_id          uuid := p_doctor_id;
  v_lab                public.labs;
  v_service            public.lab_services;
  v_loc                public.doctor_work_locations;
  v_user_row           public.users;
  v_patient_id         uuid;
  v_existing_pid       uuid;
  v_order_id           uuid;
  v_recipient_snapshot jsonb;
  v_doctor_snapshot    jsonb;
  -- 0048: a lab's buying profile
  v_buyer_lab_id       uuid;
  v_buyer              public.labs;
  v_no_patient         boolean;
  v_reference          text;
  v_recipient_type     text := p_invoice_recipient_type;
begin
  -- The acting doctor's user row (for the doctor / recipient snapshots).
  select u.* into v_user_row
    from public.users u
    join public.doctor_profiles dp on dp.user_id = u.id
   where dp.id = v_doctor_id;
  if not found then
    raise exception 'Doctor not found';
  end if;

  -- 0048: a buying profile orders for its lab, which must still be able to
  -- buy, and never from itself. Nobody else may name LAB as the recipient.
  select dp.buyer_lab_id into v_buyer_lab_id from public.doctor_profiles dp where dp.id = v_doctor_id;
  if v_buyer_lab_id is not null then
    select * into v_buyer from public.labs where id = v_buyer_lab_id;
    if not found or v_buyer.owner_user_id <> v_user_row.id
       or v_buyer.approval_status <> 'APPROVED_ACTIVE' or not v_buyer.is_active then
      raise exception 'lab_cannot_buy' using errcode = '42501';
    end if;
    if p_lab_id = v_buyer_lab_id then
      raise exception 'cannot_order_from_own_lab' using errcode = '22023';
    end if;
  elsif p_invoice_recipient_type = 'LAB' then
    raise exception 'invoice_recipient_not_allowed' using errcode = '22023';
  end if;

  select * into v_lab from public.labs where id = p_lab_id;
  if not found or v_lab.approval_status <> 'APPROVED_ACTIVE' or not v_lab.is_active then
    raise exception 'Lab is not available for orders';
  end if;

  select * into v_service from public.lab_services where id = p_lab_service_id;
  if not found or v_service.lab_id <> v_lab.id or not v_service.is_active then
    raise exception 'Service is not available';
  end if;

  if v_buyer_lab_id is not null then
    -- 0048: delivery is always the buying lab's own address, re-synced now;
    -- p_doctor_work_location_id is ignored.
    v_loc := public._sync_lab_buyer_location(v_doctor_id);
  else
    select * into v_loc from public.doctor_work_locations where id = p_doctor_work_location_id;
    if not found or v_loc.doctor_id <> v_doctor_id or v_loc.archived_at is not null then
      raise exception 'Work location is not available';
    end if;
  end if;

  if not exists (
    select 1 from public.lab_form_versions v
    join public.lab_forms f on f.id = v.lab_form_id
    where v.id = p_lab_form_version_id
      and f.lab_id = v_lab.id
      and f.status = 'PUBLISHED'
  ) then
    raise exception 'Form version not found or not published';
  end if;

  if p_continues_order_id is not null then
    if not exists (
      select 1 from public.orders o
      where o.id = p_continues_order_id
        and o.doctor_id = v_doctor_id
        and o.lab_id = p_lab_id
    ) then
      raise exception 'Continued order not found or not in the same lab';
    end if;
  end if;

  v_existing_pid := nullif(p_patient->>'existing_id', '')::uuid;
  -- 0048: "no patient" = nothing to look up and nothing to name.
  v_no_patient := v_existing_pid is null
                  and public.patient_name_key(p_patient->>'first_name') = ''
                  and public.patient_name_key(p_patient->>'last_name')  = '';
  if v_no_patient then
    if v_buyer_lab_id is null then
      raise exception 'patient_required' using errcode = '22023';
    end if;
    v_patient_id := null;
  elsif v_existing_pid is not null then
    select id into v_patient_id from public.patients
      where id = v_existing_pid and doctor_id = v_doctor_id;
    if v_patient_id is null then
      raise exception 'Patient not found';
    end if;
  elsif coalesce((p_patient->>'force_new')::boolean, false) then
    -- The doctor was shown the patient this name already matches and chose
    -- "create a new one" anyway. Two different people really do share a name,
    -- and without this branch that choice was unrepresentable: the client sent
    -- no existing_id, the match below ran regardless, and the order landed on
    -- the first patient of that name. The doctor's answer has to beat the
    -- heuristic that asked the question.
    insert into public.patients (doctor_id, first_name, last_name, date_of_birth, gender)
    values (
      v_doctor_id,
      public.patient_name_tidy(p_patient->>'first_name'),
      public.patient_name_tidy(p_patient->>'last_name'),
      nullif(p_patient->>'date_of_birth', '')::date,
      nullif(p_patient->>'gender', '')
    )
    returning id into v_patient_id;
  else
    -- Normalized on BOTH sides, so an already-stored padded name still matches.
    select id into v_patient_id
    from public.patients
    where doctor_id = v_doctor_id
      and public.patient_name_key(first_name) = public.patient_name_key(p_patient->>'first_name')
      and public.patient_name_key(last_name)  = public.patient_name_key(p_patient->>'last_name')
    order by created_at asc
    limit 1;

    if not found then
      -- Store the tidy form (case preserved) so future matches are exact and
      -- the record doesn't carry the doctor's stray spaces forever.
      insert into public.patients (doctor_id, first_name, last_name, date_of_birth, gender)
      values (
        v_doctor_id,
        public.patient_name_tidy(p_patient->>'first_name'),
        public.patient_name_tidy(p_patient->>'last_name'),
        nullif(p_patient->>'date_of_birth', '')::date,
        nullif(p_patient->>'gender', '')
      )
      returning id into v_patient_id;
    end if;
  end if;

  -- 0048: the buying lab's own case reference, with or without a patient.
  if v_buyer_lab_id is not null then
    v_reference := nullif(regexp_replace(coalesce(p_patient->>'reference', ''), '^\s+|\s+$', '', 'g'), '');
    if char_length(v_reference) > 200 then
      raise exception 'patient_reference_too_long' using errcode = '22023';
    end if;
  end if;

  if v_buyer_lab_id is not null then
    -- 0048: always the buying lab's LLC, whatever the client sent.
    v_recipient_type     := 'LAB';
    v_recipient_snapshot := public._lab_buyer_recipient_snapshot(v_buyer);
  elsif p_invoice_recipient_type = 'DOCTOR' then
    v_recipient_snapshot := jsonb_build_object(
      'type', 'DOCTOR',
      'name', v_user_row.first_name || ' ' || v_user_row.last_name,
      'email', v_user_row.email,
      'phone', v_user_row.phone
    );
  else
    v_recipient_snapshot := jsonb_build_object(
      'type', 'CLINIC',
      'name', v_loc.clinic_name,
      'branch', v_loc.branch_name,
      'address', v_loc.address,
      'city', v_loc.city,
      'identification_code', v_loc.clinic_identification_code,
      'invoice_email', v_loc.clinic_invoice_email
    );
  end if;

  if v_buyer_lab_id is not null then
    -- 0048: "the doctor" of a purchase is the buying lab.
    v_doctor_snapshot := jsonb_build_object(
      'first_name',          v_buyer.public_name,
      'last_name',           '',
      'email',               v_buyer.contact_email,
      'phone',               v_buyer.contact_phone,
      'is_lab',              true,
      'lab_id',              v_buyer.id,
      'legal_name',          v_buyer.legal_name,
      'identification_code', v_buyer.identification_code
    );
  else
    v_doctor_snapshot := jsonb_build_object(
      'first_name', v_user_row.first_name,
      'last_name',  v_user_row.last_name,
      'email',      v_user_row.email,
      'phone',      v_user_row.phone
    );
  end if;

  insert into public.orders (
    doctor_id, lab_id, doctor_work_location_id, patient_id, patient_case_id, parent_order_id,
    lab_service_id, lab_form_version_id,
    status, requested_due_date, invoice_recipient_type,
    generated_total, rush_type, rush_value,
    work_location_snapshot, lab_snapshot, service_snapshot, invoice_recipient_snapshot,
    doctor_snapshot, continues_order_id, requested_due_time,
    buyer_lab_id, patient_reference
  ) values (
    v_doctor_id, p_lab_id, v_loc.id, v_patient_id, p_continue_case_id, p_parent_order_id,
    p_lab_service_id, p_lab_form_version_id,
    'SUBMITTED', p_requested_due_date, v_recipient_type::public.invoice_recipient_type,
    p_generated_total, coalesce(p_rush_type, 'NONE')::public.rush_type, p_rush_value,
    to_jsonb(v_loc), to_jsonb(v_lab), to_jsonb(v_service), v_recipient_snapshot,
    v_doctor_snapshot, p_continues_order_id, p_requested_due_time,
    v_buyer_lab_id, v_reference
  ) returning id into v_order_id;

  insert into public.order_answers (order_id, field_code, answer_json)
  select v_order_id, k, v from jsonb_each(coalesce(p_answers, '{}'::jsonb)) as t(k, v);

  return v_order_id;
end $function$;

-- It trusts p_doctor_id; the wrappers authorize. Never callable by a client
-- (0031's note: the revoke travels with every definition).
revoke all on function public._submit_order_impl(
  uuid, uuid, uuid, uuid, jsonb, uuid, text, date, text, numeric, jsonb, numeric, uuid, uuid, uuid, time
) from public, anon, authenticated;


-- ── 7. edit_order (0031 verbatim + the buying profile) ───────────────────
CREATE OR REPLACE FUNCTION public.edit_order(p_order_id uuid, p_patient jsonb, p_doctor_work_location_id uuid, p_invoice_recipient_type text, p_answers jsonb, p_generated_total numeric, p_reason_code text, p_comment text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_doctor_id          uuid;
  v_doctor_user        public.users;
  v_order              public.orders;
  v_loc                public.doctor_work_locations;
  v_existing_pid       uuid;
  v_patient_id         uuid;
  v_recipient_snapshot jsonb;
  v_snapshot           jsonb;
  v_comment            text;
  -- 0048: a lab's purchase
  v_buyer              public.labs;
  v_no_patient         boolean;
  v_reference          text;
  v_recipient_type     text := p_invoice_recipient_type;
begin
  -- Load the order, then authorize: the order's doctor, or a clinic admin the
  -- doctor is linked to.
  select * into v_order from public.orders where id = p_order_id;
  if not found then
    raise exception 'Order not found';
  end if;
  if not public.can_act_for_doctor(v_order.doctor_id) then
    raise exception 'You are not allowed to edit this order';
  end if;
  v_doctor_id := v_order.doctor_id;

  select u.* into v_doctor_user
    from public.users u
    join public.doctor_profiles dp on dp.user_id = u.id
   where dp.id = v_doctor_id;

  if v_order.status in ('COMPLETED','CANCELLED') then
    raise exception 'This order can no longer be edited';
  end if;

  if p_reason_code not in (
    'CORRECTION','UNFORESEEN_LAB_INSTRUCTION','PATIENT_REASON',
    'CONSTRUCTION_DEFECT','MY_MISTAKE','UNFORESEEN_EVENT'
  ) then
    raise exception 'Invalid reason code';
  end if;

  v_comment := coalesce(nullif(trim(p_comment), ''), null);
  if p_reason_code = 'UNFORESEEN_EVENT' and v_comment is null then
    raise exception 'A comment is required for this reason';
  end if;

  -- 0048: a purchase always invoices its buying lab; nobody else may name LAB.
  if v_order.buyer_lab_id is not null then
    select * into v_buyer from public.labs where id = v_order.buyer_lab_id;
  elsif p_invoice_recipient_type = 'LAB' then
    raise exception 'invoice_recipient_not_allowed' using errcode = '22023';
  end if;

  if v_order.buyer_lab_id is not null then
    -- 0048: delivery is always the buying lab's own address, re-synced now;
    -- p_doctor_work_location_id is ignored.
    v_loc := public._sync_lab_buyer_location(v_doctor_id);
  else
    select * into v_loc from public.doctor_work_locations
      where id = p_doctor_work_location_id;
    if not found or v_loc.doctor_id <> v_doctor_id or v_loc.archived_at is not null then
      raise exception 'Work location is not available';
    end if;
  end if;

  v_snapshot := jsonb_build_object(
    'patient', (
      select jsonb_build_object(
        'id', p.id,
        'first_name', p.first_name,
        'last_name', p.last_name,
        'date_of_birth', p.date_of_birth,
        'gender', p.gender
      )
      from public.patients p where p.id = v_order.patient_id
    ),
    'doctor_work_location_id', v_order.doctor_work_location_id,
    'work_location_snapshot', v_order.work_location_snapshot,
    'invoice_recipient_type', v_order.invoice_recipient_type,
    'invoice_recipient_snapshot', v_order.invoice_recipient_snapshot,
    'requested_due_date', v_order.requested_due_date,
    'rush_type', v_order.rush_type,
    'rush_value', v_order.rush_value,
    'generated_total', v_order.generated_total,
    'answers', coalesce(
      (select jsonb_object_agg(field_code, answer_json)
       from public.order_answers where order_id = p_order_id),
      '{}'::jsonb
    )
  );
  if v_order.buyer_lab_id is not null then
    v_snapshot := v_snapshot || jsonb_build_object('patient_reference', v_order.patient_reference);
  end if;

  v_existing_pid := nullif(p_patient->>'existing_id', '')::uuid;
  -- 0048: "no patient" = nothing to look up and nothing to name.
  v_no_patient := v_existing_pid is null
                  and public.patient_name_key(p_patient->>'first_name') = ''
                  and public.patient_name_key(p_patient->>'last_name')  = '';
  if v_no_patient then
    if v_order.buyer_lab_id is null then
      raise exception 'patient_required' using errcode = '22023';
    end if;
    v_patient_id := null;
  elsif v_existing_pid is not null then
    select id into v_patient_id from public.patients
      where id = v_existing_pid and doctor_id = v_doctor_id;
    if v_patient_id is null then
      raise exception 'Patient not found';
    end if;
  elsif coalesce((p_patient->>'force_new')::boolean, false) then
    -- The doctor was shown the patient this name already matches and chose
    -- "create a new one" anyway. Two different people really do share a name,
    -- and without this branch that choice was unrepresentable: the client sent
    -- no existing_id, the match below ran regardless, and the order landed on
    -- the first patient of that name. The doctor's answer has to beat the
    -- heuristic that asked the question.
    insert into public.patients (doctor_id, first_name, last_name, date_of_birth, gender)
    values (
      v_doctor_id,
      public.patient_name_tidy(p_patient->>'first_name'),
      public.patient_name_tidy(p_patient->>'last_name'),
      nullif(p_patient->>'date_of_birth', '')::date,
      nullif(p_patient->>'gender', '')
    )
    returning id into v_patient_id;
  else
    select id into v_patient_id
    from public.patients
    where doctor_id = v_doctor_id
      and public.patient_name_key(first_name) = public.patient_name_key(p_patient->>'first_name')
      and public.patient_name_key(last_name)  = public.patient_name_key(p_patient->>'last_name')
    order by created_at asc
    limit 1;

    if not found then
      insert into public.patients (doctor_id, first_name, last_name, date_of_birth, gender)
      values (
        v_doctor_id,
        public.patient_name_tidy(p_patient->>'first_name'),
        public.patient_name_tidy(p_patient->>'last_name'),
        nullif(p_patient->>'date_of_birth', '')::date,
        nullif(p_patient->>'gender', '')
      )
      returning id into v_patient_id;
    end if;
  end if;

  -- 0048: the buying lab's own case reference, with or without a patient.
  if v_order.buyer_lab_id is not null then
    v_reference := nullif(regexp_replace(coalesce(p_patient->>'reference', ''), '^\s+|\s+$', '', 'g'), '');
    if char_length(v_reference) > 200 then
      raise exception 'patient_reference_too_long' using errcode = '22023';
    end if;
  end if;

  if v_order.buyer_lab_id is not null then
    -- 0048: always the buying lab's LLC, as it is now, whatever the client sent.
    v_recipient_type     := 'LAB';
    v_recipient_snapshot := public._lab_buyer_recipient_snapshot(v_buyer);
  elsif p_invoice_recipient_type = 'DOCTOR' then
    v_recipient_snapshot := jsonb_build_object(
      'type', 'DOCTOR',
      'name', v_doctor_user.first_name || ' ' || v_doctor_user.last_name,
      'email', v_doctor_user.email,
      'phone', v_doctor_user.phone
    );
  else
    v_recipient_snapshot := jsonb_build_object(
      'type', 'CLINIC',
      'name', v_loc.clinic_name,
      'branch', v_loc.branch_name,
      'address', v_loc.address,
      'city', v_loc.city,
      'identification_code', v_loc.clinic_identification_code,
      'invoice_email', v_loc.clinic_invoice_email
    );
  end if;

  update public.orders set
    patient_id                 = v_patient_id,
    doctor_work_location_id    = v_loc.id,
    invoice_recipient_type     = v_recipient_type::public.invoice_recipient_type,
    work_location_snapshot     = to_jsonb(v_loc),
    invoice_recipient_snapshot = v_recipient_snapshot,
    patient_reference          = case when v_order.buyer_lab_id is not null
                                      then v_reference else patient_reference end,
    generated_total            = p_generated_total,
    has_unreviewed_edits       = true,
    edit_count                 = edit_count + 1,
    last_edited_at             = now()
  where id = p_order_id;

  insert into public.order_answers (order_id, field_code, answer_json)
  select p_order_id, k, v from jsonb_each(coalesce(p_answers, '{}'::jsonb)) as t(k, v)
  on conflict (order_id, field_code) do update set answer_json = excluded.answer_json;

  delete from public.order_answers
  where order_id = p_order_id
    and field_code not in (
      select jsonb_object_keys(coalesce(p_answers, '{}'::jsonb))
    );

  insert into public.order_edits (order_id, editor_user_id, reason_code, comment, snapshot_json)
  values (p_order_id, auth.uid(), p_reason_code, v_comment, v_snapshot);

  return p_order_id;
end $function$;

grant execute on function public.edit_order(uuid, jsonb, uuid, text, jsonb, numeric, text, text) to authenticated;


-- ── 8. find_matching_patient (0023 + skip when no name) ──────────────────
-- Same 5-arg signature and grant. A buying profile's patients are its own,
-- found through current_doctor_id() like a doctor's.
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
  -- 0048: no name at all ("no patient" on a lab's order) matches nothing.
  select p.id, p.first_name, p.last_name, p.date_of_birth, p.gender, p.created_at
  from public.patients p
  where p.doctor_id = coalesce(p_doctor_id, public.current_doctor_id())
    and public.can_act_for_doctor(coalesce(p_doctor_id, public.current_doctor_id()))
    and (public.patient_name_key(p_first) <> '' or public.patient_name_key(p_last) <> '')
    and public.patient_name_key(p.first_name) = public.patient_name_key(p_first)
    and public.patient_name_key(p.last_name)  = public.patient_name_key(p_last)
  order by p.created_at asc
  limit 1;
$$;

grant execute on function public.find_matching_patient(text, text, date, text, uuid)
  to authenticated;


-- ── 9. Lab receivables: the LAB customer (0028 + one branch) ─────────────
-- lab_receivables_list and lab_receivables_by_customer only wrap this.
CREATE OR REPLACE FUNCTION public._lab_receivables_rows(p_lab_id uuid, p_search text DEFAULT NULL::text, p_recipient_type text DEFAULT NULL::text, p_customer_id text DEFAULT NULL::text, p_statuses text[] DEFAULT NULL::text[], p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_overdue_only boolean DEFAULT false, p_min_amount numeric DEFAULT NULL::numeric, p_max_amount numeric DEFAULT NULL::numeric)
 RETURNS TABLE(order_id uuid, order_code text, order_status text, customer_type text, customer_id text, customer_name text, doctor_name text, service_name text, final_total numeric, paid_total numeric, outstanding numeric, payment_status text, confirmed_due_date date, requested_due_date date, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- Prefer table columns over the OUT-parameter names on any ambiguity.
#variable_conflict use_column
begin
  if not public.current_user_owns_lab(p_lab_id) then
    raise exception 'not_your_lab';
  end if;

  return query
  with base as (
    select
      o.id                                        as order_id,
      o.order_code                                as order_code,
      o.status::text                              as order_status,
      o.invoice_recipient_type::text              as customer_type,
      case when o.invoice_recipient_type = 'DOCTOR'
           then o.doctor_id::text
           -- 0048: a buying lab is one customer, keyed by its lab id.
           when o.invoice_recipient_type::text = 'LAB'
           then coalesce(o.buyer_lab_id::text,
                         nullif(o.invoice_recipient_snapshot->>'lab_id', ''),
                         'unknown')
           else coalesce(
                  nullif(o.invoice_recipient_snapshot->>'identification_code', ''),
                  o.invoice_recipient_snapshot->>'name',
                  'unknown')
      end                                         as customer_id,
      coalesce(
        nullif(o.invoice_recipient_snapshot->>'name', ''),
        nullif(trim(coalesce(o.doctor_snapshot->>'first_name','') || ' ' ||
                    coalesce(o.doctor_snapshot->>'last_name','')), ''),
        '—')                                      as customer_name,
      nullif(trim(coalesce(o.doctor_snapshot->>'first_name','') || ' ' ||
                  coalesce(o.doctor_snapshot->>'last_name','')), '')
                                                  as doctor_name,
      coalesce(o.service_snapshot->>'name', '')   as service_name,
      o.final_total                               as final_total,
      o.paid_total                                as paid_total,
      greatest(o.final_total - o.paid_total, 0)   as outstanding,
      case when o.paid_total <= 0                 then 'UNPAID'
           when o.paid_total < o.final_total      then 'PARTIALLY_PAID'
           else 'PAID' end                        as payment_status,
      o.confirmed_due_date                        as confirmed_due_date,
      o.requested_due_date                        as requested_due_date,
      o.created_at                                as created_at
    from public.orders o
    where o.lab_id = p_lab_id
      and o.status <> 'CANCELLED'
      and o.final_total is not null
  )
  select b.order_id, b.order_code, b.order_status, b.customer_type, b.customer_id,
         b.customer_name, b.doctor_name, b.service_name, b.final_total, b.paid_total,
         b.outstanding, b.payment_status, b.confirmed_due_date, b.requested_due_date,
         b.created_at
  from base b
  where (p_search is null or p_search = ''
         or b.order_code ilike '%' || p_search || '%'
         or b.customer_name ilike '%' || p_search || '%')
    and (p_recipient_type is null or b.customer_type = p_recipient_type)
    and (p_customer_id is null or b.customer_id = p_customer_id)
    and (p_statuses is null or b.payment_status = any(p_statuses))
    and (p_date_from is null or b.created_at::date >= p_date_from)
    and (p_date_to is null or b.created_at::date <= p_date_to)
    and (not coalesce(p_overdue_only, false)
         or (b.confirmed_due_date is not null
             and b.confirmed_due_date < current_date
             and b.outstanding > 0))
    and (p_min_amount is null or b.outstanding >= p_min_amount)
    and (p_max_amount is null or b.outstanding <= p_max_amount);
end $function$;


-- ── 10. Reviews: a buying lab signs with its public name (0044) ──────────
create or replace function public._lab_reviewer_display(p_doctor_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  -- "Irakli K." for a doctor; the lab's public name for a buying profile
  -- (never the owner's own name). '' when there is nothing to show.
  select coalesce((
    select case
             when dp.buyer_lab_id is not null then
               (select btrim(l.public_name) from public.labs l where l.id = dp.buyer_lab_id)
             else
               btrim(concat_ws(' ',
                 nullif(btrim(u.first_name), ''),
                 case when nullif(btrim(u.last_name), '') is not null
                      then left(btrim(u.last_name), 1) || '.' end))
           end
      from public.doctor_profiles dp
      join public.users u on u.id = dp.user_id
     where dp.id = p_doctor_id
  ), '');
$$;

revoke all on function public._lab_reviewer_display(uuid) from public, anon, authenticated;


-- ── 11. Clinic invites are for real doctors only (0013) ──────────────────

-- Doctor's own pending invites, with the inviting clinic's name (doctors have no
-- direct read on the clinics table).
-- 0048: a lab owner (whose buying profile is not a doctor) sees none.
create or replace function public.my_clinic_invites()
returns table (invite_id uuid, clinic_id uuid, clinic_name text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select i.id, i.clinic_id, c.public_name, i.created_at
  from public.clinic_doctor_invites i
  join public.clinics c on c.id = i.clinic_id
  where lower(i.doctor_email) = lower(public.current_user_email())
    and i.status = 'PENDING'
    and exists (select 1 from public.doctor_profiles dp
                 where dp.user_id = auth.uid() and dp.buyer_lab_id is null)
  order by i.created_at desc;
$$;

-- Doctor responds to an invite. Runs AS THE DOCTOR (auth.uid()) — the consent gate.
-- 0048: a buying profile is not a doctor (not_a_doctor), so a lab can never
-- join a clinic.
create or replace function public.respond_clinic_invite(p_invite_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.clinic_doctor_invites%rowtype;
  v_doctor_id uuid;
  v_email text := public.current_user_email();  -- trusted (JWT), already lowercased
  v_updated int;
begin
  select id into v_doctor_id from public.doctor_profiles
   where user_id = auth.uid() and buyer_lab_id is null;
  if v_doctor_id is null then
    raise exception 'not_a_doctor';
  end if;

  -- Lock the invite row to close accept/accept and accept-vs-revoke races.
  select * into v_invite from public.clinic_doctor_invites where id = p_invite_id for update;
  if v_invite.id is null then
    raise exception 'invite_not_found';
  end if;
  if v_invite.status <> 'PENDING' then
    raise exception 'invite_not_pending';
  end if;
  if lower(v_invite.doctor_email) <> v_email then
    raise exception 'invite_not_yours';
  end if;

  if p_accept then
    perform set_config('app.allow_clinic_link', 'on', true);
    -- One clinic per doctor, enforced atomically in the UPDATE predicate.
    update public.doctor_profiles
       set clinic_id = v_invite.clinic_id
     where id = v_doctor_id and clinic_id is null;
    get diagnostics v_updated = row_count;
    if v_updated = 0 then
      raise exception 'already_in_clinic';
    end if;
    update public.clinic_doctor_invites
       set status = 'ACCEPTED', responded_at = now()
     where id = p_invite_id and status = 'PENDING';
  else
    update public.clinic_doctor_invites
       set status = 'DECLINED', responded_at = now()
     where id = p_invite_id and status = 'PENDING';
  end if;
end $$;

grant execute on function public.my_clinic_invites() to authenticated;
grant execute on function public.respond_clinic_invite(uuid, boolean) to authenticated;


-- ---------------------------------------------------------------------------
-- Verify (every one should be true):
-- ---------------------------------------------------------------------------
--   -- 1. The enum value and the columns:
--   select 'LAB' = any(enum_range(null::public.invoice_recipient_type)::text[]);
--   select count(*) = 3 from information_schema.columns
--    where table_schema = 'public'
--      and (table_name, column_name) in (('doctor_profiles', 'buyer_lab_id'),
--                                        ('orders', 'buyer_lab_id'),
--                                        ('orders', 'patient_reference'));
--   select is_nullable = 'YES' from information_schema.columns
--    where table_schema = 'public' and table_name = 'orders' and column_name = 'patient_id';
--   select count(*) = 4 from pg_constraint
--    where conname in ('doctor_profiles_doctor_fields_check', 'doctor_profiles_buyer_no_clinic',
--                      'orders_patient_reference_length', 'orders_patient_required_for_doctors');
--
--   -- 2. The guards exist once each and none is SECURITY DEFINER:
--   select count(*) = 3 from pg_trigger
--    where tgname in ('doctor_profiles_buyer_lab_guard', 'orders_buyer_lab_guard',
--                     'doctor_work_locations_buyer_read_only');
--   select bool_and(not prosecdef) from pg_proc
--    where proname in ('tg_doctor_profiles_buyer_lab_guard', 'tg_orders_buyer_lab_guard',
--                      'tg_doctor_work_locations_buyer_read_only');
--
--   -- 3. Grants: the RPC to authenticated only; the helpers to nobody.
--   select has_function_privilege('authenticated', 'public.ensure_lab_buyer_profile()', 'execute')
--      and not has_function_privilege('anon', 'public.ensure_lab_buyer_profile()', 'execute');
--   select not has_function_privilege('authenticated', 'public._sync_lab_buyer_location(uuid)', 'execute')
--      and not has_function_privilege('authenticated', 'public._lab_buyer_recipient_snapshot(public.labs)', 'execute')
--      and not has_function_privilege('authenticated',
--            'public._submit_order_impl(uuid,uuid,uuid,uuid,jsonb,uuid,text,date,text,numeric,jsonb,numeric,uuid,uuid,uuid,time)', 'execute');
--
--   -- 4. The runtime winners carry 0048 and kept what came before:
--   select prosrc like '%cannot_order_from_own_lab%' and prosrc like '%force_new%'
--      and prosrc like '%p_requested_due_time%' and prosrc like '%patient_name_key%'
--     from pg_proc where proname = '_submit_order_impl';
--   select prosrc like '%invoice_recipient_not_allowed%' and prosrc like '%force_new%'
--     from pg_proc where proname = 'edit_order';
--   select count(*) = 1 from pg_proc where proname = 'submit_order';
--   select count(*) = 1 from pg_proc where proname = 'edit_order';
--   select count(*) = 1 from pg_proc where proname = 'find_matching_patient';
--   -- handle_new_user still carries the signup-role allow-list (not redefined here):
--   select prosrc like '%invalid signup role%' from pg_proc where proname = 'handle_new_user';
--
--   -- 5. Nothing existing became a purchase:
--   select count(*) = 0 from public.doctor_profiles where buyer_lab_id is not null;  -- before any lab buys
--   select count(*) = 0 from public.orders where buyer_lab_id is not null or patient_id is null;
--
--   -- 6. As an approved lab's owner, in a transaction you roll back:
--   --   begin;
--   --   select set_config('request.jwt.claims', '{"sub":"<lab owner uuid>"}', true);
--   --   set local role authenticated;
--   --   select public.ensure_lab_buyer_profile();            -- a uuid, the same on every call
--   --   select public.current_doctor_id();                   -- that uuid
--   --   select public.submit_order('<another lab>', '<its service>', null,
--   --          '{"reference":"Case 145"}', '<its published form version>', 'DOCTOR',
--   --          null, 'NONE', null, '{}', 100);              -- an order id
--   --   select buyer_lab_id, patient_id, patient_reference, invoice_recipient_type,
--   --          doctor_snapshot->>'is_lab' from public.orders where doctor_id = public.current_doctor_id();
--   --   -- <own lab id> | null | Case 145 | LAB | true
--   --   select public.submit_order('<own lab>', ...);        -- cannot_order_from_own_lab
--   --   update public.doctor_profiles set buyer_lab_id = null
--   --    where user_id = auth.uid();                         -- buyer_lab_id_read_only
--   --   select * from public.my_clinic_invites();            -- no rows
--   --   rollback;
-- ---------------------------------------------------------------------------
