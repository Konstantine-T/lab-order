-- ============================================================================
-- Titanium Milling platform template.
-- Georgian: ტიტანის გამოჩარხვა   English: Titanium Milling
--
-- Structurally identical to the "Print Model" (MODEL) template: it reuses the
-- exact same fields, so it renders with the same ModelForm on the frontend
-- (OrderForm routes both MODEL and TITANIUM_MILLING to ModelForm).
--
-- Rather than re-typing the field list, this copies the fields from the live
-- MODEL template, guaranteeing the two stay identical.
--
-- Also renames the MODEL template's DB name to "Print Model" (the app shows the
-- localized name from common.json → templates.MODEL.name; this just keeps the
-- raw DB row consistent for admins / fallback).
--
-- Run in Supabase SQL Editor. Idempotent — safe to re-run.
-- ============================================================================

do $$
declare
  v_model uuid;
  v_new   uuid;
begin

  -- 0) Locate the existing Print Model template (source of the field set).
  select id into v_model
    from public.platform_form_templates
   where code = 'MODEL';

  if v_model is null then
    raise exception 'MODEL template not found — seed the Print Model template first';
  end if;

  -- Keep the MODEL row's raw name consistent with the new "Print Model" label.
  update public.platform_form_templates
     set name = 'Print Model'
   where code = 'MODEL';

  -- 1) Insert the Titanium Milling template (idempotent on code).
  insert into public.platform_form_templates (code, name, description)
  values (
    'TITANIUM_MILLING',
    'Titanium Milling',
    'ტიტანის გამოჩარხვა. Same fields as Print Model. Lab configures which fields are shown and required.'
  )
  on conflict (code) do update
    set name        = excluded.name,
        description = excluded.description;

  select id into v_new
    from public.platform_form_templates
   where code = 'TITANIUM_MILLING';

  if v_new is null then
    raise exception 'Titanium Milling template insert failed';
  end if;

  -- 2) Copy MODEL's fields onto the new template verbatim (same codes, types,
  --    labels, settings, order) so the two forms are guaranteed identical.
  insert into public.platform_template_fields
    (template_id, field_code, field_type, label, default_settings, sort_order)
  select v_new, field_code, field_type, label, default_settings, sort_order
    from public.platform_template_fields
   where template_id = v_model
  on conflict (template_id, field_code) do nothing;

end $$;

-- Verification
select code, name, description
  from public.platform_form_templates
 where code in ('MODEL', 'TITANIUM_MILLING')
 order by code;

select field_code, field_type, label, sort_order
  from public.platform_template_fields
 where template_id = (
   select id from public.platform_form_templates
    where code = 'TITANIUM_MILLING'
 )
 order by sort_order;
