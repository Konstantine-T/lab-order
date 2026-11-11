-- ---------------------------------------------------------------------------
-- 0059: doctors and clinic admins write orders only through RPCs.
--
-- orders_doctor_update (0022) and orders_clinic_update (0050) let the order's
-- doctor, and the admin of its clinic, UPDATE any column of their own open
-- orders straight through PostgREST. The triggers guard some columns (status
-- 0045, parties 0048, clinic_id 0050/0051, placed_by 0043, the price note
-- 0046) but not the rest: a doctor could set paid_total / payment_status (the
-- lab's books), final_total, has_unreviewed_edits (hide an edit from the lab),
-- the snapshots, the due dates.
--
-- Nothing needs them. The app never updates orders from the doctor's or the
-- clinic's side: every change there (edit_order, complete_order,
-- reopen_order, cancel_order, answer_clarification, acknowledge_order_invoice,
-- mark_received_by_clinic) is a SECURITY DEFINER RPC, which RLS does not
-- apply to, and no trigger updates orders as the invoker. So both policies
-- are dropped; with no UPDATE policy left for them, a direct write by a
-- doctor or a clinic admin matches no row. The lab's own policy
-- (orders_lab_update) and a platform admin's are untouched.
--
-- REPLAY ORDER: 0014, 0015, 0022, 0050 and phase4-6.sql recreate these
-- policies. Re-run this file after replaying any of them. Idempotent.
-- ---------------------------------------------------------------------------

drop policy if exists orders_doctor_update on public.orders;
drop policy if exists orders_clinic_update on public.orders;


-- ---------------------------------------------------------------------------
-- Verify (every one should be true):
-- ---------------------------------------------------------------------------
--   select count(*) = 0 from pg_policies
--    where schemaname = 'public' and tablename = 'orders'
--      and policyname in ('orders_doctor_update', 'orders_clinic_update');
--
--   -- What is left for UPDATE on orders: the lab's (and an admin's) only.
--   select policyname, qual from pg_policies
--    where schemaname = 'public' and tablename = 'orders' and cmd in ('UPDATE', 'ALL');
--
--   -- As a doctor, in a transaction you roll back: no row is updated.
--   --   begin;
--   --   select set_config('request.jwt.claims', '{"sub":"<doctor user uuid>"}', true);
--   --   set local role authenticated;
--   --   update public.orders set paid_total = 999 where id = '<one of their open orders>';
--   --                                              -- UPDATE 0
--   --   rollback;
-- ---------------------------------------------------------------------------
