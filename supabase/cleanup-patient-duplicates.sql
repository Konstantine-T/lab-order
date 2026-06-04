-- =============================================================================
-- ONE-SHOT cleanup of historical duplicate patients.
--
-- For each (doctor_id, lower(first_name), lower(last_name)) group with more
-- than one row, picks a "canonical" row to keep and re-points all references
-- (orders, patient_cases) at it. Then deletes the now-orphaned rows.
--
-- Canonical row selection rule:
--   1. Most attached orders wins.
--   2. Tie-breaker: oldest created_at.
--   3. Final tie-breaker: smallest id::text (deterministic).
--
-- SAFETY:
--   - Wrapped in a single transaction. If anything fails, nothing changes.
--   - The `DRY_RUN` block at the top lets you preview what would happen before
--     committing. To actually run the cleanup, replace the `rollback;` at the
--     end with `commit;`.
--
-- USAGE:
--   1. Open Supabase SQL Editor.
--   2. Paste this entire script.
--   3. Run it as-is — the final `rollback;` keeps it a preview.
--   4. Review the output of the SELECT inside the dry-run block.
--   5. When satisfied, change the last line from `rollback;` to `commit;` and
--      re-run.
-- =============================================================================

begin;

-- Step 1: compute canonical patient per duplicate group.
create temp table dedup_canonical on commit drop as
with grouped as (
  select
    p.id,
    p.doctor_id,
    lower(p.first_name) as fn,
    lower(p.last_name)  as ln,
    p.created_at,
    (select count(*) from public.orders o where o.patient_id = p.id) as order_count
  from public.patients p
),
ranked as (
  select
    id, doctor_id, fn, ln,
    row_number() over (
      partition by doctor_id, fn, ln
      order by order_count desc, created_at asc, id::text asc
    ) as rn,
    first_value(id) over (
      partition by doctor_id, fn, ln
      order by order_count desc, created_at asc, id::text asc
    ) as canonical_id
  from grouped
)
select id as duplicate_id, canonical_id, doctor_id, fn, ln
from ranked
where rn > 1;  -- duplicates only — the canonical row itself isn't here

-- Step 2: preview what will happen.
select
  count(*) as duplicates_to_remove,
  count(distinct canonical_id) as canonical_rows_kept,
  count(distinct doctor_id) as affected_doctors
from dedup_canonical;

select
  d.fn || ' ' || d.ln as name,
  d.doctor_id,
  d.canonical_id,
  array_agg(d.duplicate_id) as duplicates,
  (select count(*) from public.orders o
    where o.patient_id = any(array_agg(d.duplicate_id))) as orders_to_repoint,
  (select count(*) from public.patient_cases c
    where c.patient_id = any(array_agg(d.duplicate_id))) as cases_to_repoint
from dedup_canonical d
group by d.fn, d.ln, d.doctor_id, d.canonical_id
order by orders_to_repoint desc nulls last
limit 50;

-- Step 3: re-point references.
update public.orders o
   set patient_id = d.canonical_id
  from dedup_canonical d
 where o.patient_id = d.duplicate_id;

update public.patient_cases c
   set patient_id = d.canonical_id
  from dedup_canonical d
 where c.patient_id = d.duplicate_id;

-- Step 4: delete the now-unreferenced duplicate rows.
delete from public.patients p
 using dedup_canonical d
 where p.id = d.duplicate_id;

-- DRY RUN — change to `commit;` after reviewing the preview output above.
rollback;
