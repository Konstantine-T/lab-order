-- Lets the lab read the public.users row for any doctor who has placed an
-- order with that lab. Without this, the orders join
-- `doctor_profiles(users(...))` returns NULL for the embedded users row
-- because the existing `users_read_self_or_admin` policy hides everyone but
-- the user themselves.
--
-- Safe to re-run.

drop policy if exists users_read_lab_order_doctors on public.users;
create policy users_read_lab_order_doctors on public.users
  for select to authenticated
  using (
    exists (
      select 1
      from public.orders o
      join public.doctor_profiles dp on dp.id = o.doctor_id
      join public.labs l            on l.id = o.lab_id
      where dp.user_id = public.users.id
        and l.owner_user_id = auth.uid()
    )
  );
