-- ---------------------------------------------------------------------------
-- 0043 — in-site notifications, and realtime for the tables the pages read.
--
-- Trello jrmd9KL1. Two mechanisms that share one WebSocket:
--
--   * public.notifications: one row per recipient per event, written ONLY by
--     the triggers below (through public.notify), read by the bell and the
--     toasts over a realtime subscription filtered to the signed-in user.
--   * the supabase_realtime publication: the client uses row events on the
--     tables it already reads purely as a signal to refetch.
--
-- Rows store a kind and raw parameters, never text: the client translates at
-- render time, so a language switch re-renders every old row. No patient name
-- ever goes into params.
--
-- REALTIME MUST ALSO BE ENABLED FOR THE PROJECT in the Supabase dashboard
-- (Database → Publications → supabase_realtime, and Realtime itself under
-- Project Settings). Whether it is enabled on lab-order-dev cannot be read from
-- this repo; check before relying on live updates. Without it the app falls
-- back to the 60-second badge poll and refetch-on-focus, and the bell fills on
-- its next fetch.
--
-- ANSWERS TO THE TICKET'S "CHECK IN THE CODE" LIST (read from the migrations)
--
--   1. Question vs "needs doctor input" (0029, 0030, 0033).
--      request_clarification inserts an order_clarifications row with
--      needs_edit = false, then sets status NEEDS_CLARIFICATION.
--      request_doctor_input inserts a row with needs_edit = TRUE, then sets
--      status NEEDS_DOCTOR_INPUT. So row 3 (lab_question) fires only for
--      needs_edit = false and row 4 (lab_needs_change) only from the status;
--      one action never gives both. NEEDS_CLARIFICATION itself never notifies
--      (the ticket's rule). An edit request is closed by resolved_by_edit_at,
--      never by answered_at, so row 15 (doctor_answered) cannot fire for it.
--      Saving an edit restores the previous status (close_doctor_input_on_edit,
--      0033); that restore is the doctor's own write, so the lab-action rows
--      below skip every write made by the doctor or their clinic admin.
--
--   2. Invoice replace (0035). replace_order_invoice DELETES the current
--      INVOICE row and INSERTS a new one in the same call (one invoice per
--      order, unique index order_files_one_invoice). It is never an UPDATE, and
--      by the time the new row's AFTER INSERT trigger runs the old row is gone.
--      So an AFTER DELETE trigger marks the order in a transaction-local
--      setting (lab_order.invoice_replaced) and the INSERT trigger reads it
--      (row 12, invoice_replaced). A non-null invoice_acknowledged_at also
--      proves an earlier invoice existed (acknowledge_order_invoice refuses
--      without one), which covers a delete and a re-upload in two
--      transactions. Otherwise it is row 11, invoice_attached.
--
--   3. Clinic-placed orders (0014, 0023). Nothing records who placed an order:
--      clinic_submit_order and submit_order both end in _submit_order_impl,
--      which writes doctor_id only. So this migration adds
--      orders.placed_by_user_id, stamped from auth.uid() by a BEFORE INSERT
--      trigger (any client value is ignored) and frozen by a BEFORE UPDATE
--      trigger. "Placed by the clinic" = placed_by_user_id is the owner of the
--      doctor's CURRENT clinic. Orders placed before 0043 have null and count
--      as placed by the doctor.
--
--   4. cancelled_by_user_id is NOT enough: no write path sets it (the lab
--      sheet and the clinic page PATCH status + cancellation_reason only;
--      cancelled_at stays null too). Rows 7/8 therefore look at auth.uid() at
--      the moment of the cancel: the lab owner → row 7 to the doctor; the
--      doctor or their clinic admin → row 8 to the lab. cancelled_by_user_id
--      is the fallback when auth.uid() is null. Anyone else (a platform admin
--      using orders_admin_all) notifies nobody, because neither text would be
--      true.
--
--   5. labs.approval_status (0001): PENDING_APPROVAL, CHANGES_REQUESTED,
--      APPROVED_ACTIVE, REJECTED, SUSPENDED. "Approved" = APPROVED_ACTIVE,
--      "suspended" = SUSPENDED. REJECTED has no row in the ticket; the owner
--      added one (2026-10-15): lab_rejected → the lab owner, with the same
--      rules as lab_suspended. A rejected lab can still sign in and reach /lab
--      (RoleGuard checks the role only, labs_owner_select reads the lab in any
--      status), so the bell is there to show it. A lab row is inserted by handle_new_user at signup with the
--      default PENDING_APPROVAL; that insert and the owner's resubmission
--      (CHANGES_REQUESTED → PENDING_APPROVAL, tg_labs_protect_admin_columns)
--      are both row 26.
--
--   6. Platform admins: users.role = 'PLATFORM_ADMIN' (user_role, 0001).
--      users.id references auth.users(id) (0002), so user_id = auth.uid()
--      holds for every role. Feedback sender: feedback.user_id →
--      users.first_name || ' ' || users.last_name.
--
--   7. Invites (row 21) match the invited email against auth.users.email, the
--      address the auth server verified, like current_user_email() (0013)
--      does for the invite RLS, rather than the public.users mirror.
--
--   8. doctor_profiles is NOT added to the publication: a clinic admin cannot
--      read doctor_profiles rows (0015), so realtime would deliver nothing to
--      the clinic. The clinic's doctor list refreshes from the invite UPDATE
--      (an accept) and from its doctor_left notification instead.
--
-- NEVER BREAK THE WRITE
--   Every trigger body, and each notification row inside it, sits in its own
--   begin … exception when others then raise warning … end block. A bug here,
--   or a missing notifications table, must never roll back submit_order,
--   edit_order, record_payment, complete_order or any other write.
--
-- SECURITY
--   No INSERT/UPDATE/DELETE policy or grant on notifications: a client can
--   never write or forge one. notify() and every function below are
--   SECURITY DEFINER with search_path = public and EXECUTE revoked from
--   public, anon and authenticated (Supabase's default privileges grant it
--   otherwise, the 0039 lesson). Only mark_notifications_read is granted, to
--   authenticated.
--
-- RETENTION is 30 days: notify() deletes the recipient's older rows on every
-- insert, and the client also filters to the last 30 days.
--
-- Fully idempotent — safe to re-run.
-- ---------------------------------------------------------------------------


-- ── 1. The table ─────────────────────────────────────────────────────────

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  kind       text not null,
  order_id   uuid references public.orders(id) on delete cascade,
  params     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);

