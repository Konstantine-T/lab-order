-- ---------------------------------------------------------------------------
-- 0029 — the lab asks, the doctor answers.
--
-- NEEDS_CLARIFICATION already existed and already lit the doctor's badge, but
-- nothing carried the actual question: the doctor saw "needs clarification" and
-- had to phone the lab to find out what was unclear. This adds the missing
-- half — one question, one answer, both kept on the order.
--
-- WHY A TABLE AND NOT TWO COLUMNS ON `orders`
--   A lab can move an order out of NEEDS_CLARIFICATION and back into it later.
--   With columns, the second question would overwrite the first exchange. A row
--   per exchange keeps the history, matches the order_edits precedent, and is
--   the shape an in-app message thread grows out of later.
--
-- WHY TWO RPCs AND NOT DIRECT WRITES
--   The status change and the question have to land together. A client doing
--   `update status` then `insert question` can succeed at the first and fail at
--   the second, which lands the order in exactly the state this migration
--   exists to remove. Doing it in one function also makes "you cannot ask an
--   empty question" a database rule rather than a disabled button.
--
-- Fully idempotent — safe to re-run.
-- ---------------------------------------------------------------------------

create table if not exists public.order_clarifications (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references public.orders(id) on delete cascade,
  asked_by_user_id    uuid not null references public.users(id),
  question            text not null check (char_length(btrim(question)) between 1 and 2000),
  asked_at            timestamptz not null default now(),
  answer              text check (answer is null or char_length(btrim(answer)) between 1 and 2000),
  answered_by_user_id uuid references public.users(id),
  answered_at         timestamptz,
  -- Either both answer columns are set or neither is; an answer without a time
  -- would break every "has this been answered?" read below.
  check ((answer is null) = (answered_at is null))
);

create index if not exists order_clarifications_order_idx
  on public.order_clarifications (order_id, asked_at desc);

-- At most one open question per order. Enforces "one question, one answer" in
-- the database rather than trusting the two RPCs to agree with each other.
create unique index if not exists order_clarifications_one_open
  on public.order_clarifications (order_id) where answered_at is null;

-- ---------------------------------------------------------------------------
-- RLS — the same participant shape as order_edits (0009), extended to clinics
-- the way 0021 did for order_files. `can_act_for_doctor` already returns true
-- for the doctor themselves, so it REPLACES `doctor_id = current_doctor_id()`
-- rather than sitting next to it.
--
-- No INSERT or UPDATE policy: rows are written only inside the two SECURITY
-- DEFINER functions below.
-- ---------------------------------------------------------------------------
alter table public.order_clarifications enable row level security;

drop policy if exists order_clarifications_participants_select on public.order_clarifications;
create policy order_clarifications_participants_select on public.order_clarifications
  for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (
          public.can_act_for_doctor(o.doctor_id)
          or public.current_user_owns_lab(o.lab_id)
          or public.current_user_role() = 'PLATFORM_ADMIN'
        )
    )
  );

grant select on public.order_clarifications to authenticated;

-- ---------------------------------------------------------------------------
-- request_clarification — the lab asks, and the order moves in the same breath.
--
-- Every failure raises a short, stable code rather than a sentence: the client
-- translates these, and a Postgres error string is English-only and talks about
-- RLS at the user.
-- ---------------------------------------------------------------------------
create or replace function public.request_clarification(
  p_order_id uuid,
  p_question text
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
  if btrim(coalesce(p_question, '')) = '' then
    raise exception 'question_required';
  end if;

  -- The partial unique index would raise anyway, but a 23505 gives the client
  -- nothing it can translate. Check first so the message is ours.
  if exists (
    select 1 from public.order_clarifications
    where order_id = p_order_id and answered_at is null
  ) then
    raise exception 'clarification_already_open';
  end if;

  insert into public.order_clarifications (order_id, asked_by_user_id, question)
  values (p_order_id, auth.uid(), btrim(p_question))
  returning id into v_id;

  update public.orders
     set status     = 'NEEDS_CLARIFICATION',
         updated_at = now()
   where id = p_order_id;

  return v_id;
end;
$$;

grant execute on function public.request_clarification(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- answer_clarification — the doctor (or the clinic admin acting for them)
-- replies.
--
-- It deliberately does NOT touch orders.status. Only the lab knows whether the
-- answer actually unblocks the work, so the lab moves the case on by hand; the
-- doctor answering never changes lab-owned state.
-- ---------------------------------------------------------------------------
create or replace function public.answer_clarification(
  p_clarification_id uuid,
  p_answer           text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row   public.order_clarifications%rowtype;
  v_order public.orders%rowtype;
begin
  select * into v_row from public.order_clarifications where id = p_clarification_id;
  if v_row.id is null then
    raise exception 'clarification_not_found';
  end if;

  select * into v_order from public.orders where id = v_row.order_id;
  if not public.can_act_for_doctor(v_order.doctor_id) then
    raise exception 'not_your_order';
  end if;
  if v_row.answered_at is not null then
    raise exception 'already_answered';
  end if;
  if v_order.status in ('COMPLETED', 'CANCELLED') then
    raise exception 'order_terminal';
  end if;
  if btrim(coalesce(p_answer, '')) = '' then
    raise exception 'answer_required';
  end if;

  update public.order_clarifications
     set answer              = btrim(p_answer),
         answered_by_user_id = auth.uid(),
         answered_at         = now()
   where id = p_clarification_id;
end;
$$;

grant execute on function public.answer_clarification(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Verify (every one should be true):
-- ---------------------------------------------------------------------------
--   select relrowsecurity from pg_class where oid = 'public.order_clarifications'::regclass;
--   select count(*) = 1 from pg_policies
--     where schemaname='public' and tablename='order_clarifications';
--   select count(*) = 2 from pg_proc
--     where pronamespace='public'::regnamespace
--       and proname in ('request_clarification','answer_clarification');
--   select count(*) = 1 from pg_indexes
--     where tablename='order_clarifications' and indexname='order_clarifications_one_open';
--   -- and, as a lab that does not own the order, both of these must raise:
--   --   select public.request_clarification('<other lab order>', 'test');   -- not_your_lab
--   --   select public.request_clarification('<completed order>', 'test');   -- order_terminal
