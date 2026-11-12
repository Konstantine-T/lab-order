-- ---------------------------------------------------------------------------
-- 0060: the lab is told when the CLINIC changes an order's status, in the
-- clinic's name, and when an order is marked received at the clinic.
--
-- The clinic's status powers are the doctor's (owner decision): cancel while
-- SUBMITTED, mark received from SENT_TO_CLINIC, complete, reopen. They are
-- RPCs since 0045 / 0050 / 0052 (can_act_for_order); nothing changes there.
-- What was wrong is the wording: 0050's tg_notify_order_status counted the
-- clinic owner as "the doctor's side", so a clinic completing an order told
-- the lab "the doctor closed order …". Marking received told nobody.
--
--   1. Four kinds, added to 0044's list (which keeps every other kind):
--        order_cancelled_by_clinic   CANCELLED by the clinic owner      → lab
--        order_completed_by_clinic   COMPLETED by the clinic owner      → lab
--        order_reopened_by_clinic    out of COMPLETED by the clinic     → lab
--        order_received_at_clinic    SENT_TO_CLINIC → RECEIVED_BY_CLINIC,
--                                    by the doctor or the clinic (J1)   → lab
--      The clinic kinds carry `clinic` (the clinic's public name) in params.
--   2. tg_notify_order_status: 0050's body verbatim, except that an action by
--      the order's clinic owner (auth.uid() = clinic_owner, and not the
--      doctor) picks the *_by_clinic kind, and the received row. A reopen
--      (COMPLETED → RECEIVED_BY_CLINIC) is a reopen only: "received" is sent
--      only from SENT_TO_CLINIC. Same rules as 0043: through notify(), each
--      in its own exception block, the actor never notified.
--
-- The doctor's own actions keep their kinds. The doctor is not told when the
-- clinic changes a status (J2); the status and the history show it.
--
-- REPLAY ORDER: 0043 / 0050 recreate tg_notify_order_status, 0043 / 0044 the
-- kinds CHECK (without these four, a clinic action would then fail its
-- notification insert, which is caught and only warns). Re-run this file
-- after replaying any of them. A later kind redefines the CHECK here,
-- keeping these. Idempotent.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'orders'
                    and column_name = 'clinic_id') then
    raise exception '0060 needs 0050 (multi-clinic) applied first';
  end if;
end $$;


-- ── 1. Notification kinds (0044's list, plus four) ──────────────────────
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
  -- lab, 0060: the clinic acted, or the work arrived
  'order_cancelled_by_clinic', 'order_completed_by_clinic', 'order_reopened_by_clinic',
  'order_received_at_clinic',
  -- clinic admin
  'clinic_order_placed', 'clinic_order_completed', 'doctor_left',
  'payment_recorded', 'new_payable',
  -- platform admin
  'admin_new_lab', 'admin_new_feedback'
));


-- ── 2. Status changes ───────────────────────────────────────────────────
create or replace function public.tg_notify_order_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parties       record;
  v_params        jsonb;
  v_clinic_params jsonb;
  v_uid           uuid;
  v_actor         uuid;
  v_doctor_side   boolean;
  v_by_clinic     boolean;
  v_clinic_copy   uuid;
  v_kind          text;