-- A CHECK, not an enum, so a new kind later is a one-line change here.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  -- doctor
  'lab_question', 'lab_needs_change', 'order_ready', 'order_sent',
  'order_cancelled_by_lab', 'price_set', 'due_confirmed',
  'invoice_attached', 'invoice_replaced', 'clinic_invite',
  -- lab
  'new_order', 'order_edited', 'doctor_answered', 'invoice_seen',
  'order_completed', 'order_reopened', 'order_cancelled_by_doctor',
  'lab_approved', 'lab_suspended', 'lab_changes_requested', 'lab_rejected',
  -- clinic admin
  'clinic_order_placed', 'clinic_order_completed', 'doctor_left',
  'payment_recorded', 'new_payable',
  -- platform admin
  'admin_new_lab', 'admin_new_feedback'
));

create index if not exists notifications_user_recent_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_user_unread_idx
  on public.notifications (user_id) where read_at is null;


-- ── 2. Security ──────────────────────────────────────────────────────────

alter table public.notifications enable row level security;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

revoke all on public.notifications from public, anon, authenticated;
grant select on public.notifications to authenticated;


-- ── 3. Who placed the order ──────────────────────────────────────────────

alter table public.orders
  add column if not exists placed_by_user_id uuid references public.users(id) on delete set null;

comment on column public.orders.placed_by_user_id is
  'Who submitted the order: the doctor, or the clinic admin acting for them. '
  'Stamped from auth.uid() on insert and never changed (0043). Null for orders '
  'placed before 0043 and for rows written outside a session.';

create or replace function public.tg_orders_stamp_placed_by()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    -- Never trust a client-supplied value: who is signed in is the placer.
    new.placed_by_user_id := auth.uid();
  else
    -- The FK's ON DELETE SET NULL arrives here as an ordinary UPDATE once the
    -- placer's users row is already gone: let exactly that through, or the
    -- freeze would put back an id that no longer exists and leave a dangling
    -- reference (later double-updates of the row then fail with 23503).
    if new.placed_by_user_id is null
       and not exists (select 1 from public.users u where u.id = old.placed_by_user_id) then
      return new;
    end if;
    new.placed_by_user_id := old.placed_by_user_id;
  end if;
  return new;
end $$;

drop trigger if exists orders_stamp_placed_by on public.orders;
create trigger orders_stamp_placed_by
  before insert on public.orders
  for each row execute function public.tg_orders_stamp_placed_by();

drop trigger if exists orders_freeze_placed_by on public.orders;
create trigger orders_freeze_placed_by
  before update on public.orders
  for each row
  when (new.placed_by_user_id is distinct from old.placed_by_user_id)
  execute function public.tg_orders_stamp_placed_by();


-- ── 4. notify() ──────────────────────────────────────────────────────────

