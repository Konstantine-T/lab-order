-- ============================================================================
-- Titanium Milling platform template.
-- Georgian: ტიტანის გამოჩარხვა   English: Titanium Milling
--
-- Titanium Milling now MIRRORS TEMPORARY CROWN / CROWN & BRIDGE (owner request):
-- it reuses the Crown & Bridge structured form 1:1 — the frontend renders
-- <CrownAndBridgeForm> for this code (see isCnbTemplate() in
-- src/features/orderForms/cnbTypes.ts), with the same 8 sections (cnb_* field
-- types) and the same per-tooth-material pricing.
--
-- It USED TO copy the Print Model (MODEL) field set and render the Model form.
-- This script replaces that: it reseeds the field set with the C&B sections.
--
-- Existing Titanium services are NOT affected — lab_form_versions are immutable
-- snapshots, so services published before this change keep their Model-form
-- version. Only NEW Titanium services pick up these C&B fields.
--
-- Run in the Supabase SQL Editor. Idempotent — safe to re-run.
-- ============================================================================

-- 1) Upsert the platform template row (description now reflects the C&B form).
insert into public.platform_form_templates (code, name, description)
values (
  'TITANIUM_MILLING',
  'Titanium Milling',
  'ტიტანის გამოჩარხვა. Mirrors Crown & Bridge — per-tooth treatments and per-material pricing.'
)
on conflict (code) do update
   set name        = excluded.name,
       description = excluded.description;

-- 2) Replace its field set with the 8 Crown & Bridge sections (delete-then-insert,
--    exactly as the Temporary Crown seed does — guarantees no stale MODEL fields).
delete from public.platform_template_fields
 where template_id = (
   select id from public.platform_form_templates where code = 'TITANIUM_MILLING'
 );

do $$
declare v_id uuid;
begin
  select id into v_id from public.platform_form_templates where code = 'TITANIUM_MILLING';
  if v_id is null then
    raise notice 'TITANIUM_MILLING template not found, skipping field seed';
    return;
  end if;

  insert into public.platform_template_fields
    (template_id, field_code, field_type, label, default_settings, sort_order)
  values
    (v_id, 'treatments',          'cnb_treatments',           'Treatments (tooth chart)',          '{"affects_price":true}'::jsonb, 10),
    (v_id, 'shade',               'cnb_shade',                'Shade',                             '{}'::jsonb, 20),
    (v_id, 'gingivalContouring',  'cnb_gingival_contouring',  'Gingival Contouring',               '{}'::jsonb, 30),
    (v_id, 'verticalDimension',   'cnb_vertical_dimension',   'Vertical Dimension for Occlusion',  '{}'::jsonb, 40),
    (v_id, 'maxLengthOfCentrals', 'cnb_max_length_centrals',  'Max Preferred Length of Centrals',  '{}'::jsonb, 50),
    (v_id, 'checkDesign',         'cnb_check_design',         'Check Design',                      '{}'::jsonb, 60),
    (v_id, 'occlusalContact',     'cnb_occlusal_contact',     'Occlusal Contact',                  '{}'::jsonb, 70),
    (v_id, 'rxNotes',             'cnb_rx_notes',             'RX Notes',                          '{}'::jsonb, 80);
end $$;

-- 3) Verification
select code, name, description
  from public.platform_form_templates where code = 'TITANIUM_MILLING';

select field_code, field_type, label, sort_order
  from public.platform_template_fields
 where template_id = (select id from public.platform_form_templates where code = 'TITANIUM_MILLING')
 order by sort_order;
