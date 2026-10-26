-- ---------------------------------------------------------------------------
-- 0052 — every status change of an order, who made it and when; and the
-- clinic (or the doctor) can mark a delivered order as received.
--
-- A. order_status_history
--    One row per status an order has had: the first (null → SUBMITTED) on
--    insert, then one per change. Written ONLY by the triggers below, never by
--    a client. Who made the change is read from auth.uid() at that moment,
--    which SECURITY DEFINER RPCs keep as the caller: complete_order,
--    reopen_order, cancel_order, mark_received_by_clinic and the status
--    restore after a doctor's edit (0030 / 0033) are all attributed to the
--    person whose action caused them. The actor's name is a snapshot (a later
--    rename does not rewrite history).
--
--    Actor, first match wins:
--      no auth.uid() (SQL editor, a job)              SYSTEM     no name
--      owns the order's lab                          LAB        labs.public_name
--      is the order's doctor, on a lab's purchase    BUYER_LAB  the buying lab (doctor_snapshot)
--      is the order's doctor                         DOCTOR     doctor_snapshot first + last
--      owns the ORDER's clinic (0050)                CLINIC     clinics.public_name
--      a platform admin                              ADMIN      no name
--      anyone else                                   SYSTEM     no name
--    A cancellation row carries the cancellation reason as its note.
--
--    NEVER BREAK THE WRITE (0043): the trigger body sits in its own exception
--    block; a history bug only raises a warning and the status change stands.
--
--    Readable by exactly who can read the order: the policy's subquery runs
--    under the reader's own orders policies (its doctor, its lab, the admin of
--    the order's clinic, a platform admin). No client writes.
--
--    BACKFILL. Earlier steps of existing orders cannot be reconstructed. For an
--    order with no history yet, only what is known goes in, marked
--    backfilled: its creation (created_at), its completion (completed_at, by
--    completed_by_user_id) and its cancellation (cancelled_at, by
--    cancelled_by_user_id, with the reason). The client says so under such a
--    list.
--
-- B. mark_received_by_clinic(order)
--    RECEIVED_BY_CLINIC already exists (status enum, COMPLETABLE_STATUSES, the
--    pipeline), but nothing could set it except reopen_order. Optional: the
--    doctor can still complete straight from SENT_TO_CLINIC. Allowed to the
--    order's doctor and the admin of the order's clinic (can_act_for_order,
--    0050: a doctor without a clinic needs it too; a lab's buying profile is
--    the order's doctor). No notification (owner, J3): the lab sees it in the
--    status and the history.
--
-- Needs 0050 (orders.clinic_id, can_act_for_order). Fully idempotent.
-- ---------------------------------------------------------------------------


-- ── 1. The table ─────────────────────────────────────────────────────────

create table if not exists public.order_status_history (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid not null references public.orders(id) on delete cascade,
  from_status        public.order_status,          -- null for the first row
  to_status          public.order_status not null,
  changed_at         timestamptz not null default now(),
  changed_by_user_id uuid references public.users(id) on delete set null,
  actor_role         text not null check (actor_role in ('LAB','DOCTOR','BUYER_LAB','CLINIC','ADMIN','SYSTEM')),
  actor_name         text,                          -- snapshot at the time
  note               text,                          -- the cancellation reason, on a CANCELLED row
  backfilled         boolean not null default false
);
create index if not exists order_status_history_order_idx
  on public.order_status_history (order_id, changed_at);

comment on table public.order_status_history is
  'Every status an order has had, who set it and when (0052). Written only by triggers on orders.';


-- ── 2. Who made the change ───────────────────────────────────────────────
-- Shared by the trigger (p_user = auth.uid()) and the backfill (p_user = the
-- recorded placer / completer / canceller).

create or replace function public._order_status_actor(
  p_order public.orders,
  p_user  uuid,
  out actor_role text,
  out actor_name text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_doctor_user uuid;
begin
  if p_user is null then
    actor_role := 'SYSTEM';
    return;
  end if;

  if exists (select 1 from public.labs l where l.id = p_order.lab_id and l.owner_user_id = p_user) then
    actor_role := 'LAB';
    select nullif(btrim(l.public_name), '') into actor_name from public.labs l where l.id = p_order.lab_id;
    return;
  end if;

  select dp.user_id into v_doctor_user from public.doctor_profiles dp where dp.id = p_order.doctor_id;
  if v_doctor_user is not null and v_doctor_user = p_user then
    if coalesce(p_order.doctor_snapshot ->> 'is_lab', '') = 'true' then
      -- 0048: "the doctor" of a purchase is the buying lab.
      actor_role := 'BUYER_LAB';
      actor_name := nullif(btrim(p_order.doctor_snapshot ->> 'first_name'), '');
    else
      actor_role := 'DOCTOR';
      actor_name := nullif(btrim(concat_ws(' ',
                      p_order.doctor_snapshot ->> 'first_name',
                      p_order.doctor_snapshot ->> 'last_name')), '');
    end if;
    return;
  end if;

  if p_order.clinic_id is not null
     and exists (select 1 from public.clinics c
                  where c.id = p_order.clinic_id and c.owner_user_id = p_user) then
    actor_role := 'CLINIC';
    select nullif(btrim(c.public_name), '') into actor_name from public.clinics c where c.id = p_order.clinic_id;
    return;
  end if;

  if exists (select 1 from public.users u where u.id = p_user and u.role = 'PLATFORM_ADMIN') then
    actor_role := 'ADMIN';
    return;
  end if;

  actor_role := 'SYSTEM';
end $$;


-- ── 3. The trigger ───────────────────────────────────────────────────────

create or replace function public.tg_order_status_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_actor record;
  v_from  public.order_status;
begin
  begin
    if tg_op = 'UPDATE' then
      v_from := old.status;
    end if;
    select * into v_actor from public._order_status_actor(new, v_uid);
    insert into public.order_status_history (
      order_id, from_status, to_status, changed_by_user_id, actor_role, actor_name, note
    ) values (
      new.id, v_from, new.status, v_uid, v_actor.actor_role, v_actor.actor_name,
      case when new.status = 'CANCELLED'
           then nullif(btrim(coalesce(new.cancellation_reason, '')), '') end
    );
  exception when others then
    raise warning 'order_status_history (order %): %', new.id, sqlerrm;
  end;
  return null;
end $$;

drop trigger if exists orders_status_history_insert on public.orders;
create trigger orders_status_history_insert
  after insert on public.orders
  for each row execute function public.tg_order_status_history();

drop trigger if exists orders_status_history_update on public.orders;
create trigger orders_status_history_update
  after update of status on public.orders
  for each row
  when (old.status is distinct from new.status)
  execute function public.tg_order_status_history();


-- ── 4. Backfill ──────────────────────────────────────────────────────────
-- One statement, so "has no history yet" is judged once, before any of the
-- three kinds of row goes in; a replay finds every order covered and adds
-- nothing.

insert into public.order_status_history (
  order_id, from_status, to_status, changed_at, changed_by_user_id,
  actor_role, actor_name, note, backfilled
)
select k.order_id, null, k.to_status, k.changed_at, k.user_id,
       a.actor_role, a.actor_name, k.note, true
  from public.orders o
  cross join lateral (
    -- Created: by whoever placed it (0043), else by the order's doctor.
    select o.id as order_id, 'SUBMITTED'::public.order_status as to_status, o.created_at as changed_at,
           coalesce(o.placed_by_user_id,
                    (select dp.user_id from public.doctor_profiles dp where dp.id = o.doctor_id)) as user_id,
           null::text as note
    union all
    -- Completed (0022).
    select o.id, 'COMPLETED', o.completed_at, o.completed_by_user_id, null
     where o.completed_at is not null
    union all
    -- Cancelled (0045 stamps both).
    select o.id, 'CANCELLED', o.cancelled_at, o.cancelled_by_user_id,
           nullif(btrim(coalesce(o.cancellation_reason, '')), '')
     where o.cancelled_at is not null
  ) k
  cross join lateral public._order_status_actor(o, k.user_id) a
 where not exists (select 1 from public.order_status_history h where h.order_id = o.id);


-- ── 5. Who reads it ──────────────────────────────────────────────────────

alter table public.order_status_history enable row level security;

drop policy if exists order_status_history_read on public.order_status_history;
create policy order_status_history_read on public.order_status_history
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_status_history.order_id));

