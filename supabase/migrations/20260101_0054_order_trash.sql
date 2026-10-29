-- ---------------------------------------------------------------------------
-- 0054 — labs and doctors can delete finished orders, through a 14-day trash.
--
-- Trello SLXFiKPX. Owner decisions: the lab (its incoming orders) and the
-- doctor (their own orders) each delete only from their own desk, and the
-- other side is never affected; only COMPLETED or CANCELLED orders; a deleted
-- order sits in a trash for 14 days, restorable, then disappears from that
-- side for good, but the order itself stays in the database; finances count
-- trashed and deleted orders as before; the clinic admin still sees an order
-- its doctor deleted (since 0050: the admin of the ORDER's clinic,
-- orders.clinic_id, whose order reads never look at this table).
--
-- So this is not a deletion of data. It is a per-side "hide" with a 14-day
-- undo window. No order row, file, payment or notification is ever removed.
--
--   1. public.order_trash: one row per (order, side). side 'LAB' = the
--      order's lab, side 'DOCTOR' = the order's doctor profile, which also
--      covers a buying lab's purchases (0048: its buying profile is the
--      order's doctor).
--        * In the trash = a row with purge_after > now().
--        * Gone for good = a row with purge_after <= now().
--      No scheduled job: time alone moves a row from the trash to gone, and
--      "Delete now" only sets purge_after = now(). "Hidden from a side" is
--      ANY row of that side, in the trash or gone.
--      A table and not orders.lab_deleted_at / doctor_deleted_at: the other
--      side never learns that you deleted it (RLS below; a column would ride
--      along in every orders read and realtime event to the other party);
--      hiding does not touch orders (no updated_at churn, no realtime refetch
--      on the other side, nothing for the 0045 / 0046 / 0048 orders triggers
--      to see); and the doctors' column-blind UPDATE policy on orders cannot
--      reach it.
--
--   2. RLS: each side reads only its own rows (the lab its 'LAB' rows of
--      orders it owns, the doctor or buying profile its 'DOCTOR' rows of its
--      own orders). The clinic admin reads none, the platform admin needs no
--      policy (no admin tooling yet). No client writes at all: no INSERT /
--      UPDATE / DELETE grant and no write policy; the RPCs below are the only
--      writers.
--      An order is never both a lab's incoming order and its own purchase
--      (0048 refuses ordering from yourself and freezes lab_id / doctor_id),
--      so for any one order a caller sees at most one side's row. That is why
--      the client's list filter needs no side: add order_trash(id) to the
--      select and .is('order_trash', null).
--
--   3. RPCs, SECURITY DEFINER, authenticated only. The side is decided by the
--      caller, per order:
--        * the caller owns order.lab_id (current_user_owns_lab)   -> 'LAB';
--        * else order.doctor_id = current_doctor_id()             -> 'DOCTOR'.
--          Strictly the doctor or the buying profile, NOT
--          can_act_for_doctor nor can_act_for_order (0050): the admin of the
--          order's clinic cannot hide orders from the doctor or the lab;
--        * else, or the order does not exist                       -> not_your_order.
--      At most 200 ids per call (too_many), for all three; null / empty /
--      duplicate ids are fine. Any refusal refuses the whole call (the
--      statement rolls back).
--
--      trash_orders(ids) -> integer: every order must be COMPLETED or
--        CANCELLED (order_not_finished). Inserts the side's row, or refreshes
--        one still in the trash (deleted_at = now(), purge_after = now() +
--        14 days, deleted_by_user_id = auth.uid()). A row already gone stays
--        gone: trashing never revives a deleted order. Returns the rows
--        inserted or refreshed. The orders are read FOR SHARE, so a reopen
--        racing it either commits first (then the order reads as unfinished)
--        or waits and then clears the new row (4).
--      restore_orders(ids) -> integer: deletes the side's rows still in the
--        trash. A gone row raises trash_expired. An order with no row is
--        skipped (Undo twice, two tabs). Returns the rows deleted.
--      purge_trashed_orders(ids default null) -> integer ("Delete now" /
--        "Empty trash"): sets purge_after = now() on the side's rows still in
--        the trash; ids not in the trash are skipped. With null: every row in
--        the trash of EVERY side the caller holds. A lab owner who also buys
--        has two trashes (incoming orders, purchases), so the app always
--        passes the ids of the one trash it shows; null is for a caller with
--        one side.
--
--   4. An order that comes back to life. reopen_order (or a lab, or an admin)
--      can make a COMPLETED / CANCELLED order active again, and an active
--      order must never be hidden from the lab working on it or from its
--      doctor. AFTER UPDATE OF status, on the way out of COMPLETED /
--      CANCELLED into any other status, every order_trash row of the order
--      is deleted, both sides, gone ones too. SECURITY DEFINER (the caller
--      has no DELETE grant), and wrapped in an exception block that only
--      raises a WARNING: a trash problem never breaks the reopen.
--      It sits beside 0052's orders_status_history_update (also AFTER UPDATE
--      OF status, also warning-only). The two touch different tables and
--      neither reads the other's, so their order does not matter and a
--      failure in one never stops the other or the status change.
--
--   5. Realtime: order_trash joins the supabase_realtime publication (the
--      0043 block). Realtime applies the RLS above per subscriber to INSERT
--      and UPDATE, so a side hears only its own trash and restore-by-purge;
--      the client does not subscribe to DELETE (0043, J3), so a restore made
--      in another tab shows on that tab's next refetch.
--
-- Finances read orders through their own RPCs (_lab_receivables_rows,
-- clinic_payables_*), which know nothing of this table: unchanged. So are
-- notifications (no new kind; the bell may still list a deleted order's rows,
-- and opening one lands on the "deleted from your list" page).
--
-- Fully idempotent: create table / index if not exists, drop policy / trigger
-- if exists, create or replace, the publication block checks first.
-- ---------------------------------------------------------------------------


