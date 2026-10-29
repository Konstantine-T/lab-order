-- ---------------------------------------------------------------------------
-- 0053 — an approved lab can change its contact details without a new review.
--
-- Trello w8a0mZRc. Owner decision (J1): an APPROVED_ACTIVE lab changes its
-- contact person, phone and email at any time, with no new review, the same
-- rule as its logo (0047) and translations (0037). People and phone numbers
-- change; the lab should not need the platform admin for that. Its name,
-- legal and bank details stay locked. A SUSPENDED or REJECTED lab stays fully
-- locked, contact details included.
--
-- SUPERSEDES 0040's LOCKED COLUMNS list. This file redefines
-- tg_labs_lock_identity_after_approval(), so the last one applied wins and
-- 0040's header ("LOCKED COLUMNS", "NOT LOCKED HERE") no longer describes the
-- runtime rule; read this header instead. 0040 itself is left as it was
-- applied.
--
-- WHAT CHANGES
--   contact_person_name, contact_phone and contact_email leave the locked list
--   for an APPROVED_ACTIVE lab only. For every other status that is not in
--   review (SUSPENDED, REJECTED, a NULL or any future status) they stay locked
--   exactly as 0040 had them: 0040 locked all 13 columns for every status but
--   PENDING_APPROVAL / CHANGES_REQUESTED, so simply dropping the three from
--   the list would have opened them to a suspended lab too, an edit that
--   would come back unreviewed with a reactivation (0040's own reason). Only
--   an explicit OLD.approval_status = 'APPROVED_ACTIVE' opens them (0036's
--   lesson: a guard fails closed), and the test reads OLD, so an owner cannot
--   unlock by changing the status in the same UPDATE (0003 refuses that
--   anyway). is_active is not consulted, the same gate LabProfilePage
--   (`approved`) and set_lab_price_list (0038) use.
--
-- WHAT STAYS THE SAME (copied from 0040 unchanged)
--   * who passes: a write that is not a client request (`current_user` not
--     anon / authenticated: SECURITY DEFINER RPCs, the SQL editor, the service
--     role); a lab in review (OLD status PENDING_APPROVAL / CHANGES_REQUESTED);
--     a platform admin (`current_user_role()`, coalesced). The function is
--     still NOT SECURITY DEFINER, or `current_user` would always be its owner.
--   * the error: `lab_identity_locked`, 42501, with the same detail and hint.
--     The client maps it through labProfileErrors.ts.
--   * a no-op write (the same value sent back) passes: `is distinct from`,
--     per column.
--   * the trigger: same name, BEFORE UPDATE, row level, every UPDATE. The
--     drop / create is repeated from 0040 only so this file stands on its own.
--
-- LOCKED COLUMNS after this file
--   Always (any status outside review):
--     public_name, legal_name, identification_code, legal_address,
--     working_address, city, country, bank_name, bank_account_iban,
--     payment_instructions
--   Also while the lab is not APPROVED_ACTIVE (SUSPENDED, REJECTED, unknown):
--     contact_person_name, contact_phone, contact_email
--   Not locked here: as 0040 (public_translations, price_lists, short_description,
--   logo_url, 0003's admin columns, owner_user_id).
--
-- SIDE EFFECTS (no change needed)
--   * Open orders read the lab's phone and email live (the order detail's
--     `labs(contact_email, contact_phone)` embed), so doctors see the new
--     contact at once; lab_snapshot on existing orders keeps the old values.
--   * create-order-chat adds the lab's contact_phone when a chat is created:
--     chats created earlier keep the old number.
--   * A buying lab's hidden work location (0048) copies contact_email and
--     contact_phone; ensure_lab_buyer_profile / submit / edit re-sync it.
--   * contact_phone and contact_email are already in 0039's guest column
--     list; contact_person_name stays hidden from guests.
--
-- NUMBERING. Written and first applied to lab-order-dev on 2026-10-29 as
-- 0049_lab_contact_editable; renumbered 0053 because 0049-0052 (my_clinic,
-- multi_clinic, freeze_order_clinic, order_status_history) had landed on
-- main the same week. It touches none of their objects; re-applying it
-- after them is a no-op apart from this comment.
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
  -- The contact columns (0053) are open to an approved lab only: any other
  -- status, NULL included, keeps them locked.
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
      'bank_name',
      'bank_account_iban',
      'payment_instructions'
    ] || case
           when old.approval_status = 'APPROVED_ACTIVE' then '{}'::text[]
           else array['contact_person_name', 'contact_phone', 'contact_email']
         end) as c
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
-- Verify (every one should be true):
-- ---------------------------------------------------------------------------
--   -- 1. The trigger is in place once, BEFORE UPDATE, row level, enabled:
--   select count(*) = 1 from pg_trigger
--    where tgrelid = 'public.labs'::regclass
--      and tgname = 'labs_lock_identity_after_approval' and tgenabled = 'O';
--
--   -- 2. The function is this file's, and still not SECURITY DEFINER:
--   select not prosecdef
--      and prosrc like '%when old.approval_status = ''APPROVED_ACTIVE'' then ''{}''::text[]%'
--      and prosrc like '%''bank_account_iban''%'
--     from pg_proc where oid = 'public.tg_labs_lock_identity_after_approval()'::regprocedure;
--
--   -- 3. As the owner of an APPROVED_ACTIVE lab, in a transaction you roll back:
--   --      begin;
--   --      select set_config('request.jwt.claims', '{"sub":"<owner uuid>","role":"authenticated"}', true);
--   --      set local role authenticated;
--   --      update public.labs set contact_phone = '+995 555 000 000',
--   --             contact_email = 'new@lab.ge', contact_person_name = 'New Person'
--   --       where id = '<their lab>';
--   --      -- UPDATE 1
--   --      update public.labs set public_name = 'Other' where id = '<their lab>';
--   --      -- ERROR 42501 lab_identity_locked
--   --      -- DETAIL: Locked while the lab is APPROVED_ACTIVE: public_name
--   --      rollback;
--   --    Same refusal for legal_name, identification_code, bank_account_iban,
--   --    working_address, city.
--
--   -- 4. As the owner of a SUSPENDED or REJECTED lab, the same contact_phone
--   --    UPDATE still raises lab_identity_locked (DETAIL names contact_phone).
--
--   -- 5. As the owner of a PENDING_APPROVAL or CHANGES_REQUESTED lab, and as a
--   --    platform admin on any lab, every column still saves (UPDATE 1).
--
--   -- 6. From the app: an approved lab's /lab/profile → contact card → "Save
--   --    contact details"; the public lab page shows the new phone and email.
-- ---------------------------------------------------------------------------