-- Supabase's default privileges grant writes on a new table (the 0039 lesson).
revoke all on public.order_status_history from public, anon, authenticated;
grant select on public.order_status_history to authenticated;


-- ── 6. Received at the clinic ────────────────────────────────────────────

create or replace function public.mark_received_by_clinic(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then
    raise exception 'order_not_found';
  end if;
  -- The order's doctor (or a lab's buying profile), or the admin of the
  -- order's clinic (0050).
  if not public.can_act_for_order(v_order.doctor_id, v_order.clinic_id) then
    raise exception 'not_your_order' using errcode = '42501';
  end if;
  if v_order.status = 'RECEIVED_BY_CLINIC' then
    return;
  end if;
  if v_order.status <> 'SENT_TO_CLINIC' then
    -- The lab moved it back meanwhile.
    raise exception 'not_sent_to_clinic' using errcode = '55000';
  end if;

  update public.orders
     set status     = 'RECEIVED_BY_CLINIC',
         updated_at = now()
   where id = p_order_id;
end $$;


-- ── 7. Privileges ────────────────────────────────────────────────────────

revoke all on function public._order_status_actor(public.orders, uuid) from public, anon, authenticated;
revoke all on function public.tg_order_status_history() from public, anon, authenticated;
revoke all on function public.mark_received_by_clinic(uuid) from public, anon;
grant execute on function public.mark_received_by_clinic(uuid) to authenticated;