-- ── 1. The table ─────────────────────────────────────────────────────────

create table if not exists public.order_trash (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  side text not null check (side in ('LAB', 'DOCTOR')),
  deleted_at timestamptz not null default now(),
  purge_after timestamptz not null default now() + interval '14 days',
  deleted_by_user_id uuid references public.users(id) on delete set null,
  unique (order_id, side)
);
create index if not exists order_trash_order_idx on public.order_trash (order_id);

comment on table public.order_trash is
  'A side''s deleted orders (0054): side LAB = the order''s lab, DOCTOR = its doctor or buying profile. '
  'purge_after > now() = in the trash, else gone from that side for good. The order itself is never removed. '
  'Written only by trash_orders / restore_orders / purge_trashed_orders and the reopen trigger.';


-- ── 2. Who can read it ───────────────────────────────────────────────────

alter table public.order_trash enable row level security;

drop policy if exists order_trash_lab_read on public.order_trash;
create policy order_trash_lab_read on public.order_trash for select to authenticated
  using (side = 'LAB' and exists (select 1 from public.orders o
         where o.id = order_id and public.current_user_owns_lab(o.lab_id)));

drop policy if exists order_trash_doctor_read on public.order_trash;
create policy order_trash_doctor_read on public.order_trash for select to authenticated
  using (side = 'DOCTOR' and exists (select 1 from public.orders o
         where o.id = order_id and o.doctor_id = public.current_doctor_id()));

-- Supabase's default privileges grant every new table to anon and
-- authenticated in full; take all of it back, then give select only.
revoke all on public.order_trash from public, anon, authenticated;
grant select on public.order_trash to authenticated;


-- ── 3. RPCs ──────────────────────────────────────────────────────────────

-- The caller's side of one order, or null. Not for clients.
create or replace function public._order_trash_side(p_lab_id uuid, p_doctor_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when coalesce(public.current_user_owns_lab(p_lab_id), false) then 'LAB'
    when p_doctor_id is not null and p_doctor_id = public.current_doctor_id() then 'DOCTOR'
  end
$$;

revoke all on function public._order_trash_side(uuid, uuid) from public, anon, authenticated;


create or replace function public.trash_orders(p_order_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids   uuid[];
  v_order record;
  v_side  text;
  v_seen  integer := 0;
  v_rows  integer;
  v_n     integer := 0;
begin
  if cardinality(coalesce(p_order_ids, '{}'::uuid[])) > 200 then
    raise exception 'too_many' using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct x), '{}'::uuid[]) into v_ids
    from unnest(coalesce(p_order_ids, '{}'::uuid[])) as x
   where x is not null;
  if cardinality(v_ids) = 0 then
    return 0;
  end if;

  -- In id order, so two overlapping calls cannot deadlock; FOR SHARE, so a
  -- concurrent reopen cannot slip between the status check and the insert.
  for v_order in
    select o.id, o.lab_id, o.doctor_id, o.status
      from public.orders o
     where o.id = any (v_ids)
     order by o.id
       for share
  loop
    v_seen := v_seen + 1;
    v_side := public._order_trash_side(v_order.lab_id, v_order.doctor_id);
    if v_side is null then
      raise exception 'not_your_order' using errcode = '42501';
    end if;
    if v_order.status not in ('COMPLETED', 'CANCELLED') then
      raise exception 'order_not_finished' using errcode = '22023';
    end if;

    insert into public.order_trash as t (order_id, side, deleted_at, purge_after, deleted_by_user_id)
    values (v_order.id, v_side, now(), now() + interval '14 days', auth.uid())
    on conflict (order_id, side) do update
       set deleted_at         = excluded.deleted_at,
           purge_after        = excluded.purge_after,
           deleted_by_user_id = excluded.deleted_by_user_id
     -- A gone row stays gone.
     where t.purge_after > now();
    get diagnostics v_rows = row_count;
    v_n := v_n + v_rows;
  end loop;

  -- An id that matched no order: as for a stranger's, never "not found".
  if v_seen < cardinality(v_ids) then
    raise exception 'not_your_order' using errcode = '42501';
  end if;
  return v_n;
