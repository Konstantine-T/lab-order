-- ---------------------------------------------------------------------------
-- 0026 — A passcode in front of the lab's Finances section.
--
-- A lab's screen is often on a bench in a shared room. The money view should
-- not be one click away for whoever walks past, even though the person signed
-- in is entitled to see it.
--
-- The hash lives in its own table, NOT on `labs`. `labs` is read with
-- `select('*')` by every doctor browsing the marketplace, so a column there
-- would hand every doctor the bcrypt hash of every lab's passcode to attack
-- offline. This table has RLS on and *no policies at all*: nothing can read or
-- write it directly, and the three SECURITY DEFINER functions below are the
-- only way in.
--
-- Scope, honestly: this gates the UI, not the data. Anyone holding the lab's
-- session can still call the receivables RPCs directly. It stops a passer-by,
-- not the account owner — which is exactly what was asked for.
-- ---------------------------------------------------------------------------

create table if not exists public.lab_finance_locks (
  lab_id          uuid primary key references public.labs(id) on delete cascade,
  passcode_hash   text not null,
  -- A short passcode is brute-forceable over an API, so failures are counted
  -- and the lock stops answering for a while.
  failed_attempts int not null default 0,
  locked_until    timestamptz,
  updated_at      timestamptz not null default now()
);

alter table public.lab_finance_locks enable row level security;
-- No policies on purpose. See the header.

-- ---------------------------------------------------------------------------
-- Is a passcode set for the calling lab? Drives which screen the UI shows.
-- ---------------------------------------------------------------------------
create or replace function public.lab_finance_lock_state()
returns table (passcode_set boolean, locked_until timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    (fl.lab_id is not null) as passcode_set,
    fl.locked_until
  from public.labs l
  left join public.lab_finance_locks fl on fl.lab_id = l.id
  where l.owner_user_id = auth.uid();
$$;

grant execute on function public.lab_finance_lock_state() to authenticated;

-- ---------------------------------------------------------------------------
-- Set it, or change it. Changing requires the current passcode: an unlocked
-- screen left open must not be enough to lock the real owner out.
-- ---------------------------------------------------------------------------
create or replace function public.set_lab_finance_passcode(
  p_new     text,
  p_current text default null
)
returns void
language plpgsql
security definer
set search_path to 'public, extensions'
as $$
declare
  v_lab_id  uuid;
  v_hash    text;
begin
  select l.id into v_lab_id from public.labs l where l.owner_user_id = auth.uid();
  if v_lab_id is null then
    raise exception 'not a lab owner' using errcode = '42501';
  end if;

  if p_new is null or length(btrim(p_new)) < 4 then
    raise exception 'passcode too short' using errcode = '22023';
  end if;

  select fl.passcode_hash into v_hash
    from public.lab_finance_locks fl where fl.lab_id = v_lab_id;

  if v_hash is not null then
    if p_current is null or extensions.crypt(p_current, v_hash) <> v_hash then
      raise exception 'current passcode incorrect' using errcode = '28000';
    end if;
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

grant execute on function public.set_lab_finance_passcode(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Check one. Counts failures and stops answering after five, so a four-digit
-- passcode can't be walked through over the API.
-- ---------------------------------------------------------------------------
create or replace function public.verify_lab_finance_passcode(p_passcode text)
returns boolean
language plpgsql
security definer
set search_path to 'public, extensions'
as $$
declare
  v_lab_id uuid;
  v_lock   public.lab_finance_locks%rowtype;
  v_ok     boolean;
begin
  select l.id into v_lab_id from public.labs l where l.owner_user_id = auth.uid();
  if v_lab_id is null then return false; end if;

  select * into v_lock from public.lab_finance_locks where lab_id = v_lab_id;
  if v_lock.lab_id is null then return false; end if;

  if v_lock.locked_until is not null and v_lock.locked_until > now() then
    raise exception 'too many attempts' using errcode = '55006';
  end if;

  v_ok := extensions.crypt(coalesce(p_passcode, ''), v_lock.passcode_hash) = v_lock.passcode_hash;

  if v_ok then
    update public.lab_finance_locks
       set failed_attempts = 0, locked_until = null
     where lab_id = v_lab_id;
  else
    update public.lab_finance_locks
       set failed_attempts = failed_attempts + 1,
           locked_until = case
             when failed_attempts + 1 >= 5 then now() + interval '5 minutes'
             else null
           end
     where lab_id = v_lab_id;
  end if;

  return v_ok;
end;
$$;

grant execute on function public.verify_lab_finance_passcode(text) to authenticated;
