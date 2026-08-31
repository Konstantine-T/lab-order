-- ---------------------------------------------------------------------------
-- 0022 — Completion is the doctor's call, not the lab's.
--
-- Until now the lab set COMPLETED from its own status pills. Since COMPLETED is
-- terminal (every UPDATE policy on orders excludes it), that let the lab close
-- its own work and lock the doctor out of editing or objecting. Only the doctor
-- knows whether the case actually seated in the patient's mouth, so only the
-- doctor — or the clinic admin acting for them — gets to close it.
--
--   * complete_order(order)  SENT_TO_CLINIC | RECEIVED_BY_CLINIC -> COMPLETED
--   * reopen_order(order)    COMPLETED -> RECEIVED_BY_CLINIC
--
-- Both are SECURITY DEFINER for the same reason record_payment is: COMPLETED is
-- terminal, so no RLS policy can reach a completed row to reopen it. Keeping the
-- transitions in functions also means the legal moves live in one place instead
-- of being spread across three policies and the client.
--
-- The three UPDATE policies gain `status <> 'COMPLETED'` in their WITH CHECK, so
-- COMPLETED is now reachable *only* through complete_order. That also closes a
-- pre-existing hole: orders_doctor_update's WITH CHECK was just
-- `doctor_id = current_doctor_id()`, so a doctor could already PATCH their order
-- straight to COMPLETED from the browser — there was simply no button for it.
--
-- PLATFORM_ADMIN keeps orders_admin_all and is unaffected: it remains the
-- break-glass path for a case that gets stuck.
-- ---------------------------------------------------------------------------

-- ── Who closed it, and when ────────────────────────────────────────────────
-- Mirrors cancelled_at / cancelled_by_user_id. Worth recording now that closing
-- a case is a deliberate act by a named person rather than a lab bookkeeping
-- step: "the lab says it's done" and "the doctor accepted it" are different
-- claims and only the second one is billable-final.
alter table public.orders
  add column if not exists completed_at          timestamptz,
  add column if not exists completed_by_user_id  uuid references public.users(id);

-- ---------------------------------------------------------------------------
-- complete_order — the doctor accepts the delivered case.
--
-- Gated on the lab having actually shipped: completing a case that is still
-- IN_PROGRESS would strand the lab, which can no longer touch a terminal row.
-- Idempotent, because the button is one click and double-submits happen.
-- ---------------------------------------------------------------------------
create or replace function public.complete_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where id = p_order_id;
  if v_order.id is null then
    raise exception 'order_not_found';
  end if;
  if not public.can_act_for_doctor(v_order.doctor_id) then
    raise exception 'not_your_order';
  end if;

  -- Already closed: nothing to do, and re-stamping completed_at would lose the
  -- original acceptance time.
  if v_order.status = 'COMPLETED' then
    return;
  end if;
  if v_order.status = 'CANCELLED' then
    raise exception 'order_cancelled';
  end if;
  if v_order.status not in ('SENT_TO_CLINIC', 'RECEIVED_BY_CLINIC') then
    raise exception 'not_delivered_yet';
  end if;

  update public.orders
     set status               = 'COMPLETED',
         completed_at         = now(),
         completed_by_user_id = auth.uid()
   where id = p_order_id;
end;
$$;

grant execute on function public.complete_order(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- reopen_order — undo a misclick.
--
-- Returns to RECEIVED_BY_CLINIC (not SENT_TO_CLINIC): the case is demonstrably
-- with the clinic, since it had to be delivered to be completed at all. This is
-- the only way back out of a terminal status short of a platform admin.
-- ---------------------------------------------------------------------------
create or replace function public.reopen_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where id = p_order_id;
  if v_order.id is null then
    raise exception 'order_not_found';
  end if;
  if not public.can_act_for_doctor(v_order.doctor_id) then
    raise exception 'not_your_order';
  end if;
  if v_order.status <> 'COMPLETED' then
    raise exception 'order_not_completed';
  end if;

  update public.orders
     set status               = 'RECEIVED_BY_CLINIC',
         completed_at         = null,
         completed_by_user_id = null
   where id = p_order_id;
end;
$$;

grant execute on function public.reopen_order(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Close COMPLETED off from every direct UPDATE path.
--
-- USING clauses are unchanged — who may touch which rows is the same as before.
-- Only the WITH CHECK moves: no client role may *write* COMPLETED any more.
-- ---------------------------------------------------------------------------

-- Doctor (phase4-6.sql). The added WITH CHECK term is the hole-closing one.
drop policy if exists orders_doctor_update on public.orders;
create policy orders_doctor_update on public.orders
  for update to authenticated
  using (
    doctor_id = public.current_doctor_id()
    and status not in ('COMPLETED','CANCELLED')
  )
  with check (
    doctor_id = public.current_doctor_id()
    and status <> 'COMPLETED'
  );

-- Lab (phase4-6.sql). This is the substantive change the ticket asks for: the
-- lab can still drive the case all the way to SENT_TO_CLINIC, but not past it.
drop policy if exists orders_lab_update on public.orders;
create policy orders_lab_update on public.orders
  for update to authenticated
  using (
    public.current_user_owns_lab(lab_id)
    and status not in ('COMPLETED','CANCELLED')
  )
  with check (
    public.current_user_owns_lab(lab_id)
    and status <> 'COMPLETED'
  );

-- Clinic (0014, re-pointed at the helper in 0015). The clinic admin completes
-- through complete_order like the doctor does, not by direct write.
drop policy if exists orders_clinic_update on public.orders;
create policy orders_clinic_update on public.orders
  for update to authenticated
  using (
    status not in ('COMPLETED','CANCELLED')
    and public.doctor_in_admin_clinic(orders.doctor_id)
  )
  with check (
    public.doctor_in_admin_clinic(orders.doctor_id)
    and status <> 'COMPLETED'
  );
