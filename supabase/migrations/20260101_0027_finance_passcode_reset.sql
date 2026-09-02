-- ---------------------------------------------------------------------------
-- 0027 — Reset the finances passcode with the account password.
--
-- 0026 shipped a lock with no key cutter: forget the passcode and the lab is
-- shut out of its own money view for good. The account password is the right
-- thing to fall back to — it is the credential that already proves who this is.
--
-- The check happens HERE, not in the client. A client-side
-- `signInWithPassword` before calling a reset RPC would look identical to the
-- user and be worthless: anyone holding the session could call the RPC straight
-- past it and clear the passcode without knowing the password at all.
--
-- Supabase stores the account password as a bcrypt hash in auth.users, so the
-- same `crypt(guess, hash) = hash` comparison 0026 uses for the passcode works
-- here. The hash is read inside the function and never returned; the function
-- only ever looks at auth.uid()'s own row.
--
-- Failures ride the same throttle as wrong passcodes: guessing an account
-- password against an unlimited endpoint is a far worse deal than guessing four
-- digits, so it must not be the cheaper door.
-- ---------------------------------------------------------------------------

create or replace function public.reset_lab_finance_passcode(
  p_account_password text,
  p_new              text
)
returns void
language plpgsql
security definer
set search_path to 'public, extensions'
as $$
declare
  v_lab_id   uuid;
  v_lock     public.lab_finance_locks%rowtype;
  v_pw_hash  text;
begin
  select l.id into v_lab_id from public.labs l where l.owner_user_id = auth.uid();
  if v_lab_id is null then
    raise exception 'not a lab owner' using errcode = '42501';
  end if;

  if p_new is null or length(btrim(p_new)) < 4 then
    raise exception 'passcode too short' using errcode = '22023';
  end if;

  select * into v_lock from public.lab_finance_locks where lab_id = v_lab_id;

  if v_lock.lab_id is not null
     and v_lock.locked_until is not null
     and v_lock.locked_until > now() then
    raise exception 'too many attempts' using errcode = '55006';
  end if;

  select u.encrypted_password into v_pw_hash
    from auth.users u
   where u.id = auth.uid();

  if v_pw_hash is null
     or extensions.crypt(coalesce(p_account_password, ''), v_pw_hash) <> v_pw_hash then
    -- A wrong password counts against the same budget as a wrong passcode.
    if v_lock.lab_id is not null then
      update public.lab_finance_locks
         set failed_attempts = failed_attempts + 1,
             locked_until = case
               when failed_attempts + 1 >= 5 then now() + interval '5 minutes'
               else null
             end
       where lab_id = v_lab_id;
    end if;
    raise exception 'account password incorrect' using errcode = '28P01';
  end if;

  insert into public.lab_finance_locks (lab_id, passcode_hash, failed_attempts, locked_until, updated_at)
  values (v_lab_id, extensions.crypt(btrim(p_new), extensions.gen_salt('bf', 10)), 0, null, now())
  on conflict (lab_id) do update
    set passcode_hash   = excluded.passcode_hash,
        failed_attempts = 0,
        locked_until    = null,
        updated_at      = now();
end;
$$;

grant execute on function public.reset_lab_finance_passcode(text, text) to authenticated;
