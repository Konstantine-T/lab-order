-- Close the users.role / account_status self-escalation hole.
--
-- THE HOLE: `users_update_self` (0004) is a column-blind self-UPDATE policy —
-- Postgres RLS cannot restrict columns — and `all-in-one.sql` grants UPDATE on
-- public.users to `authenticated`. public.users had no protective trigger (only
-- users_set_updated_at). So any signed-in user could run
--
--   supabase.from('users').update({ role: 'PLATFORM_ADMIN' }).eq('id', <self>)
--
-- and take over the platform: every admin gate in this app resolves through
-- public.current_user_role(), which reads exactly this column.
--
-- The SIGNUP path was already guarded by the role allow-list in
-- handle_new_user() (0011). This closes the UPDATE path, which that fix did not
-- cover. Same shape as tg_labs_protect_admin_columns (0003): read the caller's
-- role directly, let PLATFORM_ADMIN through, otherwise raise.
--
-- Raising beats silently reverting here: nothing legitimately co-writes these
-- columns (unlike clinic_id in 0013, where the consent RPCs do), so a privilege
-- attempt should fail loudly rather than appear to succeed.
--
-- `email` is protected alongside them: 0013 documents the users.email mirror as
-- client-mutable through this same policy, and nothing in the app ever updates
-- it (handle_new_user only INSERTs it). Locking it now keeps it from quietly
-- becoming an authorization key later.

create or replace function public.tg_users_protect_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.user_role;
begin
  -- Fast path: no privileged column is changing. This is every ordinary profile
  -- save (first_name / last_name / phone / preferred_lang /
  -- preferred_color_mode) and every updated_at touch.
  if new.role is not distinct from old.role
     and new.account_status is not distinct from old.account_status
     and new.email is not distinct from old.email then
    return new;
  end if;

  -- Out-of-band operations (SQL Editor as `postgres`, service-role scripts) must
  -- stay allowed: seed_admin.sql promotes the FIRST platform admin exactly that
  -- way, and PLATFORM_ADMIN is granted out-of-band by design.
  --
  -- The signal is the PostgREST JWT GUC, not auth.uid(). EVERY request arriving
  -- through PostgREST sets request.jwt.claims; a direct psql/SQL-Editor session
  -- has no such GUC at all. Testing the GUC rather than auth.uid() keeps the
  -- guard closed even if a custom access-token hook ever emits a JWT without a
  -- `sub` claim (which would make auth.uid() null on a real browser request).
  if current_setting('request.jwt.claims', true) is null then
    return new;
  end if;

  select role into v_role from public.users where id = auth.uid();
  if v_role = 'PLATFORM_ADMIN' then
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'Only platform admins can change a user role'
      using errcode = '42501';
  end if;
  if new.account_status is distinct from old.account_status then
    raise exception 'Only platform admins can change account_status'
      using errcode = '42501';
  end if;
  raise exception 'Only platform admins can change a user email'
    using errcode = '42501';
end $$;

drop trigger if exists users_protect_privileged_columns on public.users;
create trigger users_protect_privileged_columns
  before update on public.users
  for each row execute function public.tg_users_protect_privileged_columns();