begin
  begin
    select * into v_parties from public._notification_parties(new.doctor_id, new.lab_id, new.clinic_id);
    v_params := public._order_notification_params(new);
    -- 0060: the clinic's name, for the kinds that say the clinic acted.
    v_clinic_params := v_params || jsonb_strip_nulls(jsonb_build_object(
      'clinic', (select nullif(btrim(c.public_name), '') from public.clinics c where c.id = new.clinic_id)));
    v_uid := auth.uid();
    v_doctor_side := coalesce(v_uid = v_parties.doctor_user, false)
                  or coalesce(v_uid = v_parties.clinic_owner, false);
    -- 0060: the order's clinic acted (and is not, somehow, its doctor too).
    v_by_clinic := v_uid is not null
                   and v_uid = v_parties.clinic_owner
                   and v_uid is distinct from v_parties.doctor_user;
    v_clinic_copy := case when new.placed_by_user_id = v_parties.clinic_owner
                          then v_parties.clinic_owner end;

    -- 4, 5, 6. lab_needs_change / order_ready / order_sent → the doctor (+ clinic copy).
    --    RECEIVED, IN_PROGRESS, TRY_IN_PHASE and NEEDS_CLARIFICATION stay
    --    quiet; RECEIVED_BY_CLINIC is the lab's row below (0060).
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

    -- 7, 8. Cancelled: by whom decides the recipient and the words.
    if new.status = 'CANCELLED' then
      v_actor := coalesce(v_uid, new.cancelled_by_user_id);
      if v_actor is not null and v_actor = v_parties.lab_owner then
        begin
          perform public.notify(v_parties.doctor_user, 'order_cancelled_by_lab', new.id, v_params);
          perform public.notify(v_clinic_copy, 'order_cancelled_by_lab', new.id, v_params);
        exception when others then
          raise warning 'notify order_cancelled_by_lab (order %): %', new.id, sqlerrm;
        end;
      elsif v_actor is not null and v_actor = v_parties.clinic_owner
            and v_actor is distinct from v_parties.doctor_user then
        begin
          perform public.notify(v_parties.lab_owner, 'order_cancelled_by_clinic', new.id, v_clinic_params);
        exception when others then
          raise warning 'notify order_cancelled_by_clinic (order %): %', new.id, sqlerrm;
        end;
      elsif v_actor is not null and v_actor = v_parties.doctor_user then
        begin
          perform public.notify(v_parties.lab_owner, 'order_cancelled_by_doctor', new.id, v_params);
        exception when others then
          raise warning 'notify order_cancelled_by_doctor (order %): %', new.id, sqlerrm;
        end;
      end if;
    end if;

    -- 0060. Received at the clinic (mark_received_by_clinic) → the lab, whoever
    -- marked it (J1). Only from SENT_TO_CLINIC: a reopen also lands on
    -- RECEIVED_BY_CLINIC, and that is a reopen, told below, not an arrival.
    if new.status = 'RECEIVED_BY_CLINIC' and old.status = 'SENT_TO_CLINIC' then
      begin
        perform public.notify(v_parties.lab_owner, 'order_received_at_clinic', new.id,
                              case when v_by_clinic then v_clinic_params else v_params end);
      exception when others then
        raise warning 'notify order_received_at_clinic (order %): %', new.id, sqlerrm;
      end;
    end if;

    -- 16, 17. Completed (complete_order): the lab, in the words of who did it,
    -- and the order's clinic admin (skipped when it was the admin).
    if new.status = 'COMPLETED' then
      begin
        if v_by_clinic then
          perform public.notify(v_parties.lab_owner, 'order_completed_by_clinic', new.id, v_clinic_params);
        else
          perform public.notify(v_parties.lab_owner, 'order_completed', new.id, v_params);
        end if;
      exception when others then
        raise warning 'notify order_completed (order %): %', new.id, sqlerrm;
      end;
      begin
        perform public.notify(v_parties.clinic_owner, 'clinic_order_completed', new.id, v_params);
      exception when others then
        raise warning 'notify clinic_order_completed (order %): %', new.id, sqlerrm;
      end;
    end if;

    -- 18. Reopened (reopen_order) → the lab, in the words of who did it.
    if old.status = 'COMPLETED' and new.status <> 'COMPLETED' then
      begin
        if v_by_clinic then
          perform public.notify(v_parties.lab_owner, 'order_reopened_by_clinic', new.id, v_clinic_params);
        else
          perform public.notify(v_parties.lab_owner, 'order_reopened', new.id, v_params);
        end if;
      exception when others then
        raise warning 'notify order_reopened (order %): %', new.id, sqlerrm;
      end;
    end if;
  exception when others then
    raise warning 'tg_notify_order_status (order %): %', new.id, sqlerrm;
  end;
  return null;
end $$;

revoke all on function public.tg_notify_order_status() from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- Verify (every one should be true):
-- ---------------------------------------------------------------------------
--   select pg_get_constraintdef(oid) like '%order_completed_by_clinic%'
--      and pg_get_constraintdef(oid) like '%order_received_at_clinic%'
--      and pg_get_constraintdef(oid) like '%lab_review_reply%'
--     from pg_constraint
--    where conname = 'notifications_kind_check' and conrelid = 'public.notifications'::regclass;
--
--   select prosrc like '%order_completed_by_clinic%' and prosrc like '%order_received_at_clinic%'
--     from pg_proc where proname = 'tg_notify_order_status';
--
--   -- In the app, as the admin of an order's clinic: complete it, and the lab's
--   -- newest notification is order_completed_by_clinic with params.clinic set;
--   -- as its doctor, order_completed. Mark one received: the lab gets
--   -- order_received_at_clinic; reopen a completed one: only order_reopened*.
-- ---------------------------------------------------------------------------
