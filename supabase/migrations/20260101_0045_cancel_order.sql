-- ---------------------------------------------------------------------------
-- 0045 — the doctor can cancel an order until the lab accepts it.
--
-- Trello eL9rOYex. "Not accepted yet" means status SUBMITTED: the moment the
-- lab moves the order on (RECEIVED, a question, anything), the doctor talks to
-- the lab instead. The clinic admin acting for a doctor gets the same rule;
-- until now the clinic page cancelled at any stage with a direct PATCH.
--
-- 1a. cancel_order(order, reason) — the only way the doctor side changes a
--     status by hand. SECURITY DEFINER, locks the row FOR UPDATE so a lab
--     accepting at the same instant cannot race it, and raises short codes
--     the client translates (order_not_found, not_your_order,
--     order_already_accepted, reason_too_long). Cancelling an order that is
--     already CANCELLED returns quietly (double clicks, two tabs).
--
-- 1b. A SECURITY FIX: orders_doctor_update and orders_clinic_update (0022)
--     only forbid writing COMPLETED, so a doctor or clinic admin could PATCH
--     the status of their own non-terminal order to anything else:
--     CANCELLED at any stage, but also IN_PROGRESS, READY_FOR_DELIVERY,
--     SENT_TO_CLINIC, statuses only the lab should set (0033 already found
--     one escalation through this looseness). A BEFORE UPDATE OF status
--     trigger now refuses a status change made by a client request
--     (current_user anon / authenticated) unless the caller owns the order's
--     lab or is a platform admin. Inside a SECURITY DEFINER function
--     current_user is the function's owner, so every definer path passes
--     untouched, the 0037 pattern. The trigger function is deliberately NOT
--     SECURITY DEFINER, or current_user would be the owner here too.
--     Definer paths that change orders.status, enumerated from the
--     migrations (pg_proc bodies that UPDATE orders, plus the triggers):
--       complete_order, reopen_order (0022);
--       request_clarification (0029, 0033);
--       request_doctor_input (0030);
--       close_doctor_input_on_edit, the order_edits trigger that edit_order
--         fires to restore the status after NEEDS_DOCTOR_INPUT (0030, 0033);
--       cancel_order (here).
--     answer_clarification, record_payment, acknowledge/replace_order_invoice,
--     release_doctor_input_request and edit_order itself write orders but not
--     its status; submit_order / clinic_submit_order INSERT, which this
--     trigger does not see. The doctor-side app never wrote status directly
--     except the clinic page's cancel, which now calls cancel_order.
--     Nothing here keys on the role DOCTOR or on doctor_profiles: a later
--     "buying lab" profile (hc61AYfA) is refused a direct write exactly like
--     a doctor (it does not own the selling lab) and cancels through
--     cancel_order via can_act_for_doctor.
--
-- 1c. Stamp every cancellation. cancelled_at / cancelled_by_user_id existed
--     but nothing set them (0043 had to fall back on auth.uid()). A BEFORE
--     UPDATE OF status trigger fills them on the transition into CANCELLED,
--     by whatever route: cancel_order, the lab's cancel on the order sheet, a
--     platform admin. For a client request the time is always now() and the
--     user is always auth.uid(), so neither can be forged; for SQL-editor
--     maintenance (no JWT) values written in the same statement are kept.
--     Later updates of a cancelled order never touch them.
--
-- The RLS policies are left as they are: the trigger is the rule, and the
-- doctor side still edits non-status columns of its orders through them.
-- 0043's orders_notify_status sends order_cancelled_by_doctor to the lab when
-- auth.uid() is the doctor or their clinic admin; no notification change.
--
-- Fully idempotent — safe to re-run.
-- ---------------------------------------------------------------------------


-- ── 1a. cancel_order ─────────────────────────────────────────────────────