end;
$$;

revoke all on function public.trash_orders(uuid[]) from public, anon;
grant execute on function public.trash_orders(uuid[]) to authenticated;


create or replace function public.restore_orders(p_order_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids   uuid[];
  v_order record;
  v_side  text;
  v_purge timestamptz;
  v_seen  integer := 0;
  v_rows  integer;
  v_n     integer := 0;
begin
  if cardinality(coalesce(p_order_ids, '{}'::uuid[])) > 200 then
    raise exception 'too_many' using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct x), '{}'::uuid[]) into v_ids
    from unnest(coalesce(p_order_ids, '{}'::uuid[])) as x
   where x is not null;
  if cardinality(v_ids) = 0 then
    return 0;
  end if;

  for v_order in
    select o.id, o.lab_id, o.doctor_id
      from public.orders o
     where o.id = any (v_ids)
     order by o.id
  loop
    v_seen := v_seen + 1;
    v_side := public._order_trash_side(v_order.lab_id, v_order.doctor_id);
    if v_side is null then
      raise exception 'not_your_order' using errcode = '42501';
    end if;

    select t.purge_after into v_purge
      from public.order_trash t
     where t.order_id = v_order.id and t.side = v_side
       for update;
    if not found then
      continue;  -- not in the trash: restored already
    end if;
    if v_purge <= now() then
      raise exception 'trash_expired' using errcode = '22023';
    end if;

    delete from public.order_trash t
     where t.order_id = v_order.id and t.side = v_side and t.purge_after > now();
    get diagnostics v_rows = row_count;
    v_n := v_n + v_rows;
  end loop;

  if v_seen < cardinality(v_ids) then
    raise exception 'not_your_order' using errcode = '42501';
  end if;
  return v_n;
end;
$$;

revoke all on function public.restore_orders(uuid[]) from public, anon;
grant execute on function public.restore_orders(uuid[]) to authenticated;


create or replace function public.purge_trashed_orders(p_order_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids   uuid[];
  v_order record;
  v_side  text;
  v_seen  integer := 0;
  v_rows  integer;
  v_n     integer := 0;
begin
  -- Null: everything in the caller's trash, on every side it holds.
  if p_order_ids is null then
    update public.order_trash t
       set purge_after = now()
     where t.purge_after > now()
       and exists (
         select 1 from public.orders o
          where o.id = t.order_id
            and public._order_trash_side(o.lab_id, o.doctor_id) = t.side
       );
    get diagnostics v_n = row_count;
    return v_n;
  end if;

  if cardinality(p_order_ids) > 200 then
    raise exception 'too_many' using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct x), '{}'::uuid[]) into v_ids
    from unnest(p_order_ids) as x
   where x is not null;
  if cardinality(v_ids) = 0 then
    return 0;
  end if;

  for v_order in
    select o.id, o.lab_id, o.doctor_id
      from public.orders o
     where o.id = any (v_ids)
     order by o.id
  loop
    v_seen := v_seen + 1;
    v_side := public._order_trash_side(v_order.lab_id, v_order.doctor_id);
    if v_side is null then
      raise exception 'not_your_order' using errcode = '42501';
    end if;

    update public.order_trash t
       set purge_after = now()
     where t.order_id = v_order.id and t.side = v_side and t.purge_after > now();
    get diagnostics v_rows = row_count;
    v_n := v_n + v_rows;
  end loop;

  if v_seen < cardinality(v_ids) then
    raise exception 'not_your_order' using errcode = '42501';
  end if;
  return v_n;
end;
$$;

revoke all on function public.purge_trashed_orders(uuid[]) from public, anon;
grant execute on function public.purge_trashed_orders(uuid[]) to authenticated;


-- ── 4. A reopened order leaves both trashes ──────────────────────────────