create or replace function public.notify(
  p_user   uuid,
  p_kind   text,
  p_order  uuid,
  p_params jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user is null then
    return;
  end if;
  -- Nobody is told about what they just did themselves. In the SQL editor
  -- auth.uid() is null, so nothing is skipped there.
  if p_user = auth.uid() then
    return;
  end if;

  -- Opportunistic retention (30 days), on the recipient's own rows only.
  delete from public.notifications
   where user_id = p_user
     and created_at < now() - interval '30 days';

  insert into public.notifications (user_id, kind, order_id, params)
  values (p_user, p_kind, p_order, coalesce(jsonb_strip_nulls(p_params), '{}'::jsonb));
end $$;

-- The people around one order. clinic_owner is the owner of the doctor's
-- CURRENT clinic; after a doctor leaves, that clinic is no longer told.
create or replace function public._notification_parties(
  p_doctor_id uuid,
  p_lab_id    uuid,
  out doctor_user  uuid,
  out clinic_owner uuid,
  out lab_owner    uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select dp.user_id from public.doctor_profiles dp where dp.id = p_doctor_id),
    (select c.owner_user_id
       from public.doctor_profiles dp
       join public.clinics c on c.id = dp.clinic_id
      where dp.id = p_doctor_id),
    (select l.owner_user_id from public.labs l where l.id = p_lab_id);
$$;

-- code, lab and doctor, as the order's snapshots captured them.
create or replace function public._order_notification_params(o public.orders)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'code',   o.order_code,
    'lab',    nullif(btrim(o.lab_snapshot ->> 'public_name'), ''),
    'doctor', nullif(btrim(concat_ws(' ',
                o.doctor_snapshot ->> 'first_name',
                o.doctor_snapshot ->> 'last_name')), '')
  ));
$$;


-- ── 5. Triggers: orders ──────────────────────────────────────────────────
--
-- "Lab-action" rows (3 to 12) go to the doctor and, when the clinic placed
-- the order, also to the clinic admin (owner decision "both"), except price
-- (row 9), which the clinic admin gets as new_payable (row 20) instead. They
-- skip any write made by the doctor or their clinic admin: those are not lab
-- actions (an edit restoring the status, a doctor PATCH).

-- Rows 1, 2: a new order.
create or replace function public.tg_notify_order_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parties record;
  v_params  jsonb;
begin
  begin
    select * into v_parties from public._notification_parties(new.doctor_id, new.lab_id);
    v_params := public._order_notification_params(new);

    -- 1. new_order → the lab
    begin
      perform public.notify(v_parties.lab_owner, 'new_order', new.id, v_params);
    exception when others then
      raise warning 'notify new_order (order %): %', new.id, sqlerrm;
    end;

    -- 2. clinic_order_placed → the doctor's clinic admin (skipped as the actor
    --    when the clinic placed it)
    begin
      perform public.notify(v_parties.clinic_owner, 'clinic_order_placed', new.id, v_params);
    exception when others then
      raise warning 'notify clinic_order_placed (order %): %', new.id, sqlerrm;
    end;
  exception when others then
    raise warning 'tg_notify_order_insert (order %): %', new.id, sqlerrm;
  end;
  return null;
end $$;

drop trigger if exists orders_notify_insert on public.orders;
create trigger orders_notify_insert
  after insert on public.orders
  for each row execute function public.tg_notify_order_insert();

-- Rows 4 to 8, 16 to 18: status changes.
create or replace function public.tg_notify_order_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parties     record;
  v_params      jsonb;
  v_uid         uuid;
  v_actor       uuid;
  v_doctor_side boolean;
  v_clinic_copy uuid;
  v_kind        text;
