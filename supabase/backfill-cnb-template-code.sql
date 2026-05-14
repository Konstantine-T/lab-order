-- ============================================================================
-- One-time backfill for existing Crown & Bridge form versions.
--
-- It does TWO things:
--   1) Sets configuration_json._templateCode = 'CROWN_AND_BRIDGE' (so the
--      specialized renderer kicks in).
--   2) Replaces configuration_json.fields[] with the section-level field set
--      (treatments, shade, gingivalContouring, …) — all enabled, none required
--      by default. The lab can flip required toggles in the Fields tab.
--
-- lab_form_versions rows are normally immutable (trigger). We disable + re-
-- enable that trigger around the patch.
-- ============================================================================

alter table public.lab_form_versions disable trigger lab_form_versions_no_update;

-- 1) Tag with template code AND replace fields[] in one shot
update public.lab_form_versions v
   set configuration_json = jsonb_set(
         jsonb_set(
           v.configuration_json,
           '{_templateCode}',
           '"CROWN_AND_BRIDGE"'::jsonb
         ),
         '{fields}',
         $f$[
           {"code":"treatments",         "type":"cnb_treatments",          "label":"Treatments (tooth chart)",         "enabled":true, "required":true,  "helper_text":"", "affects_price":true,  "visible_to_doctor":true, "options":[]},
           {"code":"shade",              "type":"cnb_shade",               "label":"Shade",                            "enabled":true, "required":true,  "helper_text":"", "affects_price":false, "visible_to_doctor":true, "options":[]},
           {"code":"gingivalContouring", "type":"cnb_gingival_contouring", "label":"Gingival Contouring",              "enabled":true, "required":true,  "helper_text":"", "affects_price":false, "visible_to_doctor":true, "options":[]},
           {"code":"verticalDimension",  "type":"cnb_vertical_dimension",  "label":"Vertical Dimension for Occlusion", "enabled":true, "required":true,  "helper_text":"", "affects_price":false, "visible_to_doctor":true, "options":[]},
           {"code":"maxLengthOfCentrals","type":"cnb_max_length_centrals", "label":"Max Preferred Length of Centrals", "enabled":true, "required":true,  "helper_text":"", "affects_price":false, "visible_to_doctor":true, "options":[]},
           {"code":"checkDesign",        "type":"cnb_check_design",        "label":"Check Design",                     "enabled":true, "required":true,  "helper_text":"", "affects_price":false, "visible_to_doctor":true, "options":[]},
           {"code":"occlusalContact",    "type":"cnb_occlusal_contact",    "label":"Occlusal Contact",                 "enabled":true, "required":true,  "helper_text":"", "affects_price":false, "visible_to_doctor":true, "options":[]},
           {"code":"rxNotes",            "type":"cnb_rx_notes",            "label":"RX Notes",                         "enabled":true, "required":false, "helper_text":"", "affects_price":false, "visible_to_doctor":true, "options":[]}
         ]$f$::jsonb
       )
 where exists (
   select 1
     from public.lab_forms f
     join public.platform_form_templates t on t.id = f.template_id
    where f.id = v.lab_form_id
      and t.code = 'CROWN_AND_BRIDGE'
 );

alter table public.lab_form_versions enable trigger lab_form_versions_no_update;

-- Verify
select v.id,
       v.version_number,
       v.configuration_json -> '_templateCode' as template_code,
       jsonb_array_length(v.configuration_json -> 'fields') as field_count
  from public.lab_form_versions v
  join public.lab_forms f on f.id = v.lab_form_id
  join public.platform_form_templates t on t.id = f.template_id
 where t.code = 'CROWN_AND_BRIDGE'
 order by v.version_number;
