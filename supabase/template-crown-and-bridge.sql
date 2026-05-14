-- ============================================================================
-- Crown & Bridge platform template — section-level fields.
--
-- Each row represents one section of the structured CnB form. The lab can
-- toggle any section on/off and mark it required from the lab Fields tab.
-- The actual UI structure (pills, conditional mm inputs, tooth chart, etc.)
-- is rendered by <CrownAndBridgeForm> based on these toggles.
--
-- Idempotent: safe to re-run.
-- ============================================================================

-- 1) Rename the platform template (handle migration from ZIRCONIA_CROWN too)
update public.platform_form_templates
   set code = 'CROWN_AND_BRIDGE',
       name = 'Crown & Bridge',
       description = 'Crowns, bridges, pontics, veneers, inlays and onlays.'
 where code in ('ZIRCONIA_CROWN', 'CROWN_AND_BRIDGE');

-- 2) Replace its field set with the 8 sections
delete from public.platform_template_fields
 where template_id = (
   select id from public.platform_form_templates where code = 'CROWN_AND_BRIDGE'
 );

do $$
declare v_id uuid;
begin
  select id into v_id from public.platform_form_templates where code = 'CROWN_AND_BRIDGE';
  if v_id is null then
    raise notice 'CROWN_AND_BRIDGE template not found, skipping field seed';
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
select code, name from public.platform_form_templates where code = 'CROWN_AND_BRIDGE';

select field_code, label, sort_order
  from public.platform_template_fields
 where template_id = (select id from public.platform_form_templates where code = 'CROWN_AND_BRIDGE')
 order by sort_order;
