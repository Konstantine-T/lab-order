-- ---------------------------------------------------------------------------
-- 0033 - close the holes 0030 and 0031 opened.
--
-- Found by review after 0032 landed. Each fix below has a reproduction.
--
-- 1) PRIVILEGE ESCALATION (the reason this file exists)
--    0030 restored `orders.status` from `orders.status_before_doctor_input`
--    inside a SECURITY DEFINER trigger. That column is an ordinary column on
--    a table where `authenticated` holds UPDATE, and orders_doctor_update's
--    WITH CHECK constrains only `status` - not which other columns a doctor
--    may write. So the column laundered a value straight past the check:
--
--      PATCH orders  {status: 'NEEDS_DOCTOR_INPUT',
--                     status_before_doctor_input: 'COMPLETED'}   -- allowed
--      rpc/edit_order {...}                                      -- trigger fires
--      => status = COMPLETED
--
--    Verified against dev under `set local role authenticated` as the order's
--    own doctor: SUBMITTED -> COMPLETED, with completed_at and
--    completed_by_user_id both null. That is exactly what 0022 exists to
--    forbid ("a doctor could already PATCH their order straight to
--    COMPLETED"), and the lab can plant the same value and have the doctor's
--    own save spring it.
--
--    The trigger now refuses to restore anything a lab could not have set by
--    hand. `request_doctor_input` already rejects terminal orders, so the
--    column can never legitimately hold COMPLETED or CANCELLED; anything
--    outside the allow-list is treated as tampering and falls back to
--    RECEIVED.
--
-- 2) A STRANDED REQUEST
--    The lab can move an order out of NEEDS_DOCTOR_INPUT from the status
--    pills. The 0030 trigger only fires on an edit and early-returns unless
--    the status still reads NEEDS_DOCTOR_INPUT, so the open request was
--    orphaned: no later edit could close it, both ask RPCs then raised
--    clarification_already_open forever, and the order sat on the doctor's
--    "waiting on you" list with nothing to act on. Closing now hangs off the
--    status leaving that value, by whatever route.
--
-- 3) "OPEN" MEANT TWO DIFFERENT THINGS
--    0030 redefined an open ask as `answered_at is null AND
--    resolved_by_edit_at is null` in the index and in request_doctor_input,
--    but request_clarification kept the old `answered_at is null`. After one
--    edit request was resolved the lab could never ask a plain question on
--    that order again. Same stale predicate on the client - see
--    LabOrderSheetPage.
--
-- 4) AN EDIT REQUEST COULD BE TALKED AWAY
--    answer_clarification had no needs_edit guard, so the doctor could close
--    a "change the order" request by typing a reply, leaving the order parked
--    in NEEDS_DOCTOR_INPUT with nothing left to close it.
--
-- 5) A TIME WITHOUT A DATE
--    0032's two time columns had no tie to their date columns. Clearing the
--    confirmed date while leaving the time picker populated stored an orphan
--    time that no screen can render.
--
-- Fully idempotent - safe to re-run.
-- ---------------------------------------------------------------------------

-- ── 1 + 2. The restore, hardened, and a second closer for the manual path ──

create or replace function public.close_doctor_input_on_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.order_status;
  v_prev   public.order_status;
begin
  select status, status_before_doctor_input
    into v_status, v_prev
    from public.orders
   where id = new.order_id
     for update;

  if v_status is distinct from 'NEEDS_DOCTOR_INPUT' then
    return new;
  end if;

  -- Only a status the lab could have set by hand. `request_doctor_input`
  -- refuses terminal orders, so a COMPLETED or CANCELLED value here did not
  -- come from it — it was written directly by a client that is allowed to
  -- UPDATE the row but is not allowed to set that status.
  if v_prev is null or v_prev not in (
    'SUBMITTED', 'RECEIVED', 'NEEDS_CLARIFICATION', 'IN_PROGRESS',
    'READY_FOR_DELIVERY', 'SENT_TO_CLINIC', 'RECEIVED_BY_CLINIC', 'TRY_IN_PHASE'
  ) then
    v_prev := 'RECEIVED';
  end if;

  update public.orders
     set status                     = v_prev,
         status_before_doctor_input = null,
         updated_at                 = now()
   where id = new.order_id;

  return new;
end;
$$;

drop trigger if exists close_doctor_input_on_edit on public.order_edits;
create trigger close_doctor_input_on_edit
  after insert on public.order_edits
  for each row execute function public.close_doctor_input_on_edit();

-- Whatever moves the status off NEEDS_DOCTOR_INPUT — the trigger above, or
-- the lab picking another pill — closes the request that put it there.
create or replace function public.release_doctor_input_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.order_clarifications
     set resolved_by_edit_at = now()
   where order_id = new.id
     and needs_edit
     and answered_at is null
     and resolved_by_edit_at is null;

  -- Nothing left to restore, and leaving it set would let the next edit
  -- re-apply a stale status.
  if new.status_before_doctor_input is not null then
    update public.orders set status_before_doctor_input = null where id = new.id;
  end if;

  return null;
end;
$$;

