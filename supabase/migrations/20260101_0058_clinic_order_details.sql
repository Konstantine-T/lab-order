-- ---------------------------------------------------------------------------
-- 0058: a clinic can be ordered for only once its profile is complete.
--
-- 0050 already fills a clinic order's delivery (work_location_snapshot) and
-- invoice (invoice_recipient_snapshot) from the clinic's own row, so every
-- doctor's order for a clinic carries the same spelling, and it refuses a
-- clinic with no working address (clinic_address_missing). Owner decision
-- (the clinic-address ticket, J3): the gate is the whole required profile,
-- not just the address, so no order goes out invoiced to a clinic without a
-- legal name, identification code (ს/კ) or invoice email.
--
--   1. public._clinic_ready_for_orders(clinics): public_name, working_address,
--      city, legal_name, identification_code and invoice_email all filled.
--   2. orders_clinic_ready, BEFORE INSERT on orders: an order with a clinic_id
--      whose clinic is not ready is refused with clinic_details_missing
--      (22023). An insert, not the submit functions, so every path that
--      creates an order (submit_order, clinic_submit_order) is covered without
--      copying _submit_order_impl (0050). _submit_order_impl's own address
--      check runs first, so a missing address still says
--      clinic_address_missing. clinic_id is frozen after insert (0050/0051),
--      so editing an existing clinic order is not gated.
--      The same trigger adds the clinic's legal name to a clinic order's
--      invoice snapshot as `legal_name` (J4; `name` already carries it).
--   3. my_clinic() also returns `ready`, so the wizard can disable a clinic
--      before the server refuses it. The return type changes: drop, create.
--
-- Clinics already ordered for that miss a ს/კ, legal name or invoice email
-- stop being orderable until their admin completes the profile (the clinic
-- home and the wizard say so). Orders already placed are untouched.
--
-- REPLAY ORDER: 0050 recreates my_clinic() without `ready`. Re-run this file
-- after replaying 0050 (the client falls back to the address alone when
-- `ready` is missing, so nothing breaks in between). Idempotent.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'clinics'
                    and column_name = 'working_address') then
    raise exception '0058 needs 0050 (multi-clinic) applied first';
  end if;
end $$;


-- ── 1. The rule, once ───────────────────────────────────────────────────
create or replace function public._clinic_ready_for_orders(c public.clinics)
returns boolean
language sql
immutable
set search_path = public
as $$
  select btrim(coalesce(c.public_name, ''))         <> ''
     and btrim(coalesce(c.working_address, ''))     <> ''
     and btrim(coalesce(c.city, ''))                <> ''
     and btrim(coalesce(c.legal_name, ''))          <> ''
     and btrim(coalesce(c.identification_code, '')) <> ''
     and btrim(coalesce(c.invoice_email, ''))       <> '';
$$;

comment on function public._clinic_ready_for_orders(public.clinics) is
  'A clinic can be ordered for (0058): name, delivery address, city, legal name, ს/კ and invoice email filled.';


-- ── 2. The gate, on the order ───────────────────────────────────────────
create or replace function public.tg_orders_clinic_ready()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic public.clinics;
begin
  if new.clinic_id is null then
    return new;
  end if;
  select * into v_clinic from public.clinics where id = new.clinic_id;
  if not found or not public._clinic_ready_for_orders(v_clinic) then
    raise exception 'clinic_details_missing' using errcode = '22023';
  end if;
  -- J4: the LLC, by name, beside 0050's `name` (which is the same value).
  if new.invoice_recipient_type::text = 'CLINIC' and new.invoice_recipient_snapshot is not null then
    new.invoice_recipient_snapshot :=
      new.invoice_recipient_snapshot || jsonb_build_object('legal_name', btrim(v_clinic.legal_name));
  end if;
  return new;
end $$;

drop trigger if exists orders_clinic_ready on public.orders;
create trigger orders_clinic_ready
  before insert on public.orders
  for each row execute function public.tg_orders_clinic_ready();


-- ── 3. my_clinic(): + ready ─────────────────────────────────────────────
-- 0050's body verbatim, plus the flag. A member sees no more than before.
drop function if exists public.my_clinic();
create function public.my_clinic()
returns table (
  clinic_id           uuid,
  clinic_name         text,
  city                text,
  working_address     text,
  legal_name          text,
  identification_code text,
  joined_at           timestamptz,
  ready               boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.public_name, c.city,
         nullif(btrim(c.working_address), ''),
         coalesce(nullif(btrim(c.legal_name), ''), c.public_name),
         nullif(btrim(c.identification_code), ''),
         cd.joined_at,
         public._clinic_ready_for_orders(c)
    from public.doctor_profiles dp
    join public.clinic_memberships cd on cd.doctor_id = dp.id
    join public.clinics c on c.id = cd.clinic_id
   where dp.user_id = auth.uid()
     and dp.buyer_lab_id is null
   order by cd.joined_at, c.public_name;
$$;

revoke all on function public.my_clinic() from public, anon;
grant execute on function public.my_clinic() to authenticated;

-- Helpers and the trigger function: no client calls them.
revoke all on function public._clinic_ready_for_orders(public.clinics) from public, anon, authenticated;
revoke all on function public.tg_orders_clinic_ready() from public, anon, authenticated;

notify pgrst, 'reload schema';


-- ---------------------------------------------------------------------------
-- Verify (every one should be true):
-- ---------------------------------------------------------------------------
--   -- Which clinics can be ordered for now; the rest need their profile.
--   select public_name, public._clinic_ready_for_orders(c) as ready from public.clinics c;
--
--   select count(*) = 1 from pg_trigger
--    where tgrelid = 'public.orders'::regclass and tgname = 'orders_clinic_ready';
--
--   -- As a clinic doctor, in a transaction you roll back:
--   --   begin;
--   --   select set_config('request.jwt.claims', '{"sub":"<doctor user uuid>"}', true);
--   --   set local role authenticated;
--   --   select clinic_name, ready from public.my_clinic();
--   --   rollback;
--   -- Ordering for a clinic whose ready is false: clinic_details_missing (or
--   -- clinic_address_missing when it is the address that is missing). A new
--   -- clinic order's invoice_recipient_snapshot has `legal_name`.
-- ---------------------------------------------------------------------------