begin
  begin
    select * into v_parties from public._notification_parties(new.doctor_id, new.lab_id);
    v_params := public._order_notification_params(new);
    v_uid := auth.uid();
    v_doctor_side := coalesce(v_uid = v_parties.doctor_user, false)
                  or coalesce(v_uid = v_parties.clinic_owner, false);
    v_clinic_copy := case when new.placed_by_user_id = v_parties.clinic_owner
                          then v_parties.clinic_owner end;

    -- 4, 5, 6. lab_needs_change / order_ready / order_sent → the doctor (+ clinic copy).
    --    RECEIVED, IN_PROGRESS, RECEIVED_BY_CLINIC, TRY_IN_PHASE and
    --    NEEDS_CLARIFICATION stay quiet.
    if new.status in ('NEEDS_DOCTOR_INPUT', 'READY_FOR_DELIVERY', 'SENT_TO_CLINIC')
       and not v_doctor_side then
      v_kind := case new.status
                  when 'NEEDS_DOCTOR_INPUT' then 'lab_needs_change'
                  when 'READY_FOR_DELIVERY' then 'order_ready'
                  else 'order_sent'
                end;
      begin
        perform public.notify(v_parties.doctor_user, v_kind, new.id, v_params);
        perform public.notify(v_clinic_copy, v_kind, new.id, v_params);
      exception when others then
        raise warning 'notify % (order %): %', v_kind, new.id, sqlerrm;
      end;
    end if;

    -- 7, 8. Cancelled: by whom decides the recipient.
    if new.status = 'CANCELLED' then
      v_actor := coalesce(v_uid, new.cancelled_by_user_id);
      if v_actor is not null and v_actor = v_parties.lab_owner then
        begin
          perform public.notify(v_parties.doctor_user, 'order_cancelled_by_lab', new.id, v_params);
          perform public.notify(v_clinic_copy, 'order_cancelled_by_lab', new.id, v_params);
        exception when others then
          raise warning 'notify order_cancelled_by_lab (order %): %', new.id, sqlerrm;
        end;
      elsif v_actor is not null
            and (v_actor = v_parties.doctor_user or v_actor = v_parties.clinic_owner) then
        begin
          perform public.notify(v_parties.lab_owner, 'order_cancelled_by_doctor', new.id, v_params);
        exception when others then
          raise warning 'notify order_cancelled_by_doctor (order %): %', new.id, sqlerrm;
        end;
      end if;
    end if;

    -- 16, 17. Completed (complete_order): the lab, and the doctor's clinic admin.
    if new.status = 'COMPLETED' then
      begin
        perform public.notify(v_parties.lab_owner, 'order_completed', new.id, v_params);
      exception when others then
        raise warning 'notify order_completed (order %): %', new.id, sqlerrm;
      end;
      begin
        perform public.notify(v_parties.clinic_owner, 'clinic_order_completed', new.id, v_params);
      exception when others then
        raise warning 'notify clinic_order_completed (order %): %', new.id, sqlerrm;
      end;
    end if;

    -- 18. Reopened (reopen_order) → the lab.
    if old.status = 'COMPLETED' and new.status <> 'COMPLETED' then
      begin
        perform public.notify(v_parties.lab_owner, 'order_reopened', new.id, v_params);
      exception when others then
        raise warning 'notify order_reopened (order %): %', new.id, sqlerrm;
      end;
    end if;
  exception when others then
    raise warning 'tg_notify_order_status (order %): %', new.id, sqlerrm;
  end;
  return null;
end $$;

drop trigger if exists orders_notify_status on public.orders;
create trigger orders_notify_status
  after update of status on public.orders
  for each row
  when (old.status is distinct from new.status)
  execute function public.tg_notify_order_status();

-- Rows 9, 20: the lab set or changed the price.
create or replace function public.tg_notify_order_price()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parties     record;
  v_params      jsonb;
  v_uid         uuid;
  v_doctor_side boolean;
begin
  begin
    select * into v_parties from public._notification_parties(new.doctor_id, new.lab_id);
    v_params := public._order_notification_params(new)
                || jsonb_build_object('amount', new.final_total);
    v_uid := auth.uid();
    v_doctor_side := coalesce(v_uid = v_parties.doctor_user, false)
                  or coalesce(v_uid = v_parties.clinic_owner, false);

    if not v_doctor_side then
      -- 9. price_set → the doctor only; the clinic admin's line is row 20.
      begin
        perform public.notify(v_parties.doctor_user, 'price_set', new.id, v_params);
      exception when others then
        raise warning 'notify price_set (order %): %', new.id, sqlerrm;
      end;
      -- 20. new_payable → the doctor's clinic admin.
      begin
        perform public.notify(v_parties.clinic_owner, 'new_payable', new.id, v_params);
      exception when others then
        raise warning 'notify new_payable (order %): %', new.id, sqlerrm;
      end;
    end if;
  exception when others then
    raise warning 'tg_notify_order_price (order %): %', new.id, sqlerrm;
  end;
  return null;
end $$;

drop trigger if exists orders_notify_price on public.orders;
create trigger orders_notify_price
  after update of final_total on public.orders
  for each row
  when (new.final_total is not null and old.final_total is distinct from new.final_total)
  execute function public.tg_notify_order_price();

-- Row 10: the lab confirmed (or moved) the due date or time.
create or replace function public.tg_notify_order_due()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parties     record;
  v_params      jsonb;
  v_uid         uuid;
  v_doctor_side boolean;
  v_clinic_copy uuid;
begin
  begin
    select * into v_parties from public._notification_parties(new.doctor_id, new.lab_id);
    v_params := public._order_notification_params(new)
                || jsonb_strip_nulls(jsonb_build_object(
                     'date', to_char(new.confirmed_due_date, 'YYYY-MM-DD'),
                     'time', to_char(new.confirmed_due_time, 'HH24:MI')));
    v_uid := auth.uid();
    v_doctor_side := coalesce(v_uid = v_parties.doctor_user, false)
                  or coalesce(v_uid = v_parties.clinic_owner, false);
    v_clinic_copy := case when new.placed_by_user_id = v_parties.clinic_owner
                          then v_parties.clinic_owner end;

    if not v_doctor_side then
      begin
        perform public.notify(v_parties.doctor_user, 'due_confirmed', new.id, v_params);
        perform public.notify(v_clinic_copy, 'due_confirmed', new.id, v_params);
      exception when others then
        raise warning 'notify due_confirmed (order %): %', new.id, sqlerrm;
      end;
    end if;
  exception when others then
    raise warning 'tg_notify_order_due (order %): %', new.id, sqlerrm;
  end;
  return null;
