-- ---------------------------------------------------------------------------
-- 0036 — can_act_for_doctor returned NULL, and every guard read that as "yes".
--
-- PRIVILEGE ESCALATION. Found while checking that only the doctor can set
-- COMPLETED.
--
-- THE BUG
--   The predicate (0014) is:
--
--     select p_doctor_id is not null
--       and ( p_doctor_id = public.current_doctor_id()
--             or ( public.current_admin_clinic_id() is not null and exists (...) ) );
--
--   For a caller who is neither a doctor nor a clinic admin — every lab owner,
--   every platform admin — `current_doctor_id()` is NULL, so:
--
--     p_doctor_id = NULL            -> NULL
--     NULL or false                 -> NULL        (three-valued logic)
--     true and NULL                 -> NULL
--
--   so the function returns NULL rather than false. Every caller guards with
--
--     if not public.can_act_for_doctor(...) then raise exception 'not_your_order';
--
--   and `not NULL` is NULL, which is not true, so the IF body never runs and
--   the guard falls through. The check reads as if it fires and never does.
--
--   Reproduced on dev as the lab owner of ORD-1068 (denslaboratory@outlook.com),
--   whose doctor is a different person:
--
--     auth.uid() = the lab owner, current_user = authenticated
--     can_act_for_doctor(<that order's doctor>) = NULL
--     complete_order(ORD-1068): no error, SENT_TO_CLINIC -> COMPLETED
--
--   That is the exact thing 0022 exists to prevent ("closing a case is the
--   doctor's call"). The lab has no button for it, and the RLS policies do
--   block a direct UPDATE — verified, `new row violates row-level security
--   policy` — but the RPC is SECURITY DEFINER and bypasses RLS, so the broken
--   predicate is the only thing standing in front of it.
--
-- WHY THE POLICIES WERE NOT AFFECTED
--   0021 uses the same function inside RLS USING/WITH CHECK clauses, where
--   Postgres treats NULL as "no" — policies fail closed. Only the plpgsql
--   `if not ...` guards fail open. That is why this survived: the boundary
--   looked correct from the policy side.
--
-- THE FIX
--   coalesce the whole predicate to false, at the one place it is defined, so
--   every caller is fixed at once: submit_order/edit_order (0014, 0020, 0031,
--   0032), complete_order/reopen_order (0022), the clinic order path (0023),
--   answer_clarification (0029, 0033) and acknowledge_order_invoice (0035).
--
--   The body is otherwise unchanged from 0014.
--
-- Fully idempotent — safe to re-run.
-- ---------------------------------------------------------------------------

create or replace function public.can_act_for_doctor(p_doctor_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  -- coalesce, not a rewrite: `= current_doctor_id()` is NULL whenever the
  -- caller is not a doctor, and NULL propagates out through the OR and the AND.
  -- Callers ask `if not can_act_for_doctor(...)`, and `not NULL` never fires.
  select coalesce(
    p_doctor_id is not null
    and (
      p_doctor_id = public.current_doctor_id()
      or (
        public.current_admin_clinic_id() is not null
        and exists (
          select 1 from public.doctor_profiles dp
          where dp.id = p_doctor_id
            and dp.clinic_id = public.current_admin_clinic_id()
        )
      )
    ),
    false
  );
$$;

grant execute on function public.can_act_for_doctor(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Verify:
-- ---------------------------------------------------------------------------
--   -- 1. Never NULL again, for anyone:
--   select public.can_act_for_doctor(null) is not null;                -- true
--   select public.can_act_for_doctor(gen_random_uuid()) = false;       -- true
--
--   -- 2. As a lab owner, against one of its own orders' doctors, in a
--   --    transaction you roll back:
--   --      set_config('request.jwt.claims', {"sub": <lab owner>}, true)
--   --      set local role authenticated
--   --      select public.can_act_for_doctor(<that order's doctor_id>);  -- false
--   --      select public.complete_order(<that order>);   -- raises not_your_order
--
--   -- 3. And the doctor is unaffected — their own complete_order still works.
-- ---------------------------------------------------------------------------