-- ── 8. Realtime ──────────────────────────────────────────────────────────
-- The history dialog follows the other side's changes. Realtime applies the
-- policy above per subscriber.

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'publication supabase_realtime does not exist; enable Realtime for the project, then re-run this block';
    return;
  end if;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime' and puballtables) then
    return;
  end if;
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public'
                    and tablename = 'order_status_history') then
    alter publication supabase_realtime add table public.order_status_history;
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- Verify (each should hold):
-- ---------------------------------------------------------------------------
--   -- 1. Every order has a history (0 rows):
--   select o.id from public.orders o
--    where not exists (select 1 from public.order_status_history h where h.order_id = o.id);
--
--   -- 2. Read-only to clients, readable only when signed in (t | f | f | f):
--   select has_table_privilege('authenticated', 'public.order_status_history', 'select'),
--          has_table_privilege('authenticated', 'public.order_status_history', 'insert'),
--          has_table_privilege('authenticated', 'public.order_status_history', 'delete'),
--          has_table_privilege('anon', 'public.order_status_history', 'select');
--
--   -- 3. Triggers in place (2) and the RPC callable by a signed-in user only (t | f):
--   select count(*) from pg_trigger
--    where tgname in ('orders_status_history_insert', 'orders_status_history_update');
--   select has_function_privilege('authenticated', 'public.mark_received_by_clinic(uuid)', 'execute'),
--          has_function_privilege('anon', 'public.mark_received_by_clinic(uuid)', 'execute');
--
--   -- 4. A history bug never blocks a status change (in a transaction):
--   --   begin;
--   --   alter table public.order_status_history rename to order_status_history_x;
--   --   update public.orders set status = 'IN_PROGRESS' where id = '<an order>';  -- succeeds, WARNING
--   --   rollback;
--
--   -- 5. The newest rows:
--   --   select order_id, from_status, to_status, actor_role, actor_name, changed_at, backfilled
--   --     from public.order_status_history order by changed_at desc limit 20;
-- ---------------------------------------------------------------------------
