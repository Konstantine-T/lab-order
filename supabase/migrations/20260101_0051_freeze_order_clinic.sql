-- ---------------------------------------------------------------------------
-- 0051 — orders.clinic_id really is frozen for clients.
--
-- 0050's tg_orders_clinic_frozen let an ON DELETE SET NULL through first
-- ("the clinic row is gone") and refused client writes only after that. The
-- function is not SECURITY DEFINER, so the existence check ran as the caller,
-- and a doctor or a lab cannot read `clinics` (0011: owner and platform admin
-- only). To them every clinic looked deleted, so
--
--   update orders set clinic_id = null where id = <a clinic order>
--
-- by the order's doctor (a member or not) or by its lab went through, and
-- took the order out of the clinic's list, payables, notifications and rights.
-- Found by an executed test of 0050 (two clinics, one doctor).
--
-- The fix: refuse a client first. The FK's SET NULL runs as the table owner,
-- not as a client, so it still reaches the existence check and passes.
-- 0050 carries the same body now, so a replay of it does not undo this.
--
-- Fully idempotent — safe to re-run.
-- ---------------------------------------------------------------------------

create or replace function public.tg_orders_clinic_frozen()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- No client ever moves an order between clinics, or out of one.
  if current_user in ('anon', 'authenticated') then
    raise exception 'order_parties_read_only' using errcode = '42501';
  end if;
  -- The FK's ON DELETE SET NULL, once the clinic row is gone.
  if new.clinic_id is null
     and not exists (select 1 from public.clinics c where c.id = old.clinic_id) then
    return new;
  end if;
  -- Set once by definer code (the submit RPCs, 0050's backfill), then frozen.
  if old.clinic_id is null then
    return new;
  end if;
  new.clinic_id := old.clinic_id;
  return new;
end $$;

revoke all on function public.tg_orders_clinic_frozen() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Verify (in a transaction you roll back):
-- ---------------------------------------------------------------------------
--   -- As the doctor of a clinic order (or its lab's owner):
--   --   begin;
--   --   select set_config('request.jwt.claims', '{"sub":"<their user uuid>","role":"authenticated"}', true);
--   --   set local role authenticated;
--   --   update public.orders set clinic_id = null where id = '<a clinic order>';
--   --   -- ERROR: order_parties_read_only
--   --   rollback;
--   -- As postgres, deleting a clinic still clears its orders' clinic_id:
--   --   begin; delete from public.clinics where id = '<a test clinic>';
--   --   select count(*) from public.orders where clinic_id = '<that clinic>';  -- 0
--   --   rollback;
-- ---------------------------------------------------------------------------
