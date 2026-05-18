-- ============================================================================
-- Remove deprecated platform form templates.
--
-- Removes: TEMPORARY_CROWN, ZIRCONIA_ON_IMPLANT, TEMPORARY_ON_IMPLANT,
--          MOCKUP_WAXUP, REMOVABLE_PROSTHESIS
--
-- IMPORTANT: This deletes the template rows AND their associated template
-- fields. It does NOT affect existing lab_forms or lab_form_versions that
-- were already created from these templates — those are self-contained
-- snapshots and remain intact.
--
-- Run in Supabase SQL Editor. Idempotent — safe to re-run.
-- ============================================================================

do $$
declare
  v_codes text[] := array[
    'TEMPORARY_CROWN',
    'ZIRCONIA_ON_IMPLANT',
    'TEMPORARY_ON_IMPLANT',
    'MOCKUP_WAXUP',
    'REMOVABLE_PROSTHESIS'
  ];
begin
  -- Fields are cascade-deleted when the template row is deleted,
  -- assuming a foreign key with ON DELETE CASCADE exists. If not, delete
  -- fields first.
  delete from public.platform_template_fields
   where template_id in (
     select id from public.platform_form_templates
      where code = any(v_codes)
   );

  delete from public.platform_form_templates
   where code = any(v_codes);

  raise notice 'Removed deprecated templates: %', v_codes;
end $$;

-- Verification: should return 0 rows
select code, name
  from public.platform_form_templates
 where code in (
   'TEMPORARY_CROWN', 'ZIRCONIA_ON_IMPLANT', 'TEMPORARY_ON_IMPLANT',
   'MOCKUP_WAXUP', 'REMOVABLE_PROSTHESIS'
 );
