-- ---------------------------------------------------------------------------
-- 0039 — a logged-out visitor reads a lab's storefront, not its bank details.
--
-- DATA EXPOSURE. Found while reviewing 0034's guest browsing.
--
-- THE LEAK
--   0034 (and all-in-one.sql before it) granted table-level SELECT on
--   public.labs to `anon`. RLS (`labs_marketplace_read`) limits WHICH rows a
--   guest sees — approved, active labs — but RLS cannot limit columns, so every
--   column of those rows went with them. With nothing but the public anon key
--   that ships in the JS bundle:
--
--     GET /rest/v1/labs?select=*
--
--   returned, for every approved lab, on lab-order-dev (2026-10-01):
--     owner_user_id, legal_name, identification_code, legal_address, country,
--     contact_person_name, bank_name, bank_account_iban, payment_instructions,
--     approval_note, approved_at, approved_by_user_id, updated_at
--   next to the storefront fields. A registered company's tax id, its IBAN and
--   the admin's internal approval note are not catalogue data.
--
-- THE FIX
--   Column-level privileges. `anon` loses its table-level grant and gets SELECT
--   on exactly the columns a signed-out page reads (the list below, with where
--   each is read). Rows are still gated by `labs_marketplace_read`, unchanged.
--
--   A guest query that names a column outside this list — including
--   `select('*')` and an unqualified `labs(*)` embed — now fails with 42501
--   instead of leaking. Every guest query was checked to name its columns.
--
--   `authenticated` is NOT touched (owner decision): a signed-in doctor is the
--   lab's business counterparty and may see its legal and bank details for
--   invoicing, the lab owner edits them, the admin reviews them. RLS already
--   scopes those reads by row.
--
-- WHAT A GUEST READS, AND WHERE
--   id, public_name, city, logo_url,
--   public_translations (0037)      marketplace, landing catalogue, lab page,
--                                   order wizard (+ its header's name lookup)
--   short_description               marketplace card, lab page
--   price_lists (0038)              marketplace card, lab page
--   created_at                      marketplace card's "New" badge
--   contact_phone, contact_email,   lab page's contact chips (address, phone /
--   working_address                 WhatsApp link, email); the wizard's files
--                                   card shows the lab's email
--   approval_status, is_active      the `.eq(...)` filters on every guest
--                                   query, and the sub-selects of the anon
--                                   policies on lab_services / lab_forms /
--                                   lab_form_versions — a sub-select inside a
--                                   policy runs with the querying role's
--                                   privileges, so without these two the whole
--                                   guest catalogue would fail with 42501.
--
--   Files: src/pages/doctor/MarketplacePage.tsx, LabPublicProfilePage.tsx,
--   OrderCreateWizard.tsx (its lab query also feeds WizardHeader's name),
--   src/features/public/landing/useLandingLabs.ts.
--
-- ⚠️ FROM NOW ON, A NEW `labs` COLUMN IS INVISIBLE TO GUESTS until it is
--    added to the grant below. A guest page that selects it gets 42501 (the
--    signed-in pages keep working, which is how this would slip through
--    review). Add the column here (and to the same list in 0034 and
--    all-in-one.sql), re-run this file, and test signed out.
--
-- REPLAY ORDER. `20260101_0034_public_browsing.sql` and `all-in-one.sql` used
--    to say `grant select on public.labs to anon` (table-level), so replaying
--    either after this file re-opened the leak. Both now grant this file's
--    column list instead — only the columns that exist at that point, so they
--    still run on a fresh database — and a replay no longer widens anything.
--    A copy of either from before that change does: re-run this file after
--    replaying one (verify step 1 shows it).
--
-- ⚠️ Needs 0037 and 0038 applied first (it grants their columns). The guard
--    below refuses to run otherwise, before anything changes.
--
-- THE OTHER CATALOGUE TABLES 0034 OPENED TO anon — reviewed, reads unchanged
--   lab_services              storefront copy, turnaround, cover image, form
--                             link, sort order. Nothing private.
--   lab_forms                 PUBLISHED forms of live labs: title, status,
--                             template and version ids. Nothing private.
--   lab_form_versions         configuration_json (the lab's questions) and
--                             pricing_configuration_json (its prices) — what
--                             the guest wizard renders and prices with. The
--                             policy admits every version of a published
--                             form, not only the current one, so superseded
--                             price lists are readable too. Left as is: the
--                             lab published them, and `lfv_public_read` is the
--                             same policy that lets a signed-in doctor open
--                             an order placed on an older version.
--   platform_form_templates,  platform-wide reference data.
--   platform_template_fields
--   Their SELECT stays table-level. What does change: Supabase's platform
--   default privileges normally give `anon` INSERT / UPDATE / DELETE /
--   TRUNCATE on every table created in `public` (the anon key cannot show
--   whether this project has them — verify step 4 does), leaving only the
--   absence of an anon write policy in front of them. A guest writes nothing,
--   so those privileges are revoked here (labs included, by the `revoke all`).
--   TRUNCATE in particular is not subject to RLS at all.
--
-- Fully idempotent — safe to re-run. `revoke all` on a table also drops every
-- column-level grant on it, so a replay re-states the list rather than
-- accumulating onto an older one.
-- ---------------------------------------------------------------------------

-- ---------- 0) Prerequisites -------------------------------------------------
-- A column grant on a missing column raises, and in a runner that does not
-- wrap the file in one transaction that would leave anon with no labs access
-- at all. Check first, change nothing if the order is wrong.
do $$
begin
  if (
    select count(*) from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'labs'
       and column_name in ('public_translations', 'price_lists')
  ) <> 2 then
    raise exception '0039 needs 0037 (labs.public_translations) and 0038 (labs.price_lists) applied first'
      using errcode = '55000';
  end if;
end $$;

-- ---------- 1) labs: columns, not the table ----------------------------------
revoke all on table public.labs from anon;