end $$;

drop trigger if exists orders_notify_due on public.orders;
create trigger orders_notify_due
  after update of confirmed_due_date, confirmed_due_time on public.orders
  for each row
  when (new.confirmed_due_date is not null and (
         old.confirmed_due_date is distinct from new.confirmed_due_date
         or (new.confirmed_due_time is not null
             and old.confirmed_due_time is distinct from new.confirmed_due_time)))
  execute function public.tg_notify_order_due();

-- Row 13: the doctor acknowledged the invoice. "Advances" rather than only
-- "null → set": a replace keeps the old acknowledgement (0035), so a doctor
-- confirming a replaced invoice moves it from one time to a later one.
create or replace function public.tg_notify_order_invoice_seen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parties record;
begin
  begin
    select * into v_parties from public._notification_parties(new.doctor_id, new.lab_id);
    perform public.notify(v_parties.lab_owner, 'invoice_seen', new.id,
                          public._order_notification_params(new));
  exception when others then
    raise warning 'notify invoice_seen (order %): %', new.id, sqlerrm;
  end;
  return null;
end $$;

drop trigger if exists orders_notify_invoice_seen on public.orders;
create trigger orders_notify_invoice_seen
  after update of invoice_acknowledged_at on public.orders
  for each row
  when (new.invoice_acknowledged_at is not null
        and (old.invoice_acknowledged_at is null
             or new.invoice_acknowledged_at > old.invoice_acknowledged_at))
  execute function public.tg_notify_order_invoice_seen();

-- Row 14: the doctor (or the clinic for them) edited the order (edit_order).
-- The clinic admin is not told about the doctor's own edits (owner).
create or replace function public.tg_notify_order_edited()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parties record;
begin
  begin
    select * into v_parties from public._notification_parties(new.doctor_id, new.lab_id);
    perform public.notify(v_parties.lab_owner, 'order_edited', new.id,
                          public._order_notification_params(new));
  exception when others then
    raise warning 'notify order_edited (order %): %', new.id, sqlerrm;
  end;
  return null;
end $$;

drop trigger if exists orders_notify_edited on public.orders;
create trigger orders_notify_edited
  after update of edit_count on public.orders
  for each row
  when (new.edit_count > old.edit_count)
  execute function public.tg_notify_order_edited();

-- Row 19: a payment was recorded (record_payment only moves paid_total).
create or replace function public.tg_notify_order_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parties record;
begin
  begin
    select * into v_parties from public._notification_parties(new.doctor_id, new.lab_id);
    perform public.notify(v_parties.clinic_owner, 'payment_recorded', new.id,
                          public._order_notification_params(new)
                          || jsonb_build_object('amount', new.paid_total - old.paid_total));
  exception when others then
    raise warning 'notify payment_recorded (order %): %', new.id, sqlerrm;
  end;
  return null;
end $$;

drop trigger if exists orders_notify_paid on public.orders;
create trigger orders_notify_paid
  after update of paid_total on public.orders
  for each row
  when (new.paid_total > old.paid_total)
  execute function public.tg_notify_order_paid();


-- ── 6. Triggers: order_clarifications ───────────────────────────────────

-- Row 3: the lab asked a question (not an edit request; that is row 4).
create or replace function public.tg_notify_clarification_asked()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order       public.orders%rowtype;
  v_parties     record;
  v_params      jsonb;
  v_uid         uuid;
  v_clinic_copy uuid;
begin
  begin
    select * into v_order from public.orders where id = new.order_id;
    select * into v_parties from public._notification_parties(v_order.doctor_id, v_order.lab_id);
    v_params := public._order_notification_params(v_order);
    v_uid := auth.uid();
    v_clinic_copy := case when v_order.placed_by_user_id = v_parties.clinic_owner
                          then v_parties.clinic_owner end;

    if not (coalesce(v_uid = v_parties.doctor_user, false)
            or coalesce(v_uid = v_parties.clinic_owner, false)) then
      perform public.notify(v_parties.doctor_user, 'lab_question', v_order.id, v_params);
      perform public.notify(v_clinic_copy, 'lab_question', v_order.id, v_params);
    end if;
  exception when others then
    raise warning 'notify lab_question (clarification %): %', new.id, sqlerrm;
  end;
  return null;
end $$;

