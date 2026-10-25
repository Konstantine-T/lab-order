-- ---------------------------------------------------------------------------
-- 0046 — an explanation with every final price.
--
-- Trello to75nCxF, part 2. When the lab sets (or changes) an order's
-- final_total it now says how it arrived at the figure, in its own words. The
-- doctor reads it next to the price on the order page, in the "price set"
-- notification and in their orders list.
--
--   * orders.final_price_note     the lab's text, trimmed, at most 1000 chars.
--   * orders.final_price_note_at  when the price or the note last changed.
--     Stamped here, never by the client.
--
-- THE RULE THE DATABASE ENFORCES (orders_final_price_note_guard, BEFORE
-- UPDATE): a client write (anon / authenticated) that leaves an order with a
-- price, and changes the price or the note, must leave a non-empty note — else
-- final_price_note_required (23514). The lab sheet saves price and note in ONE
-- update, so the check sees both. One step past the ticket's wording ("when
-- final_total changed"): clearing the note of a priced order is refused too,
-- since "a priced order has a note" is the point. Rows are only checked when
-- one of the two changes, so orders priced before this migration keep their
-- price and no note until somebody edits the price.
--
-- What it does NOT enforce: that a changed price comes with an updated note.
-- The owner's "updated or confirmed with the price" rule is a UI check (edit
-- the text, or tick "the explanation is still correct"); the database cannot
-- tell a confirmed old note from a forgotten one.
--
-- Not affected: SECURITY DEFINER RPCs and the SQL editor (current_user is the
-- function owner / postgres, as in 0037 / 0042), record_payment, receivables
-- and payables (they read final_total, unchanged). Clearing final_total keeps
-- the note: harmless, nothing displays it without a price.
--
-- NOTIFICATIONS (0043): tg_notify_order_price is re-created with one change —
-- params.note = the first 140 characters of the note, for the price_set toast
-- and bell row (and new_payable, which shares the params). The AFTER UPDATE
-- trigger reads the row the guard above already trimmed. Rows written before
-- this migration have no note and render as they did. The note is the lab's
-- free text, so unlike the rest of params it is not ours to vet; it reaches
-- only the order's own doctor and clinic admin, who read it on the order too.
--
-- Idempotent: add column if not exists, create or replace, drop trigger if
-- exists. Safe to replay.
-- ---------------------------------------------------------------------------

-- ── 1. Columns ────────────────────────────────────────────────────────────
alter table public.orders
  add column if not exists final_price_note text
    check (final_price_note is null or char_length(final_price_note) <= 1000),
  add column if not exists final_price_note_at timestamptz;

comment on column public.orders.final_price_note is
  'The lab''s explanation of final_total (0046). Required by trigger with any new or changed price from a client.';
comment on column public.orders.final_price_note_at is
  'When final_total or final_price_note last changed (0046). Set by trigger only.';


-- ── 2. The guard ─────────────────────────────────────────────────────────
-- Not SECURITY DEFINER: current_user must stay the caller's role, so a client
-- write is told apart from an RPC or the SQL editor.
create or replace function public.tg_final_price_note_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_client        boolean := current_user in ('anon', 'authenticated');
  v_price_changed boolean := new.final_total is distinct from old.final_total;
  v_note_changed  boolean;
begin
  -- Trimmed of all surrounding whitespace (newlines too, which btrim keeps),
  -- and an all-blank note is no note.
  if new.final_price_note is not null then
    new.final_price_note := nullif(
      regexp_replace(new.final_price_note, '^[[:space:]]+|[[:space:]]+$', '', 'g'),
      ''
    );
  end if;
  v_note_changed := new.final_price_note is distinct from old.final_price_note;

  if v_client
     and new.final_total is not null
     and (v_price_changed or v_note_changed)
     and new.final_price_note is null then
    raise exception 'final_price_note_required'
      using errcode = '23514',
            hint = 'Save final_total together with final_price_note.';
  end if;

  if v_price_changed or v_note_changed then
    new.final_price_note_at := now();
  elsif v_client then
    -- The stamp is ours: a client cannot set it by hand.
    new.final_price_note_at := old.final_price_note_at;
  end if;

  return new;
end $$;

