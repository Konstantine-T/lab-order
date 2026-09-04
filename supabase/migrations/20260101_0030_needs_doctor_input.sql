-- ---------------------------------------------------------------------------
-- 0030 — "needs the doctor to change something", as its own status.
--
-- NEEDS_CLARIFICATION (0029) covers "answer my question". It does not cover
-- the other half of the same conversation: the lab cannot fabricate the case
-- until the doctor goes back into the order and *changes* it. Today the lab
-- parks the order in NEEDS_CLARIFICATION and writes "please fix the shade" as
-- the question; the doctor types "ok, fixed" into the answer box, the order is
-- marked answered, and nothing was actually fixed.
--
-- NEEDS_DOCTOR_INPUT is that second case. The lab says what needs changing,
-- the doctor edits the order, and saving the edit is what closes it.
--
-- WHY THE PREVIOUS STATUS IS STORED
--   The status has to go somewhere when the doctor saves, and "back where the
--   case was" is the only answer that doesn't lose information. A fixed
--   fallback like RECEIVED would silently walk an IN_PROGRESS case backwards
--   every time the lab asked a question.
--
-- WHY A TRIGGER AND NOT A LINE IN edit_order
--   edit_order is already defined in four files (0009, 0014, 0020, phase4-6)
--   and the last one applied wins. Adding a fifth copy to change two lines is
--   how that list got to four. A trigger on order_edits says the rule once —
--   "an edit was recorded, so the doctor has responded" — and survives the next
--   redefinition of edit_order without being copied into it.
--
-- Fully idempotent — safe to re-run.
-- ---------------------------------------------------------------------------

-- ADD VALUE is transactional from PG 12 on, but the new label cannot be *used*
-- in the same transaction that adds it. Nothing below writes the value, so a
-- single run is fine; the trigger only reads it, at call time.
alter type public.order_status add value if not exists 'NEEDS_DOCTOR_INPUT';

alter table public.orders
  add column if not exists status_before_doctor_input public.order_status;

comment on column public.orders.status_before_doctor_input is
  'Where the case was before the lab asked the doctor to change something. '
  'Restored when the doctor saves an edit; null at every other time.';

-- The request rides on order_clarifications so the doctor sees *what* to change
-- in the panel that already exists. This flag is what tells the two kinds
-- apart: an ANSWER is closed by typing, an EDIT by saving a changed order.
alter table public.order_clarifications
  add column if not exists needs_edit boolean not null default false;

alter table public.order_clarifications
  add column if not exists resolved_by_edit_at timestamptz;

comment on column public.order_clarifications.resolved_by_edit_at is
  'Set by the order_edits trigger. Deliberately not the answer columns: this '
  'was closed by an edit, and "answered" would claim the doctor wrote a reply.';

-- One open ask per order, either kind. The 0029 index only knew about
-- answering, so an edit request stayed "open" forever and blocked the next
-- question. Dropped and recreated because a predicate change is not something
-- `create index if not exists` can do.
drop index if exists public.order_clarifications_one_open;
create unique index order_clarifications_one_open
  on public.order_clarifications (order_id)
  where answered_at is null and resolved_by_edit_at is null;

-- ---------------------------------------------------------------------------
-- request_doctor_input — the lab says what needs changing, and the order moves
-- in the same breath. Mirrors request_clarification (0029) exactly, except for
-- the status it sets and the previous status it remembers.
-- ---------------------------------------------------------------------------
create or replace function public.request_doctor_input(
  p_order_id uuid,
  p_note     text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_id    uuid;
begin
  select * into v_order from public.orders where id = p_order_id;
  if v_order.id is null then
    raise exception 'order_not_found';
  end if;
  if not public.current_user_owns_lab(v_order.lab_id) then
    raise exception 'not_your_lab';
  end if;
  if v_order.status in ('COMPLETED', 'CANCELLED') then
    raise exception 'order_terminal';
  end if;
  if btrim(coalesce(p_note, '')) = '' then
    raise exception 'question_required';
  end if;

  if exists (
    select 1 from public.order_clarifications
    where order_id = p_order_id
      and answered_at is null
      and resolved_by_edit_at is null
  ) then
    raise exception 'clarification_already_open';
  end if;

  insert into public.order_clarifications (order_id, asked_by_user_id, question, needs_edit)
  values (p_order_id, auth.uid(), btrim(p_note), true)
  returning id into v_id;

  update public.orders
     set status = 'NEEDS_DOCTOR_INPUT',
         -- Asking twice in a row must not overwrite the real previous status
         -- with NEEDS_DOCTOR_INPUT itself.
         status_before_doctor_input =
           case when v_order.status = 'NEEDS_DOCTOR_INPUT'
                then status_before_doctor_input
                else v_order.status end,
         updated_at = now()
   where id = p_order_id;

  return v_id;
end;
$$;

grant execute on function public.request_doctor_input(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- The doctor saved an edit, so the request is met.
--
-- Reads the order FOR UPDATE: edit_order writes `orders` and then inserts the
-- order_edits row, so this fires inside that transaction and must see the row
-- edit_order just wrote, not a stale copy.
-- ---------------------------------------------------------------------------
create or replace function public.close_doctor_input_on_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.order_status;
  v_prev   public.order_status;
begin
  select status, status_before_doctor_input
    into v_status, v_prev
    from public.orders
   where id = new.order_id
     for update;

  if v_status is distinct from 'NEEDS_DOCTOR_INPUT' then
    return new;
  end if;

  update public.orders
     -- A null previous status means the value was set by hand rather than
     -- through request_doctor_input. RECEIVED is the honest floor: the lab has
     -- the case and has not started it.
     set status                     = coalesce(v_prev, 'RECEIVED'),
         status_before_doctor_input = null,
         updated_at                 = now()
   where id = new.order_id;

  update public.order_clarifications
     set resolved_by_edit_at = now()
   where order_id = new.order_id
     and needs_edit
     and answered_at is null
     and resolved_by_edit_at is null;

  return new;
end;
$$;

drop trigger if exists close_doctor_input_on_edit on public.order_edits;
create trigger close_doctor_input_on_edit
  after insert on public.order_edits
  for each row execute function public.close_doctor_input_on_edit();

-- ---------------------------------------------------------------------------
-- Verify (every one should be true):
-- ---------------------------------------------------------------------------
--   select 'NEEDS_DOCTOR_INPUT' = any(enum_range(null::public.order_status)::text[]);
--   select count(*) = 2 from information_schema.columns
--     where table_name='order_clarifications'
--       and column_name in ('needs_edit','resolved_by_edit_at');
--   select indexdef like '%resolved_by_edit_at is null%' from pg_indexes
--     where indexname = 'order_clarifications_one_open';
--   select count(*) = 1 from pg_trigger
--     where tgrelid = 'public.order_edits'::regclass
--       and tgname = 'close_doctor_input_on_edit';
--   -- and, as a lab that does not own the order, this must raise not_your_lab:
--   --   select public.request_doctor_input('<other lab order>', 'test');
-- ---------------------------------------------------------------------------
