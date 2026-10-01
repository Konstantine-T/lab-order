-- ---------------------------------------------------------------------------
-- 0041 — the clinic admin sees the order's lab team and its Telegram link,
--        exactly as the doctor does.
--
-- MISSING ACCESS. Owner-approved.
--
-- THE GAP
--   A clinic admin opens an order placed by (or for) one of the clinic's
--   doctors at /clinic/orders/<id>. ClinicOrderDetailPage renders the same
--   OrderDetailView as the doctor's page and already calls both RPCs through
--   useOrderContacts:
--
--     supabase.rpc('get_order_staff', { p_order_id })   -- "Lab team" names
--     supabase.rpc('get_order_chat',  { p_order_id })   -- "Open chat" button
--
--   Both come back as [] for the clinic admin, so the stepper's team line, the
--   lab card's names and the Telegram button never appear; the doctor sees all
--   three on the same order. The RPCs' participant check (0012, the only
--   definition of either function — no later migration, bundle or loose
--   supabase/*.sql file redefines them) predates the clinic-doctor link
--   (doctor_profiles.clinic_id, 0013) and knows three callers only:
--
--     o.doctor_id = public.current_doctor_id()     -- NULL for a clinic admin
--     or public.current_user_owns_lab(o.lab_id)    -- false
--     or public.current_user_role() = 'PLATFORM_ADMIN'   -- false
--
--   The rest of that screen — the order row, answers, patient, lineage, files,
--   clarifications, edit, complete/reopen, cancel, invoice — already admits
--   the clinic admin through can_act_for_doctor (0014/0036) or the 0015 clinic
--   policies. These two RPCs were left behind.
--
-- THE FIX
--   Re-create both functions with one more participant case:
--
--     or coalesce(public.can_act_for_doctor(o.doctor_id), false)
--
--   can_act_for_doctor (0014, made NULL-safe in 0036) is the single "may act
--   for this doctor" predicate: true for the doctor themselves, and for the
--   admin of the clinic the doctor is CURRENTLY linked to (doctor_profiles.
--   clinic_id — the same link orders_clinic_select / doctor_in_admin_clinic
--   use, so the RPCs open to exactly the clinic admins who can already read
--   the order). It is SECURITY DEFINER, so the doctor_profiles lookup is not
--   blocked by RLS (the 0015 bug).
--
--   The coalesce is 0036's lesson applied on the spot: 0036 already coalesces
--   inside the predicate, but replaying 0014 after it would bring the NULL
--   back. Here NULL would fail CLOSED anyway (it sits in a WHERE clause, not an
--   `if not ...` guard), so the coalesce only makes that explicit — it can
--   never widen access.
--
-- WHAT THE CLINIC ADMIN GETS — the doctor's view, not the lab's
--   Neither function has a per-role branch: every admitted caller receives the
--   same, already doctor-safe columns.
--
--     get_order_staff -> staff_id, first_name, last_name, assigned_at
--                        (names only — never lab_staff.phone / email /
--                        telegram_user_id)
--     get_order_chat  -> order_id, invite_link
--                        (never telegram_chat_id / unadded_members, which
--                        carries staff phones)
--
--   The lab's fuller view (phones, unadded_members) is direct table access
--   under lab_staff_owner_all / order_chats_lab_select (0012), which this
--   migration does not touch — the clinic admin still has no policy on
--   lab_staff, order_staff_assignments or order_chats.
--
-- UNCHANGED
--   Signatures, RETURNS TABLE column names/types/order, language sql, stable,
--   SECURITY DEFINER, search_path = public, the get_order_staff ORDER BY, and
--   the three existing participant cases, character for character.
--   No GRANT / REVOKE: 0012 relied on the schema's default EXECUTE privileges
--   and `create or replace` keeps the existing ACL. An anon caller still gets
--   [] (auth.uid() is NULL, so every case is false/NULL).
--
-- Fully idempotent — safe to re-run.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Doctor-safe chat read: invite link only (never phones / telegram_chat_id /
-- unadded_members), gated to the order's participants.
-- ---------------------------------------------------------------------------
create or replace function public.get_order_chat(p_order_id uuid)
returns table (order_id uuid, invite_link text)
language sql
stable
security definer
set search_path = public
as $$
  select c.order_id, c.invite_link
  from public.order_chats c
  join public.orders o on o.id = c.order_id
  where c.order_id = p_order_id
    and (
      o.doctor_id = public.current_doctor_id()
      or public.current_user_owns_lab(o.lab_id)
      or public.current_user_role() = 'PLATFORM_ADMIN'
      -- 0041: the clinic admin of the order's doctor — same doctor-safe row.
      or coalesce(public.can_act_for_doctor(o.doctor_id), false)
    );
$$;

-- ---------------------------------------------------------------------------
-- Doctor-safe staff read: names only (no phone/email), gated to participants.
-- ---------------------------------------------------------------------------
create or replace function public.get_order_staff(p_order_id uuid)
returns table (staff_id uuid, first_name text, last_name text, assigned_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.first_name, s.last_name, a.assigned_at
  from public.order_staff_assignments a
  join public.lab_staff s on s.id = a.staff_id
  join public.orders o on o.id = a.order_id
  where a.order_id = p_order_id
    and (
      o.doctor_id = public.current_doctor_id()
      or public.current_user_owns_lab(o.lab_id)
      or public.current_user_role() = 'PLATFORM_ADMIN'
      -- 0041: the clinic admin of the order's doctor — same names-only rows.
      or coalesce(public.can_act_for_doctor(o.doctor_id), false)
    )
  order by a.assigned_at;
$$;

-- ---------------------------------------------------------------------------
-- Verify:
-- ---------------------------------------------------------------------------
--   -- 1. Both are the new bodies, still SECURITY DEFINER with the pinned
--   --    search_path, and the result shapes did not move
--   --    (expect 2 rows, prosecdef = true, proconfig = {search_path=public}):
--   select proname, prosecdef, proconfig,
--          pg_get_function_result(oid) as returns,
--          prosrc like '%can_act_for_doctor(o.doctor_id), false)%' as has_0041
--     from pg_proc
--    where pronamespace = 'public'::regnamespace
--      and proname in ('get_order_staff', 'get_order_chat');
--   --   get_order_chat  | TABLE(order_id uuid, invite_link text)
--   --   get_order_staff | TABLE(staff_id uuid, first_name text, last_name text,
--   --                           assigned_at timestamp with time zone)
--
--   -- 2. Pick an order whose doctor is linked to a clinic and that has staff
--   --    assigned and an order_chats row:
--   select o.id, o.order_code, dp.clinic_id, cl.owner_user_id as clinic_admin
--     from public.orders o
--     join public.doctor_profiles dp on dp.id = o.doctor_id
--     join public.clinics cl on cl.id = dp.clinic_id
--    where exists (select 1 from public.order_staff_assignments a where a.order_id = o.id)
--      and exists (select 1 from public.order_chats c where c.order_id = o.id)
--    limit 5;
--
--   -- 3. As that clinic admin, in a transaction you roll back:
--   --      begin;
--   --      select set_config('request.jwt.claims', '{"sub":"<clinic_admin>"}', true);
--   --      set local role authenticated;
--   --      select * from public.get_order_staff('<order id>');  -- the names
--   --      select * from public.get_order_chat('<order id>');   -- 1 row, link
--   --      select * from public.order_chats where order_id = '<order id>';
--   --      -- still 0 rows: no table access, so no phones / unadded_members
--   --      select * from public.lab_staff limit 1;              -- still 0 rows
--   --      rollback;
--
--   -- 4. Negative, same pattern:
--   --    * the admin of a DIFFERENT clinic (or any clinic admin on an order
--   --      whose doctor is not linked to their clinic): both RPCs return 0 rows;
--   --    * a lab owner on another lab's order: 0 rows;
--   --    * no claims at all (anon): 0 rows.
--
--   -- 5. Unchanged for the doctor, the order's lab owner and a platform admin:
--   --    the same rows as before this migration.
--
--   -- 6. From the app: /clinic/orders/<that order> shows the lab team on the
--   --    stepper and the lab card, and the "Open chat" button (the phone's
--   --    bottom bar on mobile).
-- ---------------------------------------------------------------------------