revoke all on function public.tg_final_price_note_guard() from public, anon, authenticated;

-- `update of` the three columns: only a write that names one of them runs it
-- (edit_order, status changes and payments never do).
drop trigger if exists orders_final_price_note_guard on public.orders;
create trigger orders_final_price_note_guard
  before update of final_total, final_price_note, final_price_note_at on public.orders
  for each row execute function public.tg_final_price_note_guard();


-- ── 3. price_set carries the note (0043, rows 9 and 20) ──────────────────
-- 0043's body verbatim; the only change is 'note' in v_params. notify()
-- strips nulls, so an order without a note sends the params it always did.
create or replace function public.tg_notify_order_price()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parties     record;
  v_params      jsonb;
  v_uid         uuid;
  v_doctor_side boolean;
begin
  begin
    select * into v_parties from public._notification_parties(new.doctor_id, new.lab_id);
    v_params := public._order_notification_params(new)
                || jsonb_build_object('amount', new.final_total,
                                      'note', left(new.final_price_note, 140));
    v_uid := auth.uid();
    v_doctor_side := coalesce(v_uid = v_parties.doctor_user, false)
                  or coalesce(v_uid = v_parties.clinic_owner, false);

    if not v_doctor_side then
      -- 9. price_set → the doctor only; the clinic admin's line is row 20.
      begin
        perform public.notify(v_parties.doctor_user, 'price_set', new.id, v_params);
      exception when others then
        raise warning 'notify price_set (order %): %', new.id, sqlerrm;
      end;
      -- 20. new_payable → the doctor's clinic admin.
      begin
        perform public.notify(v_parties.clinic_owner, 'new_payable', new.id, v_params);
      exception when others then
        raise warning 'notify new_payable (order %): %', new.id, sqlerrm;
      end;
    end if;
  exception when others then
    raise warning 'tg_notify_order_price (order %): %', new.id, sqlerrm;
  end;
  return null;
end $$;

revoke all on function public.tg_notify_order_price() from public, anon, authenticated;

-- (orders_notify_price itself is unchanged: AFTER UPDATE OF final_total, when
-- a non-null price changed. Not re-created here.)

-- ---------------------------------------------------------------------------
-- Verify (every one should be true):
-- ---------------------------------------------------------------------------
--   -- 1. The columns, both nullable:
--   select count(*) = 2 from information_schema.columns
--    where table_schema = 'public' and table_name = 'orders'
--      and column_name in ('final_price_note', 'final_price_note_at')
--      and is_nullable = 'YES';
--   -- and every existing row passed the length CHECK (it was added without error).
--
--   -- 2. The guard is in place, and the price trigger carries the note:
--   select count(*) = 1 from pg_trigger
--    where tgrelid = 'public.orders'::regclass and tgname = 'orders_final_price_note_guard';
--   select prosrc like '%''note'', left(new.final_price_note, 140)%' from pg_proc
--    where oid = 'public.tg_notify_order_price()'::regprocedure;
--   select not has_function_privilege('authenticated', 'public.tg_final_price_note_guard()', 'EXECUTE');
--
--   -- 3. Nothing was rewritten: orders priced before 0046 have no note.
--   select count(*) from public.orders where final_total is not null and final_price_note is null;
--
--   -- 4. As the lab owner, in a transaction you roll back:
--   --   begin;
--   --   select set_config('request.jwt.claims', '{"sub":"<lab owner uuid>"}', true);
--   --   set local role authenticated;
--   --   update public.orders set final_total = 250 where id = '<their order>';
--   --   -- raises final_price_note_required
--   --   update public.orders set final_total = 250, final_price_note = '  3 units x 80, rush 10  '
--   --    where id = '<their order>';
--   --   select final_price_note, final_price_note_at from public.orders where id = '<their order>';
--   --   -- '3 units x 80, rush 10' | now()
--   --   update public.orders set final_price_note = ' ' where id = '<their order>';
--   --   -- raises final_price_note_required (a priced order keeps a note)
--   --   reset role;
--   --   select params->>'note' from public.notifications
--   --    where kind = 'price_set' order by created_at desc limit 1;  -- '3 units x 80, rush 10'
--   --   rollback;
-- ---------------------------------------------------------------------------
