-- =============================================================================
-- 0015: Fix clinic-oversight RLS — the link check must bypass doctor_profiles RLS.
--
-- BUG: the clinic SELECT/UPDATE policies (0013 + 0014) check the doctor↔clinic
-- link with an inline `exists (select 1 from doctor_profiles dp where …)`. That
-- subquery runs with doctor_profiles RLS applied, and a clinic admin can't read
-- doctor_profiles rows (doctor_profiles_self_select = self or platform admin).
-- So the exists() is always false and the clinic sees ZERO orders/answers/etc.
--
-- FIX: put the link check in SECURITY DEFINER helpers (which read doctor_profiles
-- as the owner, bypassing RLS) and point every clinic policy at them. Idempotent.
-- =============================================================================

-- ── Helpers (SECURITY DEFINER — bypass doctor_profiles/orders RLS) ───────────

-- Is this doctor under the caller's clinic?
create or replace function public.doctor_in_admin_clinic(p_doctor_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_admin_clinic_id() is not null
     and exists (
       select 1 from public.doctor_profiles dp
       where dp.id = p_doctor_id
         and dp.clinic_id = public.current_admin_clinic_id()
     );
$$;

-- Is this order's doctor under the caller's clinic?
create or replace function public.order_in_admin_clinic(p_order_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_admin_clinic_id() is not null
     and exists (
       select 1 from public.orders o
       join public.doctor_profiles dp on dp.id = o.doctor_id
       where o.id = p_order_id
         and dp.clinic_id = public.current_admin_clinic_id()
     );
$$;

-- Is this patient referenced by an order whose doctor is under the caller's clinic?
create or replace function public.patient_in_admin_clinic(p_patient_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_admin_clinic_id() is not null
     and exists (
       select 1 from public.orders o
       join public.doctor_profiles dp on dp.id = o.doctor_id
       where o.patient_id = p_patient_id
         and dp.clinic_id = public.current_admin_clinic_id()
     );
$$;

grant execute on function public.doctor_in_admin_clinic(uuid)  to authenticated;
grant execute on function public.order_in_admin_clinic(uuid)   to authenticated;
grant execute on function public.patient_in_admin_clinic(uuid) to authenticated;

-- ── Re-point the clinic policies at the helpers ─────────────────────────────

-- orders: clinic read (0013)
drop policy if exists orders_clinic_select on public.orders;
create policy orders_clinic_select on public.orders
  for select to authenticated
  using (public.doctor_in_admin_clinic(orders.doctor_id));

-- orders: clinic update / cancel (0014) — non-terminal only
drop policy if exists orders_clinic_update on public.orders;
create policy orders_clinic_update on public.orders
  for update to authenticated
  using (
    status not in ('COMPLETED','CANCELLED')
    and public.doctor_in_admin_clinic(orders.doctor_id)
  )
  with check (public.doctor_in_admin_clinic(orders.doctor_id));

-- order_answers: clinic read (0013)
drop policy if exists order_answers_clinic_select on public.order_answers;
create policy order_answers_clinic_select on public.order_answers
  for select to authenticated
  using (public.order_in_admin_clinic(order_answers.order_id));

-- patients: clinic read (0013)
drop policy if exists patients_clinic_select on public.patients;
create policy patients_clinic_select on public.patients
  for select to authenticated
  using (public.patient_in_admin_clinic(patients.id));

-- doctor_work_locations: clinic read (0014) — for create/edit on behalf
drop policy if exists work_locations_clinic_select on public.doctor_work_locations;
create policy work_locations_clinic_select on public.doctor_work_locations
  for select to authenticated
  using (public.doctor_in_admin_clinic(doctor_work_locations.doctor_id));
