-- ---------------------------------------------------------------------------
-- 0061 — no explanation needed when the final price is the estimate.
--
-- 0046 made the lab explain every final price it sets (final_price_note,
-- refused without one as final_price_note_required). A price the lab leaves at
-- the calculated estimate, orders.generated_total, explains itself: the doctor
-- saw that figure when sending the order. So the explanation is now required
-- only when
--
--     generated_total is null                                  -- no estimate:
--                                                               -- a described
--                                                               -- service, or
--                                                               -- none calculable
--  or round(final_total, 2) <> round(generated_total, 2)       -- higher or lower
--
-- Equal means equal to the tetri. Everything else in the guard is 0046's,
-- unchanged: the trimming (an all-blank note is no note), final_price_note_at
-- stamped on any change and kept from the client otherwise, client writes only
-- (anon / authenticated; RPCs and the SQL editor pass), not SECURITY DEFINER,
-- no EXECUTE for the client roles. At the estimate a note stays allowed, and
-- clearing it is too.
--
-- The trigger (orders_final_price_note_guard, 0046) calls the function by name,
-- so replacing the function is enough. tg_notify_order_price (0046) is
-- unchanged: notify() strips nulls, so a price with no note notifies without
-- one, as orders priced before 0046 always did.
--
-- REPLAY: 0046 re-creates the old function; re-run this file after it.
-- Idempotent: create or replace, revoke. Safe to replay.
-- ---------------------------------------------------------------------------

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

  -- 0061: a price at the estimate needs no explanation.
  if v_client
     and new.final_total is not null
     and (v_price_changed or v_note_changed)
     and new.final_price_note is null
     and (new.generated_total is null
          or round(new.final_total::numeric, 2) <> round(new.generated_total::numeric, 2)) then
    raise exception 'final_price_note_required'
      using errcode = '23514',
            hint = 'Save final_total together with final_price_note, unless it equals generated_total.';
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

-- ---------------------------------------------------------------------------
-- Verify (every one should be true):
-- ---------------------------------------------------------------------------
--   -- 1. The new rule is in, the trigger still calls it, the client cannot:
--   select prosrc like '%round(new.final_total::numeric, 2) <> round(new.generated_total::numeric, 2)%'
--     from pg_proc where oid = 'public.tg_final_price_note_guard()'::regprocedure;
--   select count(*) = 1 from pg_trigger
--    where tgrelid = 'public.orders'::regclass and tgname = 'orders_final_price_note_guard';
--   select not has_function_privilege('authenticated', 'public.tg_final_price_note_guard()', 'EXECUTE');
--
--   -- 2. As the lab owner, in a transaction you roll back, on an order of theirs
--   --    whose generated_total is 200:
--   --   begin;
--   --   select set_config('request.jwt.claims', '{"sub":"<lab owner uuid>"}', true);
--   --   set local role authenticated;
--   --   update public.orders set final_total = 200, final_price_note = null where id = '<order>';
--   --   -- passes: the estimate needs no explanation
--   --   update public.orders set final_total = 210 where id = '<order>';
--   --   -- raises final_price_note_required
--   --   update public.orders set final_total = 210, final_price_note = 'Extra unit' where id = '<order>';
--   --   update public.orders set final_total = 200 where id = '<order>';
--   --   -- passes, the note is kept
--   --   update public.orders set final_price_note = '' where id = '<order>';
--   --   -- passes: clearing the note at the estimate
--   --   reset role;
--   --   rollback;
--   -- and on an order with generated_total null (a described service), any
--   -- price without a note still raises final_price_note_required.
-- ---------------------------------------------------------------------------
