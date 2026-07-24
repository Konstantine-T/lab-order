-- ============================================================================
-- Temporary Crown platform template.
--
-- Temporary Crown is a distinct, pickable platform template that reuses the
-- Crown & Bridge structured form 1:1 — the frontend renders <CrownAndBridgeForm>
-- for this code too (see isCnbTemplate() in src/features/orderForms/cnbTypes.ts).
-- Its field set is therefore identical to CROWN_AND_BRIDGE (same 8 sections /
-- cnb_* field types), and it uses the same per-tooth-material pricing.
--
-- Idempotent: safe to re-run.
-- ============================================================================

-- 1) Upsert the platform template row.
insert into public.platform_form_templates (code, name, description)
values (
  'TEMPORARY_CROWN',
  'Temporary Crown',
  'Provisional / temporary crowns and bridges.'
)
on conflict (code) do update
   set name        = excluded.name,
       description = excluded.description;

-- 2) Replace its field set with the 8 Crown & Bridge sections.
delete from public.platform_template_fields
 where template_id = (
   select id from public.platform_form_templates where code = 'TEMPORARY_CROWN'
 );

do $$
declare v_id uuid;
begin
  select id into v_id from public.platform_form_templates where code = 'TEMPORARY_CROWN';
  if v_id is null then
    raise notice 'TEMPORARY_CROWN template not found, skipping field seed';
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
select code, name from public.platform_form_templates where code = 'TEMPORARY_CROWN';

select field_code, label, sort_order
  from public.platform_template_fields
 where template_id = (select id from public.platform_form_templates where code = 'TEMPORARY_CROWN')
 order by sort_order;
