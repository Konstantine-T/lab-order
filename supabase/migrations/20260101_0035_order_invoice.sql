-- ---------------------------------------------------------------------------
-- 0035 — the lab attaches an invoice document to an order.
--
-- The lab uploads a document alongside the final price; the doctor and the
-- clinic see it on the order and download it. Replacing it re-arms an alert
-- that only an explicit acknowledgement clears.
--
-- ⚠️ RUN THIS FILE IN TWO PASSES.
--    Postgres refuses to use a new enum value in the same transaction that
--    added it, and the partial index below references 'INVOICE'. Pasting the
--    whole file into the SQL editor at once fails with
--        unsafe use of new value "INVOICE" of enum type file_source
--    Run PASS 1 alone, let it commit, then run PASS 2.
--
-- No new table: an invoice is an `order_files` row that the enum tells apart,
-- so it inherits the bucket, the RLS from 0021, the upload and download paths
-- and the error mapping already in orderFilesApi.
--
-- No boolean "seen" flag either. One timestamp on the order is compared
-- against the invoice row's own created_at, so "never seen", "seen" and
-- "replaced since seen" all fall out of data that cannot contradict itself —
-- the drift that `has_unreviewed_edits` keeps running into.
--
-- Fully idempotent — safe to re-run (both passes).
-- ---------------------------------------------------------------------------


-- ===== PASS 1 — run this statement alone, then run the rest ===============

alter type public.file_source add value if not exists 'INVOICE';


-- ===== PASS 2 — everything below, after PASS 1 has committed ==============

alter table public.orders
  add column if not exists invoice_acknowledged_at timestamptz;

comment on column public.orders.invoice_acknowledged_at is
  'When the doctor (or the clinic acting for them) last confirmed they had seen
   the invoice. Compared against the current INVOICE row''s created_at: null
   means never seen, earlier means the lab has replaced it since. No boolean
   flag — two timestamps cannot disagree with each other.';

-- "Replace, not versioned", enforced here rather than trusted to the RPC.
create unique index if not exists order_files_one_invoice
  on public.order_files (order_id) where file_source = 'INVOICE';


-- ── Swap the invoice, atomically ──────────────────────────────────────────
--
-- The client uploads to storage first (reusing uploadOrderFile's storage half)
-- and then calls this. The delete and the insert have to be one statement: a
-- client doing both could succeed at the first and leave the order with no
-- invoice at all while the doctor is still being told there is one.
--
-- The alert re-arms by itself — see the note on the update below.
create or replace function public.replace_order_invoice(
  p_order_id        uuid,
  p_storage_path    text,
  p_file_name       text,
  p_file_type       text,
  p_file_size_bytes bigint
)
returns table (new_file_id uuid, previous_storage_path text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_prev  text;
  v_id    uuid;
begin
  select * into v_order from public.orders where id = p_order_id;
  if v_order.id is null then
    raise exception 'order_not_found';
  end if;
  if not public.current_user_owns_lab(v_order.lab_id) then
    raise exception 'not_your_lab';
  end if;
  -- A cancelled case has no money left to invoice.
  if v_order.status = 'CANCELLED' then
    raise exception 'order_cancelled';
  end if;
  if coalesce(btrim(p_storage_path), '') = '' then
    raise exception 'storage_path_required';
  end if;

  -- Handed back so the client can best-effort remove the old object. If that
  -- fails the object is orphaned, which is acceptable and already true of
  -- uploadOrderFile's own rollback path.
  select storage_path into v_prev
    from public.order_files
   where order_id = p_order_id and file_source = 'INVOICE';

  delete from public.order_files
   where order_id = p_order_id and file_source = 'INVOICE';

  insert into public.order_files (
    order_id, uploaded_by_user_id, uploaded_by_role,
    storage_path, file_name, file_type, file_size_bytes, file_source
  ) values (
    p_order_id, auth.uid(), 'LAB_MAIN_ADMIN',
    btrim(p_storage_path), p_file_name, p_file_type, p_file_size_bytes, 'INVOICE'
  )
  returning id into v_id;

  -- The acknowledgement timestamp is deliberately NOT cleared.
  --
  -- Clearing it would re-arm the alert — but it would also destroy the only
  -- thing that distinguishes "the lab changed the invoice" from "the lab
  -- attached an invoice", and the doctor would be told the wrong one every
  -- time. It does not need clearing: the new row's `created_at` is later than
  -- any previous acknowledgement, so the comparison in `invoiceState` already
  -- reads as unacknowledged. Keeping the old timestamp is what makes the
  -- second message possible.
  update public.orders
     set updated_at = now()
   where id = p_order_id;

  return query select v_id, v_prev;
end;
$$;

revoke all on function public.replace_order_invoice(uuid, text, text, text, bigint)
  from public, anon, authenticated;
grant execute on function public.replace_order_invoice(uuid, text, text, text, bigint)
  to authenticated;


-- ── The doctor says they have seen it ─────────────────────────────────────

create or replace function public.acknowledge_order_invoice(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where id = p_order_id;
  if v_order.id is null then
    raise exception 'order_not_found';
  end if;
  -- Covers the doctor and the clinic acting for them, as everywhere else.
  if not public.can_act_for_doctor(v_order.doctor_id) then
    raise exception 'not_your_order';
  end if;
  if not exists (
    select 1 from public.order_files
     where order_id = p_order_id and file_source = 'INVOICE'
  ) then
    raise exception 'no_invoice';
  end if;

  update public.orders
     set invoice_acknowledged_at = now(),
         updated_at              = now()
   where id = p_order_id;
end;
$$;

revoke all on function public.acknowledge_order_invoice(uuid) from public, anon, authenticated;
grant execute on function public.acknowledge_order_invoice(uuid) to authenticated;

-- No new RLS. `order_files` already scopes reads to the order's participants
-- (0021) and the lab's INSERT/DELETE policies still apply; both functions are
-- SECURITY DEFINER and re-check ownership themselves.

-- ---------------------------------------------------------------------------
-- Verify (every one should be true):
-- ---------------------------------------------------------------------------
--   select count(*) = 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
--     where t.typname = 'file_source' and e.enumlabel = 'INVOICE';
--   select count(*) = 1 from information_schema.columns
--     where table_name = 'orders' and column_name = 'invoice_acknowledged_at';
--   select count(*) = 1 from pg_indexes
--     where schemaname = 'public' and indexname = 'order_files_one_invoice';
--   select count(*) = 2 from pg_proc
--     where proname in ('replace_order_invoice', 'acknowledge_order_invoice');
--   -- and neither is reachable without a login:
--   select not has_function_privilege('anon', oid, 'EXECUTE') from pg_proc
--     where proname in ('replace_order_invoice', 'acknowledge_order_invoice');
--   -- a second INVOICE row must be refused by the index:
--   --   insert ... file_source = 'INVOICE' twice for one order -> unique violation
-- ---------------------------------------------------------------------------