create or replace function public.tg_order_trash_clear_on_reopen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    delete from public.order_trash where order_id = new.id;
  exception when others then
    -- Never break the reopen; the order then stays hidden from a side until
    -- the row is removed by hand, which the warning says.
    raise warning 'order_trash: could not clear the trash of reopened order % (% %)',
      new.id, sqlstate, sqlerrm;
  end;
  return null;
end $$;

drop trigger if exists orders_trash_clear_on_reopen on public.orders;
create trigger orders_trash_clear_on_reopen
  after update of status on public.orders
  for each row
  when (old.status in ('COMPLETED', 'CANCELLED')
        and new.status not in ('COMPLETED', 'CANCELLED'))
  execute function public.tg_order_trash_clear_on_reopen();

revoke all on function public.tg_order_trash_clear_on_reopen() from public, anon, authenticated;


-- ── 5. Realtime ──────────────────────────────────────────────────────────

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'publication supabase_realtime does not exist; enable Realtime for the project, then re-run this block';
    return;
  end if;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime' and puballtables) then
    return;  -- already publishes every table
  end if;
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'order_trash'
  ) then
    alter publication supabase_realtime add table public.order_trash;
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- Verify (every one should be true):
-- ---------------------------------------------------------------------------
--   select relrowsecurity from pg_class where oid = 'public.order_trash'::regclass;
--   select count(*) = 2 from pg_policies
--    where schemaname = 'public' and tablename = 'order_trash' and cmd = 'SELECT';
--   select has_table_privilege('authenticated', 'public.order_trash', 'select')
--      and not has_table_privilege('authenticated', 'public.order_trash', 'insert')
--      and not has_table_privilege('authenticated', 'public.order_trash', 'update')
--      and not has_table_privilege('authenticated', 'public.order_trash', 'delete')
--      and not has_table_privilege('anon', 'public.order_trash', 'select');
--   select bool_and(prosecdef) and count(*) = 3 from pg_proc
--    where oid in ('public.trash_orders(uuid[])'::regprocedure,
--                  'public.restore_orders(uuid[])'::regprocedure,
--                  'public.purge_trashed_orders(uuid[])'::regprocedure);
--   select has_function_privilege('authenticated', 'public.trash_orders(uuid[])', 'execute')
--      and not has_function_privilege('anon', 'public.trash_orders(uuid[])', 'execute')
--      and has_function_privilege('authenticated', 'public.restore_orders(uuid[])', 'execute')
--      and not has_function_privilege('anon', 'public.restore_orders(uuid[])', 'execute')
--      and has_function_privilege('authenticated', 'public.purge_trashed_orders(uuid[])', 'execute')
--      and not has_function_privilege('anon', 'public.purge_trashed_orders(uuid[])', 'execute')
--      and not has_function_privilege('authenticated', 'public._order_trash_side(uuid,uuid)', 'execute')
--      and not has_function_privilege('authenticated', 'public.tg_order_trash_clear_on_reopen()', 'execute');
--   select count(*) = 1 from pg_trigger
--    where tgrelid = 'public.orders'::regclass and tgname = 'orders_trash_clear_on_reopen';
--   select prosecdef from pg_proc where proname = 'tg_order_trash_clear_on_reopen';
--   -- beside 0052's history trigger, both enabled:
--   select count(*) = 2 from pg_trigger
--    where tgrelid = 'public.orders'::regclass and tgenabled = 'O'
--      and tgname in ('orders_status_history_update', 'orders_trash_clear_on_reopen');
--   select count(*) = 1 from pg_publication_tables
--    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'order_trash';
--
--   -- As the lab owner, in a transaction you roll back:
--   --   begin;
--   --   select set_config('request.jwt.claims', '{"sub":"<lab owner uuid>","role":"authenticated"}', true);
--   --   set local role authenticated;
--   --   select public.trash_orders(array['<its COMPLETED order>']::uuid[]);    -- 1
--   --   select public.trash_orders(array['<its IN_PROGRESS order>']::uuid[]);  -- order_not_finished
--   --   select public.trash_orders(array['<another lab''s order>']::uuid[]);  -- not_your_order
--   --   select count(*) from public.orders o where o.lab_id = '<its lab>'
--   --      and not exists (select 1 from public.order_trash t where t.order_id = o.id);
--   --                                    -- one fewer than before the trash call
--   --   select public.purge_trashed_orders(array['<its COMPLETED order>']::uuid[]); -- 1
--   --   select public.restore_orders(array['<its COMPLETED order>']::uuid[]);       -- trash_expired
--   --   rollback;
--   -- As that order's doctor, the same order is still in their list:
--   --   select count(*) from public.order_trash;   -- 0 rows of the lab's are readable
-- ---------------------------------------------------------------------------
