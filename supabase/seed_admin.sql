-- ============================================================================
-- Promote an existing user to PLATFORM_ADMIN.
-- 1) First create the user via the Supabase Dashboard or by registering on the
--    app (any role works — pick "Doctor" register form to keep it simple).
-- 2) Then run this snippet, replacing the email.
-- ============================================================================

update public.users
set role = 'PLATFORM_ADMIN'
where email = 'YOUR_ADMIN_EMAIL_HERE@example.com';

-- Optional: clean up the auto-created doctor_profiles row for that user.
delete from public.doctor_profiles
where user_id = (select id from public.users where email = 'YOUR_ADMIN_EMAIL_HERE@example.com');

-- Verify
select id, role, email, first_name, last_name
from public.users
where email = 'YOUR_ADMIN_EMAIL_HERE@example.com';