drop trigger if exists release_doctor_input_request on public.orders;
create trigger release_doctor_input_request
  after update of status on public.orders
  for each row
  when (old.status = 'NEEDS_DOCTOR_INPUT' and new.status <> 'NEEDS_DOCTOR_INPUT')
  execute function public.release_doctor_input_request();

-- ── 3. One definition of "an ask is still open" ───────────────────────────

create or replace function public.request_clarification(
  p_order_id uuid,
  p_question text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_id    uuid;
begin
  select * into v_order from public.orders where id = p_order_id;
  if v_order.id is null then
    raise exception 'order_not_found';
  end if;
  if not public.current_user_owns_lab(v_order.lab_id) then
    raise exception 'not_your_lab';
  end if;
  if v_order.status in ('COMPLETED', 'CANCELLED') then
    raise exception 'order_terminal';
  end if;
  if btrim(coalesce(p_question, '')) = '' then
    raise exception 'question_required';
  end if;

  -- Matches the partial unique index and request_doctor_input. Before 0033
  -- this read `answered_at is null` alone, so a request closed by an edit
  -- (which sets resolved_by_edit_at and deliberately leaves the answer
  -- columns alone) blocked every future question on that order.
  if exists (
    select 1 from public.order_clarifications
    where order_id = p_order_id
      and answered_at is null
      and resolved_by_edit_at is null
  ) then
    raise exception 'clarification_already_open';
  end if;

  insert into public.order_clarifications (order_id, asked_by_user_id, question)
  values (p_order_id, auth.uid(), btrim(p_question))
  returning id into v_id;

  update public.orders
     set status     = 'NEEDS_CLARIFICATION',
         updated_at = now()
   where id = p_order_id;

  return v_id;
end;
$$;

grant execute on function public.request_clarification(uuid, text) to authenticated;

-- ── 4. An edit request is closed by editing, not by replying ──────────────

create or replace function public.answer_clarification(
  p_clarification_id uuid,
  p_answer           text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row   public.order_clarifications%rowtype;
  v_order public.orders%rowtype;
begin
  select * into v_row from public.order_clarifications where id = p_clarification_id;
  if v_row.id is null then
    raise exception 'clarification_not_found';
  end if;

  select * into v_order from public.orders where id = v_row.order_id;
  if not public.can_act_for_doctor(v_order.doctor_id) then
    raise exception 'not_your_order';
  end if;
  if v_row.answered_at is not null or v_row.resolved_by_edit_at is not null then
    raise exception 'already_answered';
  end if;
  -- The UI offers no answer box for these, but the RPC is the boundary: a
  -- typed reply would close the row while leaving the order parked in
  -- NEEDS_DOCTOR_INPUT with nothing able to release it.
  if v_row.needs_edit then
    raise exception 'answer_by_edit';
  end if;
  if v_order.status in ('COMPLETED', 'CANCELLED') then
    raise exception 'order_terminal';
  end if;
  if btrim(coalesce(p_answer, '')) = '' then
    raise exception 'answer_required';
  end if;

  update public.order_clarifications
     set answer              = btrim(p_answer),
         answered_by_user_id = auth.uid(),
         answered_at         = now()
   where id = p_clarification_id;
end;
$$;

grant execute on function public.answer_clarification(uuid, text) to authenticated;

-- ── 5. A due time cannot outlive its due date ─────────────────────────────

alter table public.orders drop constraint if exists orders_requested_due_time_needs_date;
alter table public.orders add constraint orders_requested_due_time_needs_date
  check (requested_due_time is null or requested_due_date is not null) not valid;

alter table public.orders drop constraint if exists orders_confirmed_due_time_needs_date;
alter table public.orders add constraint orders_confirmed_due_time_needs_date
  check (confirmed_due_time is null or confirmed_due_date is not null) not valid;

-- `not valid` skips the scan of existing rows; both are enforced from here on.
-- Nothing can have violated them yet — 0032 shipped hours ago — but validating
-- separately keeps the ALTER from taking a long lock if that ever changes.
alter table public.orders validate constraint orders_requested_due_time_needs_date;
alter table public.orders validate constraint orders_confirmed_due_time_needs_date;

-- ---------------------------------------------------------------------------
-- Verify (every one should be true):
-- ---------------------------------------------------------------------------
--   select pg_get_functiondef(oid) like '%not in (%SUBMITTED%' from pg_proc
--     where proname = 'close_doctor_input_on_edit';
--   select count(*) = 1 from pg_trigger
--     where tgrelid = 'public.orders'::regclass and tgname = 'release_doctor_input_request';
--   select pg_get_functiondef(oid) like '%resolved_by_edit_at is null%' from pg_proc
--     where proname = 'request_clarification';
--   select pg_get_functiondef(oid) like '%answer_by_edit%' from pg_proc
--     where proname = 'answer_clarification';
--   select count(*) = 2 from pg_constraint
--     where conrelid = 'public.orders'::regclass
--       and conname like 'orders_%_due_time_needs_date';
--   -- and the escalation must now be refused: planting COMPLETED and editing
--   -- must leave the order at RECEIVED, not COMPLETED.
-- ---------------------------------------------------------------------------