drop trigger if exists order_clarifications_notify_asked on public.order_clarifications;
create trigger order_clarifications_notify_asked
  after insert on public.order_clarifications
  for each row
  when (not new.needs_edit)
  execute function public.tg_notify_clarification_asked();

-- Row 15: the doctor answered (answer_clarification).
create or replace function public.tg_notify_clarification_answered()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order   public.orders%rowtype;
  v_parties record;
begin
  begin
    select * into v_order from public.orders where id = new.order_id;
    select * into v_parties from public._notification_parties(v_order.doctor_id, v_order.lab_id);
    perform public.notify(v_parties.lab_owner, 'doctor_answered', v_order.id,
                          public._order_notification_params(v_order));
  exception when others then
    raise warning 'notify doctor_answered (clarification %): %', new.id, sqlerrm;
  end;
  return null;
end $$;

drop trigger if exists order_clarifications_notify_answered on public.order_clarifications;
create trigger order_clarifications_notify_answered
  after update of answered_at on public.order_clarifications
  for each row
  when (old.answered_at is null and new.answered_at is not null)
  execute function public.tg_notify_clarification_answered();


-- ── 7. Triggers: order_files (invoice) ───────────────────────────────────

-- replace_order_invoice deletes the old INVOICE row before inserting the new
-- one; remember that for the rest of the transaction.
create or replace function public.tg_mark_invoice_removed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform set_config(
      'lab_order.invoice_replaced',
      coalesce(current_setting('lab_order.invoice_replaced', true), '') || old.order_id::text || ',',
      true);
  exception when others then
    raise warning 'tg_mark_invoice_removed (order %): %', old.order_id, sqlerrm;
  end;
  return null;
end $$;

drop trigger if exists order_files_mark_invoice_removed on public.order_files;
create trigger order_files_mark_invoice_removed
  after delete on public.order_files
  for each row
  when (old.file_source = 'INVOICE')
  execute function public.tg_mark_invoice_removed();

-- Rows 11, 12: the lab attached or replaced the invoice.
create or replace function public.tg_notify_invoice_added()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order       public.orders%rowtype;
  v_parties     record;
  v_params      jsonb;
  v_uid         uuid;
  v_clinic_copy uuid;
  v_kind        text;
begin
  begin
    select * into v_order from public.orders where id = new.order_id;
    select * into v_parties from public._notification_parties(v_order.doctor_id, v_order.lab_id);
    v_params := public._order_notification_params(v_order);
    v_uid := auth.uid();
    v_clinic_copy := case when v_order.placed_by_user_id = v_parties.clinic_owner
                          then v_parties.clinic_owner end;

    v_kind := case
      when position(new.order_id::text in coalesce(current_setting('lab_order.invoice_replaced', true), '')) > 0
        or v_order.invoice_acknowledged_at is not null
        then 'invoice_replaced'
      else 'invoice_attached'
    end;

    if not (coalesce(v_uid = v_parties.doctor_user, false)
            or coalesce(v_uid = v_parties.clinic_owner, false)) then
      perform public.notify(v_parties.doctor_user, v_kind, v_order.id, v_params);
      perform public.notify(v_clinic_copy, v_kind, v_order.id, v_params);
    end if;
  exception when others then
    raise warning 'notify invoice (file %): %', new.id, sqlerrm;
  end;
  return null;
end $$;

drop trigger if exists order_files_notify_invoice on public.order_files;
create trigger order_files_notify_invoice
  after insert on public.order_files
  for each row
  when (new.file_source = 'INVOICE')
  execute function public.tg_notify_invoice_added();


-- ── 8. Triggers: clinics and doctors ─────────────────────────────────────

-- Row 21: a clinic invited a doctor by email.
create or replace function public.tg_notify_clinic_invite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic text;
  v_user   uuid;
begin
  begin
    select public_name into v_clinic from public.clinics where id = new.clinic_id;
    for v_user in
      select u.id
        from auth.users au
        join public.users u on u.id = au.id
       where lower(au.email) = lower(btrim(new.doctor_email))
         and u.role = 'DOCTOR'
    loop
      perform public.notify(v_user, 'clinic_invite', null,
                            jsonb_build_object('clinic', v_clinic));
    end loop;
  exception when others then
    raise warning 'notify clinic_invite (invite %): %', new.id, sqlerrm;
  end;
  return null;
end $$;

drop trigger if exists clinic_doctor_invites_notify on public.clinic_doctor_invites;
create trigger clinic_doctor_invites_notify
  after insert on public.clinic_doctor_invites
  for each row
  when (new.status = 'PENDING')
  execute function public.tg_notify_clinic_invite();