grant select (
  id,
  public_name,
  short_description,
  logo_url,
  city,
  working_address,
  contact_phone,
  contact_email,
  created_at,
  public_translations,
  price_lists,
  approval_status,
  is_active
) on table public.labs to anon;

-- ---------- 2) The rest of the catalogue: read, never write ------------------
revoke insert, update, delete, truncate, references, trigger
  on table public.lab_services,
           public.lab_forms,
           public.lab_form_versions,
           public.platform_form_templates,
           public.platform_template_fields
  from anon;

-- Re-stated so this file alone says what anon may do with them (as 0034).
grant select
  on table public.lab_services,
           public.lab_forms,
           public.lab_form_versions,
           public.platform_form_templates,
           public.platform_template_fields
  to anon;

-- ---------------------------------------------------------------------------
-- Verify:
-- ---------------------------------------------------------------------------
--   -- 1. anon has no table-level privilege on labs, and column SELECT on
--   --    exactly the 13 (expect: f | f | 13):
--   select has_table_privilege('anon', 'public.labs', 'select') as tbl_select,
--          has_table_privilege('anon', 'public.labs', 'update') as tbl_update,
--          (select count(*) from information_schema.column_privileges
--            where table_schema = 'public' and table_name = 'labs'
--              and grantee = 'anon' and privilege_type = 'SELECT') as anon_cols;
--
--   -- 2. The private columns are closed (expect 0 rows):
--   select column_name from information_schema.column_privileges
--    where table_schema = 'public' and table_name = 'labs' and grantee = 'anon'
--      and column_name in ('owner_user_id', 'legal_name', 'identification_code',
--                          'legal_address', 'country', 'contact_person_name',
--                          'bank_name', 'bank_account_iban', 'payment_instructions',
--                          'approval_note', 'approved_at', 'approved_by_user_id',
--                          'updated_at');
--
--   -- 3. authenticated is unchanged (expect t):
--   select has_table_privilege('authenticated', 'public.labs', 'select');
--
--   -- 4. anon can read, not write, the other catalogue tables
--   --    (expect 5 rows, each t | f | f | f | f):
--   select t,
--          has_table_privilege('anon', t, 'select')   as sel,
--          has_table_privilege('anon', t, 'insert')   as ins,
--          has_table_privilege('anon', t, 'update')   as upd,
--          has_table_privilege('anon', t, 'delete')   as del,
--          has_table_privilege('anon', t, 'truncate') as trn
--     from unnest(array['public.lab_services', 'public.lab_forms',
--                       'public.lab_form_versions', 'public.platform_form_templates',
--                       'public.platform_template_fields']) as t;
--
--   -- 5. No anon/public policy sub-selects a labs column outside the grant.
--   --    Read the quals of every row this returns; each may only mention
--   --    labs.id / approval_status / is_active (today: lab_services_public_read,
--   --    lab_forms_public_read, lfv_public_read):
--   select tablename, policyname, qual from pg_policies
--    where schemaname = 'public' and tablename <> 'labs'
--      and (roles && array['anon', 'public']::name[])
--      and qual ilike '%labs%';
--
--   -- 6. As anon, in a transaction you roll back — every guest query shape:
--   begin;
--   set local role anon;
--   -- marketplace (+ the RLS sub-selects on lab_services/lab_forms/versions):
--   select l.id, l.public_name, l.city, l.short_description, l.logo_url, l.created_at,
--          l.public_translations, l.price_lists,
--          (select count(*) from public.lab_services s where s.lab_id = l.id) as services,
--          (select count(*) from public.lab_forms f where f.lab_id = l.id) as forms,
--          (select count(*) from public.lab_form_versions v
--             join public.lab_forms f on f.id = v.lab_form_id where f.lab_id = l.id) as versions
--     from public.labs l
--    where l.approval_status = 'APPROVED_ACTIVE' and l.is_active
--    order by l.public_name;                        -- rows, services > 0
--   -- lab page:
--   select id, contact_phone, contact_email, working_address from public.labs limit 1;
--   rollback;
--
--   begin; set local role anon;
--   select bank_account_iban from public.labs;      -- ERROR 42501 permission denied
--   rollback;
--   begin; set local role anon;
--   select * from public.labs;                      -- ERROR 42501 permission denied
--   rollback;
--
--   -- 7. Over REST with the anon key (what a stranger can do):
--   --      GET /rest/v1/labs?select=id,public_name,price_lists  -> 200, approved labs
--   --      GET /rest/v1/labs?select=*                           -> 401, code 42501
--   --      GET /rest/v1/labs?select=bank_account_iban           -> 401, code 42501
--   --    and signed out in the app: / (landing catalogue), /labs, /labs/<id>,
--   --    /order/new?lab=…&service=… all render with prices and no error.
-- ---------------------------------------------------------------------------
