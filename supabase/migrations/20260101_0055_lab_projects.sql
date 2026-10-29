-- ---------------------------------------------------------------------------
-- 0055: "Projects" for the lab, the history of each patient's orders.
--
-- Trello 5XVmpHyN. Owner decisions: a project is ONE patient record, i.e. one
-- patient of one doctor. The same person sent by two doctors is two projects
-- (that is how patients are stored; nothing is ever merged by name or date of
-- birth). A project's page is its orders list, nothing more.
--
-- No new access. The lab already reads the patients of its own orders
-- (patients_lab_via_order, 0009) and its orders (orders_lab_select); what it
-- cannot get from PostgREST in one select is the grouping: one row per
-- patient with the LATEST order's doctor, clinic and status, and a page count
-- of projects rather than of orders. Hence one read function:
--
-- lab_projects(p_search, p_limit, p_offset) → one row per project of the
-- caller's lab, SECURITY DEFINER, stable, authenticated only.
--
--   * The caller's lab: labs.owner_user_id = auth.uid(); should one owner
--     ever hold several labs, the first by created_at, id (0048's rule).
--     No lab (a doctor, a clinic admin, a platform admin, no session) → no
--     rows. Not keyed on current_doctor_id: since 0048 a lab owner also has
--     a buying profile, and its PURCHASES (orders it placed with other labs,
--     doctor_id = that profile, lab_id = the seller) are never its projects.
--     Only lab_id = the caller's lab counts.
--   * Over that lab's orders WITH a patient (patient_id null = a purchase
--     without one, 0048: no project), grouped by patient_id:
--       patient_id, first_name, last_name, date_of_birth   patients
--       doctor_name    the latest order's doctor_snapshot, first + last (a
--                      buying lab's snapshot carries its name, last_name '')
--       from_lab       the latest order is a purchase from another lab
--                      (buyer_lab_id, never the snapshot's is_lab)
--       clinic_name, branch_name, city   the latest order's
--                      work_location_snapshot (the clinic can differ between
--                      orders; the latest is shown). An order placed for a
--                      clinic (0050: clinic_id set, no work location) has a
--                      location row's keys: the clinic's public_name, branch
--                      null, its city or '' (read as null)
--       order_count    all of the patient's orders at this lab
--       open_count     those not COMPLETED / CANCELLED
--       first_order_at, last_order_at    min / max(created_at)
--       last_status    the latest order's status
--       total_count    projects matching the search, before limit / offset
--     "Latest" = created_at desc, then id desc (a total order, so two orders
--     created in the same instant cannot flip between refetches).
--   * THE TRASH (0054, order_trash): an order with a 'LAB' row that is not
--     cleared (still in the trash or gone for good) is left out, of the
--     counts as well; a project whose orders are all trashed disappears. A
--     cleared row (restored, or the order reopened) hides nothing: this
--     function is SECURITY DEFINER, so it says cleared_at is null itself
--     where the clients get it from RLS. A 'DOCTOR' row hides the order from
--     the doctor only and changes nothing here.
--   * Search: p_search trimmed, internal whitespace collapsed; blank = no
--     filter. Case-insensitive substring (ilike, with %, _ and \ in the
--     search taken literally) over the patient's "first last" and
--     "last first" (so either order, and either name alone), and over every
--     counted order of the project: its doctor name, its clinic name, its
--     order code. A project matches when any of them does.
--   * Order: last_order_at desc (most recently active first), patient_id.
--     p_limit clamped to 1..100 (null = 25), p_offset to >= 0.
--
-- Nothing here writes. Idempotent: create or replace, revoke / grant. Needs
-- 0054 first (the body reads public.order_trash; the check below says so
-- instead of a bare "relation does not exist").
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.order_trash') is null then
    raise exception '0055 needs 0054 (public.order_trash) applied first';
  end if;
end $$;


-- ── lab_projects ─────────────────────────────────────────────────────────

create or replace function public.lab_projects(
  p_search text    default null,
  p_limit  integer default 25,
  p_offset integer default 0
)
returns table (
  patient_id     uuid,
  first_name     text,
  last_name      text,
  date_of_birth  date,
  doctor_name    text,
  from_lab       boolean,
  clinic_name    text,
  branch_name    text,
  city           text,
  order_count    integer,
  open_count     integer,
  first_order_at timestamptz,
  last_order_at  timestamptz,
  last_status    public.order_status,
  total_count    integer
)
language sql
stable
security definer
set search_path = public
as $$
  with my_lab as (
    select l.id
      from public.labs l
     where l.owner_user_id = auth.uid()
     order by l.created_at, l.id
     limit 1
  ),
  needle as (
    -- '%...%' with the search's own wildcards escaped; null = no search.
    select case
             when btrim(coalesce(p_search, '')) = '' then null
             else '%' || replace(replace(replace(
                    regexp_replace(btrim(p_search), '\s+', ' ', 'g'),
                    '\', '\\'), '%', '\%'), '_', '\_') || '%'
           end as pat
  ),
  lab_orders as (
    select o.id,
           o.patient_id,
           o.order_code,
           o.status,
           o.created_at,
           o.buyer_lab_id,
           nullif(btrim(concat_ws(' ',
             nullif(btrim(o.doctor_snapshot ->> 'first_name'), ''),
             nullif(btrim(o.doctor_snapshot ->> 'last_name'), ''))), '') as doctor_name,
           nullif(btrim(o.work_location_snapshot ->> 'clinic_name'), '') as clinic_name,
           nullif(btrim(o.work_location_snapshot ->> 'branch_name'), '') as branch_name,
           nullif(btrim(o.work_location_snapshot ->> 'city'), '')        as city
      from public.orders o
      join my_lab on my_lab.id = o.lab_id
     where o.patient_id is not null
       -- Hidden from the lab: in its trash or gone (0054), not cleared. Any
       -- 'LAB' row of this order is the lab's own: side LAB means the
       -- order's lab.
       and not exists (
         select 1 from public.order_trash t
          where t.order_id = o.id and t.side = 'LAB' and t.cleared_at is null
       )
  ),
  projects as (
    select lo.patient_id,
           count(*)::integer as order_count,
           (count(*) filter (where lo.status not in ('COMPLETED', 'CANCELLED')))::integer
             as open_count,
           min(lo.created_at) as first_order_at,
           max(lo.created_at) as last_order_at,
           coalesce(bool_or(
             n.pat is not null and (
               lo.order_code ilike n.pat
               or regexp_replace(lo.doctor_name, '\s+', ' ', 'g') ilike n.pat
               or regexp_replace(lo.clinic_name, '\s+', ' ', 'g') ilike n.pat
             )), false) as order_hit
      from lab_orders lo
      cross join needle n
     group by lo.patient_id
  ),
  latest as (
    select distinct on (lo.patient_id) lo.*
      from lab_orders lo
     order by lo.patient_id, lo.created_at desc, lo.id desc
  ),
  matched as (
    select pr.patient_id,
           p.first_name,
           p.last_name,
           p.date_of_birth,
           la.doctor_name,
           la.buyer_lab_id is not null as from_lab,
           la.clinic_name,
           la.branch_name,
           la.city,
           pr.order_count,
           pr.open_count,
           pr.first_order_at,
           pr.last_order_at,
           la.status as last_status
      from projects pr
      join latest la         on la.patient_id = pr.patient_id
      join public.patients p on p.id = pr.patient_id
      cross join needle n
     where n.pat is null
        or pr.order_hit
        or regexp_replace(p.first_name || ' ' || p.last_name, '\s+', ' ', 'g') ilike n.pat
        or regexp_replace(p.last_name || ' ' || p.first_name, '\s+', ' ', 'g') ilike n.pat
  )
  select m.patient_id,
         m.first_name,
         m.last_name,
         m.date_of_birth,
         m.doctor_name,
         m.from_lab,
         m.clinic_name,
         m.branch_name,
         m.city,
         m.order_count,
         m.open_count,
         m.first_order_at,
         m.last_order_at,
         m.last_status,
         (count(*) over ())::integer as total_count
    from matched m
   order by m.last_order_at desc, m.patient_id
   limit  least(greatest(coalesce(p_limit, 25), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

comment on function public.lab_projects(text, integer, integer) is
  'The caller''s lab''s projects (5XVmpHyN, 0055): one row per patient record with orders at the lab, '
  'latest order''s doctor / clinic / status, counts, paged; LAB-trashed orders (0054) and orders '
  'without a patient left out. Empty for anyone who owns no lab.';

revoke all on function public.lab_projects(text, integer, integer) from public, anon;
grant execute on function public.lab_projects(text, integer, integer) to authenticated;


-- ---------------------------------------------------------------------------
-- Verify (every one should be true):
-- ---------------------------------------------------------------------------
--   select count(*) = 1 from pg_proc
--    where oid = to_regprocedure('public.lab_projects(text,integer,integer)')
--      and prosecdef and provolatile = 's' and 'search_path=public' = any(proconfig);
--   select count(*) = 1 from pg_proc where proname = 'lab_projects';
--   select has_function_privilege('authenticated', 'public.lab_projects(text,integer,integer)', 'execute')
--      and not has_function_privilege('anon', 'public.lab_projects(text,integer,integer)', 'execute');
--   select prosrc like '%order_trash%' and prosrc like '%cleared_at is null%'
--      and prosrc like '%patient_id is not null%'
--     from pg_proc where proname = 'lab_projects';
--
--   -- As a lab owner, in a transaction you roll back:
--   --   begin;
--   --   select set_config('request.jwt.claims', '{"sub":"<lab owner uuid>"}', true);
--   --   set local role authenticated;
--   --   select patient_id, first_name, last_name, doctor_name, order_count, open_count,
--   --          last_status, total_count
--   --     from public.lab_projects();                  -- one row per patient, newest first
--   --   select count(*) from public.lab_projects(null, 1000);   -- at most 100 rows
--   --   select * from public.lab_projects('<part of a patient''s last name>');
--   --   select * from public.lab_projects('<an order code>');   -- that order's project
--   --   rollback;
--
--   -- As a doctor or a clinic admin, the same select returns no rows; as anon
--   -- it is "permission denied for function lab_projects".
-- ---------------------------------------------------------------------------