create or replace function public.cancel_order(
  p_order_id uuid,
  p_reason   text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order  public.orders%rowtype;
  v_reason text;
begin
  -- FOR UPDATE: a lab moving the order to RECEIVED at the same moment either
  -- commits first (we then read RECEIVED and refuse) or waits for us.
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then
    raise exception 'order_not_found';
  end if;
  -- can_act_for_doctor coalesces to false (0036), so `not` always fires for
  -- a stranger, an anonymous caller or a null doctor_id.
  if not public.can_act_for_doctor(v_order.doctor_id) then
    raise exception 'not_your_order' using errcode = '42501';
  end if;
  if v_order.status = 'CANCELLED' then
    return;
  end if;
  if v_order.status <> 'SUBMITTED' then
    raise exception 'order_already_accepted';
  end if;

  -- Trim whitespace of every kind, not only spaces; empty becomes null.
  v_reason := nullif(regexp_replace(coalesce(p_reason, ''), '^\s+|\s+$', '', 'g'), '');
  if char_length(v_reason) > 1000 then
    raise exception 'reason_too_long' using errcode = '22023';
  end if;

  update public.orders
     set status               = 'CANCELLED',
         cancellation_reason  = v_reason,
         cancelled_at         = now(),
         cancelled_by_user_id = auth.uid(),
         updated_at           = now()
   where id = p_order_id;
end;
$$;

-- Supabase's default privileges grant EXECUTE to anon (the 0039 lesson).
revoke all on function public.cancel_order(uuid, text) from public, anon;
grant execute on function public.cancel_order(uuid, text) to authenticated;


-- ── 1b. Only the lab, a platform admin or definer code changes a status ──

create or replace function public.tg_cancel_order_status_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- coalesce both helpers: a NULL must refuse, not fall through (0036).
  if current_user in ('anon', 'authenticated')
     and not coalesce(public.current_user_owns_lab(new.lab_id), false)
     and coalesce(public.current_user_role()::text, '') <> 'PLATFORM_ADMIN' then
    raise exception 'status_change_not_allowed' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists orders_cancel_status_guard on public.orders;
create trigger orders_cancel_status_guard
  before update of status on public.orders
  for each row
  when (new.status is distinct from old.status)
  execute function public.tg_cancel_order_status_guard();


-- ── 1c. Stamp who cancelled and when ─────────────────────────────────────

create or replace function public.tg_cancel_order_stamp()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated') or new.cancelled_at is null then
    new.cancelled_at := now();
  end if;
  new.cancelled_by_user_id := coalesce(auth.uid(), new.cancelled_by_user_id);
  return new;
end $$;

drop trigger if exists orders_cancel_stamp on public.orders;
create trigger orders_cancel_stamp
  before update of status on public.orders
  for each row
  when (new.status = 'CANCELLED' and old.status is distinct from 'CANCELLED')
  execute function public.tg_cancel_order_stamp();

-- Neither trigger function is meant to be called directly.
revoke all on function public.tg_cancel_order_status_guard() from public, anon, authenticated;
revoke all on function public.tg_cancel_order_stamp() from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- Verify (every one should be true):
-- ---------------------------------------------------------------------------
--   select count(*) = 1 from pg_proc
--    where oid = to_regprocedure('public.cancel_order(uuid,text)') and prosecdef;
--   select has_function_privilege('authenticated', 'public.cancel_order(uuid,text)', 'execute')
--      and not has_function_privilege('anon', 'public.cancel_order(uuid,text)', 'execute');
--   select count(*) = 2 from pg_trigger
--    where tgrelid = 'public.orders'::regclass
--      and tgname in ('orders_cancel_status_guard', 'orders_cancel_stamp');
--   -- the guard must NOT be SECURITY DEFINER (current_user would be its owner):
--   select not prosecdef from pg_proc where proname = 'tg_cancel_order_status_guard';
--
--   -- As the order's doctor, in a transaction you roll back:
--   --   begin;
--   --   select set_config('request.jwt.claims', '{"sub":"<doctor uuid>"}', true);
--   --   set local role authenticated;
--   --   update public.orders set status = 'READY_FOR_DELIVERY'
--   --    where id = '<their SUBMITTED order>';     -- raises status_change_not_allowed
--   --   select public.cancel_order('<their RECEIVED order>');  -- order_already_accepted
--   --   select public.cancel_order('<another doctor''s order>'); -- not_your_order
--   --   select public.cancel_order('<their SUBMITTED order>', '  changed my mind ');
--   --   select status, cancellation_reason, cancelled_at is not null,
--   --          cancelled_by_user_id = '<doctor uuid>'
--   --     from public.orders where id = '<their SUBMITTED order>';
--   --   -- CANCELLED | changed my mind | t | t
--   --   rollback;
--
--   -- As the lab owner, the sheet's cancel is still a direct PATCH, and is now
--   -- stamped:
--   --   begin;
--   --   select set_config('request.jwt.claims', '{"sub":"<lab owner uuid>"}', true);
--   --   set local role authenticated;
--   --   update public.orders set status = 'CANCELLED', cancellation_reason = 'x'
--   --    where id = '<an order of their lab>';
--   --   select cancelled_at is not null, cancelled_by_user_id = '<lab owner uuid>'
--   --     from public.orders where id = '<an order of their lab>';   -- t | t
--   --   rollback;
-- ---------------------------------------------------------------------------
