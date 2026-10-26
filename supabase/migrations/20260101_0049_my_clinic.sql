-- ---------------------------------------------------------------------------
-- 0049 — a doctor can see which clinic they belong to.
--
-- doctor_profiles.clinic_id (0013) says it, but a doctor cannot read the
-- clinic's name: `clinics` is readable by its owner and the platform admin
-- only (0011). A read policy for member doctors would hand them every column
-- of the row (legal name, tax id, legal address) — RLS limits rows, not
-- columns, the 0039 lesson. So: one SECURITY DEFINER function returning the
-- caller's own clinic, name and city only.
--
-- Read by the doctor's profile page, account menu and home page.
--
-- Fully idempotent — safe to re-run.
-- ---------------------------------------------------------------------------

-- The signed-in doctor's current clinic, or no row. A lab's buying profile
-- (0048) never has a clinic, and is excluded anyway.
create or replace function public.my_clinic()
returns table (clinic_id uuid, clinic_name text, city text)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.public_name, c.city
    from public.doctor_profiles dp
    join public.clinics c on c.id = dp.clinic_id
   where dp.user_id = auth.uid()
     and dp.buyer_lab_id is null;
$$;

revoke all on function public.my_clinic() from public, anon;
grant execute on function public.my_clinic() to authenticated;

-- ---------------------------------------------------------------------------
-- Verify:
-- ---------------------------------------------------------------------------
--   -- Callable by a signed-in user, not by a guest (expect t | f):
--   select has_function_privilege('authenticated', 'public.my_clinic()', 'execute'),
--          has_function_privilege('anon', 'public.my_clinic()', 'execute');
--
--   -- As a doctor in a clinic, in a transaction you roll back (one row, their
--   -- clinic); as a doctor in none, or any other role, no row:
--   --   begin;
--   --   select set_config('request.jwt.claims', '{"sub":"<doctor user uuid>","role":"authenticated"}', true);
--   --   set local role authenticated;
--   --   select * from public.my_clinic();
--   --   rollback;
-- ---------------------------------------------------------------------------
