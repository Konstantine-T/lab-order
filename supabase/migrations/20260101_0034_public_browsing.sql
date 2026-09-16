-- ---------------------------------------------------------------------------
-- 0034 — a logged-out visitor can read the catalogue.
--
-- Guest browsing: someone without an account opens the marketplace, a lab, a
-- service, and fills in the lab's order form — then signs in to send it. The
-- marketplace already worked for `anon` (labs + lab_services, 0004 and
-- phase4-6), but the order form itself did not: every policy on the form
-- tables was `to authenticated`, so the wizard rendered an empty page.
--
-- WHAT CHANGES
--   Four read policies gain `anon` next to `authenticated`. Their USING
--   clauses are copied verbatim from phase4-6.sql — PUBLISHED forms on
--   APPROVED_ACTIVE, is_active labs — because that is already the right
--   boundary for the public; nothing here widens what a row must satisfy.
--   The matching table GRANTs are added, since a policy on a table the role
--   cannot SELECT from at all is moot (phase4-6 §7 only granted lab_services).
--
-- WHAT DOES NOT
--   No other table gets an anon grant. patients, orders, order_answers,
--   order_drafts, doctor_work_locations, users — a guest reads the catalogue
--   and nothing else. The guest's own order lives in their browser until they
--   have an account to submit it under.
--
-- Fully idempotent — safe to re-run.
-- ---------------------------------------------------------------------------

-- ---------- 1) GRANTs -------------------------------------------------------
-- RLS gates *what* a role can read; GRANT gates *whether* it can touch the
-- table at all. `labs` and `lab_services` already have theirs (0004 §6,
-- phase4-6 §7) and are repeated here so this file is the one place that says
-- what anon may see.
grant select on public.labs                     to anon;
grant select on public.lab_services             to anon;
grant select on public.lab_forms                to anon;
grant select on public.lab_form_versions        to anon;
grant select on public.platform_form_templates  to anon;
grant select on public.platform_template_fields to anon;

-- ---------- 2) Policies -----------------------------------------------------
-- Templates: the form's `_templateCode` and field definitions. `using (true)`
-- is what phase4-6 had; a template is platform-wide reference data.
drop policy if exists pft_read on public.platform_form_templates;
create policy pft_read on public.platform_form_templates
  for select to anon, authenticated using (true);

drop policy if exists ptf_read on public.platform_template_fields;
create policy ptf_read on public.platform_template_fields
  for select to anon, authenticated using (true);

-- Forms: only PUBLISHED ones on a live, approved lab.
drop policy if exists lab_forms_public_read on public.lab_forms;
create policy lab_forms_public_read on public.lab_forms
  for select to anon, authenticated
  using (
    status = 'PUBLISHED'
    and exists (
      select 1 from public.labs l
      where l.id = lab_id and l.approval_status = 'APPROVED_ACTIVE' and l.is_active = true
    )
  );

-- Versions: reachable only through a published form on a live, approved lab.
-- The version carries configuration_json and pricing_configuration_json —
-- the questions and the price list — which is exactly what the guest wizard
-- needs and exactly what a lab already shows any signed-in doctor.
drop policy if exists lfv_public_read on public.lab_form_versions;
create policy lfv_public_read on public.lab_form_versions
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.lab_forms lf
      join public.labs l on l.id = lf.lab_id
      where lf.id = lab_form_id
        and lf.status = 'PUBLISHED'
        and l.approval_status = 'APPROVED_ACTIVE'
        and l.is_active = true
    )
  );

-- ---------------------------------------------------------------------------
-- Verify:
-- ---------------------------------------------------------------------------
--   -- 1. Every catalogue policy names anon (expect 6 rows, all true):
--   select tablename, policyname, 'anon' = any(roles) as has_anon
--     from pg_policies
--    where schemaname = 'public'
--      and policyname in ('labs_marketplace_read', 'lab_services_public_read',
--                         'lab_forms_public_read', 'lfv_public_read',
--                         'pft_read', 'ptf_read')
--    order by tablename;
--
--   -- 2. No policy on the private tables admits anon (expect 0 rows):
--   select tablename, policyname from pg_policies
--    where schemaname = 'public'
--      and tablename in ('orders', 'patients', 'order_answers', 'order_drafts',
--                        'doctor_work_locations', 'users', 'order_files')
--      and 'anon' = any(roles);
--
--   -- 3. As anon, the catalogue opens —
--   --    each of these is true on a project with at least one published form:
--   set role anon;
--   select count(*) > 0 from public.labs;
--   select count(*) > 0 from public.lab_services;
--   select count(*) > 0 from public.lab_forms;
--   select count(*) > 0 from public.lab_form_versions;
--   select count(*) > 0 from public.platform_form_templates;
--   select count(*) > 0 from public.platform_template_fields;
--   -- ...and the data does not. Each of these returns 0 (RLS on, no anon
--   -- policy) or raises "permission denied" (no anon grant either) — both are
--   -- correct; a row coming back is the failure:
--   select count(*) from public.orders;
--   select count(*) from public.patients;
--   select count(*) from public.order_answers;
--   select count(*) from public.doctor_work_locations;
--   select count(*) from public.order_drafts;
--   select count(*) from public.users;
--   reset role;
