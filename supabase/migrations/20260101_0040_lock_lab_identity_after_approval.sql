-- ---------------------------------------------------------------------------
-- 0040 — an approved lab's name, legal, contact and bank details are locked
--        in the database, not just greyed out in the form.
--
-- BROKEN INVARIANT. Found while reviewing 0037/0038, both of which flag it.
--
-- THE GAP
--   Owner decision: once a platform admin approves a lab, the details the admin
--   checked — its name, its registered company, its contact details, the IBAN
--   doctors pay into — stay as approved. LabProfilePage enforces that by
--   disabling every field unless the lab is PENDING_APPROVAL or
--   CHANGES_REQUESTED.
--
--   The database does not. `labs_owner_update` (0004) is a column-blind
--   owner UPDATE policy, and `tg_labs_protect_admin_columns` (0003) guards only
--   approval_status / approval_note / is_active / approved_*. So an approved
--   owner's session can run
--
--     supabase.from('labs').update({ bank_account_iban: '<another account>' })
--       .eq('id', <own lab>)
--
--   and the account nobody reviewed is what signed-in doctors now read for
--   that lab, and what every new order freezes into its lab_snapshot (orders
--   snapshot the whole row, `to_jsonb(v_lab)`). Same for legal_name /
--   identification_code (the company doctors are dealing with) and
--   public_name (the name in the marketplace and on every new order).
--
-- THE FIX
--   A BEFORE UPDATE trigger that refuses a change to any of the columns below
--   when ALL of these hold:
--
--   * the write comes straight from a client — `current_user` is `anon` or
--     `authenticated`. SECURITY DEFINER RPCs run as their owner, so
--     set_lab_public_translations (0037) and set_lab_price_list (0038) pass,
--     and so do SQL-editor and service-role maintenance. The function is
--     deliberately NOT SECURITY DEFINER, or `current_user` would always be its
--     owner. (Same mechanism as 0037/0038's *_via_rpc triggers.)
--   * the lab is NOT in review. Only PENDING_APPROVAL and CHANGES_REQUESTED
--     leave the columns open — exactly LabProfilePage's `editable` gate — so
--     APPROVED_ACTIVE, SUSPENDED and REJECTED are all locked. Suspended: its
--     details were approved, and an edit made while suspended would come back
--     unreviewed with a reactivation. Rejected: "contact support", no edit
--     path. The test reads OLD.approval_status, so an owner cannot unlock by
--     changing the status in the same UPDATE (0003 refuses that anyway), and
--     it early-returns only on an explicit match: a NULL or any future status
--     locks (0036's lesson — a guard must fail closed).
--   * the caller is not a platform admin (`current_user_role()`, 0004 —
--     coalesced, because it is NULL for a session with no users row).
--
--   A no-op write (the same value sent back) passes: the check is
--   `is distinct from`, per column.
--
-- LOCKED COLUMNS — the approval gate's field list
--   (`requiredFieldKeys` in src/features/lab/labProfileSchema.ts, which
--   `isLabProfileComplete` uses to enable "Approve" on the admin review page):
--     public_name, legal_name, identification_code, legal_address,
--     working_address, city, country, contact_person_name, contact_phone,
--     contact_email, bank_name, bank_account_iban, payment_instructions
--
-- NOT LOCKED HERE
--   public_translations, price_lists  — their own RPCs (0037, 0038); direct
--                                        writes already refused by those files'
--                                        triggers.
--   short_description, logo_url        — storefront copy, outside the approval
--                                        gate. LabProfilePage still disables them
--                                        for an approved lab; locking them here
--                                        too is one more entry in the list below
--                                        if the owner wants it.
--   approval_status, approval_note,
--   is_active, approved_*              — 0003's trigger (admin-only).
--   owner_user_id                      — the policy's WITH CHECK pins it.
--
-- WHAT KEEPS WORKING (checked)
--   * A lab in review saving its profile and resubmitting (LabProfilePage
--     persist() + submitForApproval(): OLD status is PENDING_APPROVAL or
--     CHANGES_REQUESTED).
--   * An approved lab's translations and price lists (the RPCs above).
--   * The admin review page — approve / request changes / reject / suspend —
--     writes only 0003's columns, and the admin passes regardless.
--   * The owner's "Your account" card writes public.users, not labs.
--   * Signup: handle_new_user INSERTs the lab; this is UPDATE-only.
--
--   To let an approved lab correct its details: an admin edits them, or moves
--   the lab to CHANGES_REQUESTED (the lab edits and resubmits for review).
--
-- Fires on every UPDATE rather than `update of <columns>`, so the column list
-- lives in one place. It compares OLD with NEW as the BEFORE triggers that
-- fire ahead of it left NEW — Postgres fires them in name order, and the
-- other labs triggers (0003's labs_protect_admin_columns / labs_set_updated_at,
-- 0037's and 0038's *_via_rpc) all sort after this one and set no locked
-- column. The cost is negligible on a table each lab writes a handful of
-- times.
--
-- Fully idempotent — safe to re-run.
-- ---------------------------------------------------------------------------

create or replace function public.tg_labs_lock_identity_after_approval()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_changed text[];
begin
  -- Not a client request: an RPC running as its definer, the SQL editor, the
  -- service role. Those are trusted paths with their own checks.
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  -- In review: the owner edits freely. Only an explicit match opens it.
  if old.approval_status in ('PENDING_APPROVAL', 'CHANGES_REQUESTED') then
    return new;
  end if;

  if coalesce(public.current_user_role() = 'PLATFORM_ADMIN', false) then
    return new;
  end if;

  -- Which locked columns this UPDATE actually changes. jsonb per column keeps
  -- the list in one place; `->` of a NULL column is JSON null, which compares
  -- equal to itself, so NULL -> NULL is not a change and NULL -> 'x' is.
  select coalesce(array_agg(c order by c), '{}')
    into v_changed
    from unnest(array[
      'public_name',
      'legal_name',
      'identification_code',
      'legal_address',
      'working_address',
      'city',
      'country',
      'contact_person_name',
      'contact_phone',
      'contact_email',
      'bank_name',
      'bank_account_iban',
      'payment_instructions'
    ]) as c
   where to_jsonb(new) -> c is distinct from to_jsonb(old) -> c;

  if cardinality(v_changed) > 0 then
    raise exception 'lab_identity_locked'
      using errcode = '42501',
            detail  = format('Locked while the lab is %s: %s',
                             coalesce(old.approval_status::text, 'unknown'),
                             array_to_string(v_changed, ', ')),
            hint    = 'A platform admin can change these, or request changes to reopen the profile for review.';
  end if;

  return new;
end $$;

-- No EXECUTE grant or revoke: a trigger function cannot be called on its own
-- ("trigger functions can only be called as triggers"), and firing it is not
-- privilege-checked against the writer.

drop trigger if exists labs_lock_identity_after_approval on public.labs;
create trigger labs_lock_identity_after_approval
  before update on public.labs
  for each row execute function public.tg_labs_lock_identity_after_approval();

-- ---------------------------------------------------------------------------
-- Verify:
-- ---------------------------------------------------------------------------
--   -- 1. The trigger is in place, BEFORE UPDATE, row level, enabled
--   --    (expect 1 row: labs_lock_identity_after_approval | O):
--   select tgname, tgenabled from pg_trigger
--    where tgrelid = 'public.labs'::regclass
--      and tgname = 'labs_lock_identity_after_approval';
--
--   -- 2. As the owner of an APPROVED_ACTIVE lab, in a transaction you roll back:
--   --      begin;
--   --      select set_config('request.jwt.claims', '{"sub":"<owner uuid>"}', true);
--   --      set local role authenticated;
--   --      update public.labs set bank_account_iban = 'GE00XX0000000000000000'
--   --       where id = '<their lab>';
--   --      -- ERROR 42501 lab_identity_locked
--   --      -- DETAIL: Locked while the lab is APPROVED_ACTIVE: bank_account_iban
--   --      rollback;
--   --    Same for public_name, legal_name, identification_code, contact_phone …
--   --    And these still work for that owner:
--   --      update public.labs set public_name = public_name where id = '<their lab>';
--   --      -- UPDATE 1 (no-op write)
--   --      select public.set_lab_public_translations('<their lab>',
--   --        '{"en":{"public_name":"Dens Lab"}}');                      -- ok (0037)
--   --      select public.set_lab_price_list('<their lab>', 'ka', null, null); -- ok (0038)
--
--   -- 3. As the owner of a PENDING_APPROVAL or CHANGES_REQUESTED lab, the same
--   --    bank_account_iban UPDATE succeeds (UPDATE 1), then roll back.
--
--   -- 4. As a platform admin (sub = an admin's uuid, role authenticated):
--   --      update public.labs set bank_account_iban = 'GE00…' where id = '<approved lab>';
--   --      -- UPDATE 1, then roll back.
--   --      update public.labs set approval_status = 'SUSPENDED', is_active = false,
--   --             approval_note = 'x' where id = '<approved lab>';
--   --      -- UPDATE 1 (the review page's suspend), then roll back.
--
--   -- 5. From the app: an approved lab's /lab/profile still saves its
--   --    translations and price lists; the admin can still approve a pending
--   --    lab from /admin/labs/<id>.
-- ---------------------------------------------------------------------------