-- Row 22: a doctor left the clinic (leave_clinic; clinic_remove_doctor is the
-- admin's own action and is skipped as the actor).
create or replace function public.tg_notify_doctor_left()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner  uuid;
  v_doctor text;
begin
  begin
    select owner_user_id into v_owner from public.clinics where id = old.clinic_id;
    select nullif(btrim(concat_ws(' ', first_name, last_name)), '')
      into v_doctor from public.users where id = new.user_id;
    perform public.notify(v_owner, 'doctor_left', null,
                          jsonb_strip_nulls(jsonb_build_object('doctor', v_doctor)));
  exception when others then
    raise warning 'notify doctor_left (doctor %): %', new.id, sqlerrm;
  end;
  return null;
end $$;

drop trigger if exists doctor_profiles_notify_left on public.doctor_profiles;
create trigger doctor_profiles_notify_left
  after update of clinic_id on public.doctor_profiles
  for each row
  when (old.clinic_id is not null and new.clinic_id is null)
  execute function public.tg_notify_doctor_left();


-- ── 9. Triggers: labs and feedback ───────────────────────────────────────

-- Rows 23 to 26, and lab_rejected (owner decision, no ticket row): the
-- approval lifecycle.
create or replace function public.tg_notify_lab_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_params jsonb;
  v_kind   text;
  v_admin  uuid;
begin
  begin
    v_params := jsonb_strip_nulls(jsonb_build_object('lab', new.public_name, 'lab_id', new.id));

    -- 23, 24, 25, lab_rejected. → the lab owner (the admin acting is skipped
    -- by notify() as the actor).
    v_kind := case new.approval_status
                when 'APPROVED_ACTIVE'   then 'lab_approved'
                when 'SUSPENDED'         then 'lab_suspended'
                when 'CHANGES_REQUESTED' then 'lab_changes_requested'
                when 'REJECTED'          then 'lab_rejected'
              end;
    if v_kind is not null then
      begin
        perform public.notify(new.owner_user_id, v_kind, null, v_params);
      exception when others then
        raise warning 'notify % (lab %): %', v_kind, new.id, sqlerrm;
      end;
    end if;

    -- 26. A lab waiting for review (signup or resubmission) → every admin.
    if new.approval_status = 'PENDING_APPROVAL' then
      begin
        for v_admin in select id from public.users where role = 'PLATFORM_ADMIN' loop
          perform public.notify(v_admin, 'admin_new_lab', null, v_params);
        end loop;
      exception when others then
        raise warning 'notify admin_new_lab (lab %): %', new.id, sqlerrm;
      end;
    end if;
  exception when others then
    raise warning 'tg_notify_lab_status (lab %): %', new.id, sqlerrm;
  end;
  return null;
end $$;

drop trigger if exists labs_notify_insert on public.labs;
create trigger labs_notify_insert
  after insert on public.labs
  for each row
  when (new.approval_status = 'PENDING_APPROVAL')
  execute function public.tg_notify_lab_status();

drop trigger if exists labs_notify_status on public.labs;
create trigger labs_notify_status
  after update of approval_status on public.labs
  for each row
  when (old.approval_status is distinct from new.approval_status)
  execute function public.tg_notify_lab_status();

-- Row 27: new feedback → every admin.
create or replace function public.tg_notify_feedback()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender text;
  v_admin  uuid;
begin
  begin
    select nullif(btrim(concat_ws(' ', first_name, last_name)), '')
      into v_sender from public.users where id = new.user_id;
    for v_admin in select id from public.users where role = 'PLATFORM_ADMIN' loop
      perform public.notify(v_admin, 'admin_new_feedback', null,
                            jsonb_strip_nulls(jsonb_build_object('sender', v_sender)));
    end loop;
  exception when others then
    raise warning 'notify admin_new_feedback (feedback %): %', new.id, sqlerrm;
  end;
  return null;
end $$;

drop trigger if exists feedback_notify on public.feedback;
create trigger feedback_notify
  after insert on public.feedback
  for each row execute function public.tg_notify_feedback();


-- ── 10. Marking read ─────────────────────────────────────────────────────

create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if auth.uid() is null then
    return 0;
  end if;
  update public.notifications
     set read_at = now()
   where user_id = auth.uid()
     and read_at is null
     and (p_ids is null or id = any(p_ids));
  get diagnostics v_count = row_count;
  return v_count;
end $$;


-- ── 11. Privileges ───────────────────────────────────────────────────────

revoke all on function public.notify(uuid, text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public._notification_parties(uuid, uuid) from public, anon, authenticated;
revoke all on function public._order_notification_params(public.orders) from public, anon, authenticated;
revoke all on function public.tg_orders_stamp_placed_by() from public, anon, authenticated;
revoke all on function public.tg_notify_order_insert() from public, anon, authenticated;
revoke all on function public.tg_notify_order_status() from public, anon, authenticated;
revoke all on function public.tg_notify_order_price() from public, anon, authenticated;
revoke all on function public.tg_notify_order_due() from public, anon, authenticated;
revoke all on function public.tg_notify_order_invoice_seen() from public, anon, authenticated;
revoke all on function public.tg_notify_order_edited() from public, anon, authenticated;
revoke all on function public.tg_notify_order_paid() from public, anon, authenticated;
revoke all on function public.tg_notify_clarification_asked() from public, anon, authenticated;
revoke all on function public.tg_notify_clarification_answered() from public, anon, authenticated;
revoke all on function public.tg_mark_invoice_removed() from public, anon, authenticated;
revoke all on function public.tg_notify_invoice_added() from public, anon, authenticated;
revoke all on function public.tg_notify_clinic_invite() from public, anon, authenticated;
revoke all on function public.tg_notify_doctor_left() from public, anon, authenticated;
revoke all on function public.tg_notify_lab_status() from public, anon, authenticated;
revoke all on function public.tg_notify_feedback() from public, anon, authenticated;

revoke all on function public.mark_notifications_read(uuid[]) from public, anon, authenticated;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;


-- ── 12. Realtime publication ─────────────────────────────────────────────
--
-- lab_forms, not lab_form_versions: publishing repoints
-- lab_forms.current_version_id, a small row; version rows carry large JSON
-- that could exceed the realtime payload limit. Realtime applies RLS per
-- subscriber to INSERT and UPDATE; the client never subscribes to DELETE.

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
  foreach v_table in array array[
    'notifications', 'orders', 'order_clarifications', 'order_files',
    'labs', 'lab_services', 'lab_forms', 'clinic_doctor_invites', 'feedback'
  ] loop
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
--   select relrowsecurity from pg_class where oid = 'public.notifications'::regclass;
--   select count(*) = 1 from pg_policies
--     where schemaname = 'public' and tablename = 'notifications';
--   -- clients can read their own rows and nothing else:
--   select has_table_privilege('authenticated', 'public.notifications', 'SELECT')
--      and not has_table_privilege('authenticated', 'public.notifications', 'INSERT')
--      and not has_table_privilege('authenticated', 'public.notifications', 'UPDATE')
--      and not has_table_privilege('authenticated', 'public.notifications', 'DELETE')
--      and not has_table_privilege('anon', 'public.notifications', 'SELECT');
--   -- only mark_notifications_read is callable by a client:
--   select not has_function_privilege('authenticated', 'public.notify(uuid,text,uuid,jsonb)', 'EXECUTE')
--      and not has_function_privilege('anon', 'public.notify(uuid,text,uuid,jsonb)', 'EXECUTE')
--      and has_function_privilege('authenticated', 'public.mark_notifications_read(uuid[])', 'EXECUTE')
--      and not has_function_privilege('anon', 'public.mark_notifications_read(uuid[])', 'EXECUTE');
--   select count(*) = 17 from pg_trigger
--     where not tgisinternal and tgname in (
--       'orders_stamp_placed_by', 'orders_freeze_placed_by', 'orders_notify_insert',
--       'orders_notify_status', 'orders_notify_price', 'orders_notify_due',
--       'orders_notify_invoice_seen', 'orders_notify_edited', 'orders_notify_paid',
--       'order_clarifications_notify_asked', 'order_clarifications_notify_answered',
--       'order_files_mark_invoice_removed', 'order_files_notify_invoice',
--       'clinic_doctor_invites_notify', 'doctor_profiles_notify_left',
--       'labs_notify_insert', 'labs_notify_status');
--   -- (feedback_notify makes 18 with the line below)
--   select count(*) = 1 from pg_trigger where tgname = 'feedback_notify';
--   -- the kind list includes the owner-added lab_rejected (28 kinds):
--   select pg_get_constraintdef(oid) like '%''lab_rejected''%' from pg_constraint
--     where conname = 'notifications_kind_check' and conrelid = 'public.notifications'::regclass;
--   select count(*) = 9 from pg_publication_tables
--     where pubname = 'supabase_realtime' and schemaname = 'public'
--       and tablename in ('notifications', 'orders', 'order_clarifications', 'order_files',
--                         'labs', 'lab_services', 'lab_forms', 'clinic_doctor_invites', 'feedback');
--   -- the placed_by freeze still lets ON DELETE SET NULL through (no dangling ids):
--   select not exists (select 1 from public.orders o
--                       where o.placed_by_user_id is not null
--                         and not exists (select 1 from public.users u where u.id = o.placed_by_user_id));
--
--   -- A notification bug never rolls back the write (run in a transaction):
--   --   begin;
--   --   alter table public.notifications rename to notifications_x;
--   --   update public.orders set final_total = 123 where id = '<an order>';  -- succeeds, WARNING
--   --   rollback;
--
--   -- The newest rows, to check each event's recipient and kind:
--   --   select user_id, kind, params from public.notifications order by created_at desc limit 20;
-- ---------------------------------------------------------------------------
