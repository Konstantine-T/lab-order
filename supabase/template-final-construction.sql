-- ============================================================================
-- Final Construction platform template.
-- Georgian: საბოლოო კონსტრუქცია
--
-- For redoing only the superstructure when the doctor did not like its design
-- (e.g. a bar and zirconia were made; only the zirconia is made again). It
-- reuses the Crown & Bridge structured form — the frontend renders
-- <FinalConstructionForm>, i.e. <CrownAndBridgeForm> with its design section on
-- (see TEMPLATE_CODE_FINAL_CONSTRUCTION / isCnbTemplate() in
-- src/features/orderForms/cnbTypes.ts and fcTypes.ts). Same 8 sections (cnb_*
-- field types) and per-tooth-material pricing as Crown & Bridge, plus:
--
--   fcDesign (fc_design) — tooth shape (ovoid / square / tapering) and a
--   free-text design note. Sort order 15: drawn right after the treatments.
--
-- It is NOT linked to the order it redoes; the doctor places a new order.
--
-- Idempotent: safe to re-run.
-- ============================================================================

-- 1) Upsert the platform template row.
insert into public.platform_form_templates (code, name, description)
values (
  'FINAL_CONSTRUCTION',
  'Final Construction',
  'The superstructure made again when its design was not liked — the Crown & Bridge form with tooth-shape and design choices.'
)
on conflict (code) do update
   set name        = excluded.name,
       description = excluded.description;

-- 2) Replace its field set with the 8 Crown & Bridge sections + the design section.
delete from public.platform_template_fields
 where template_id = (
   select id from public.platform_form_templates where code = 'FINAL_CONSTRUCTION'
 );

do $$
declare v_id uuid;
begin
  select id into v_id from public.platform_form_templates where code = 'FINAL_CONSTRUCTION';
  if v_id is null then
    raise notice 'FINAL_CONSTRUCTION template not found, skipping field seed';
    return;
  end if;

  insert into public.platform_template_fields
    (template_id, field_code, field_type, label, default_settings, sort_order)
  values
    (v_id, 'treatments',          'cnb_treatments',           'Treatments (tooth chart)',          '{"affects_price":true}'::jsonb, 10),
    (v_id, 'fcDesign',            'fc_design',                'Tooth design',                      '{}'::jsonb, 15),
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
  from public.platform_form_templates where code = 'FINAL_CONSTRUCTION';

select field_code, field_type, label, sort_order
  from public.platform_template_fields
 where template_id = (select id from public.platform_form_templates where code = 'FINAL_CONSTRUCTION')
 order by sort_order;
