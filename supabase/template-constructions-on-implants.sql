-- ============================================================================
-- Constructions on Implants platform template.
--
-- Run in Supabase SQL Editor. Idempotent — safe to re-run.
-- ============================================================================

do $$
declare v_id uuid;
begin

  -- 1) Insert template if it doesn't exist
  insert into public.platform_form_templates (code, name, description)
  values (
    'CONSTRUCTIONS_ON_IMPLANTS',
    'Constructions on Implants',
    'Implant-supported crowns, bridges, and bar-retained prostheses. Structured order form with interactive connection tree.'
  )
  on conflict (code) do update
    set name        = excluded.name,
        description = excluded.description;

  select id into v_id
    from public.platform_form_templates
   where code = 'CONSTRUCTIONS_ON_IMPLANTS';

  if v_id is null then
    raise exception 'Template insert failed';
  end if;

  -- 2) Seed minimal fields (the structured form drives the actual UI;
  --    these placeholder rows let the lab add custom questions below the form).
  insert into public.platform_template_fields
    (template_id, field_code, field_type, label, default_settings, sort_order)
  values
    (v_id, 'design_notes', 'textarea', 'Design notes / additional instructions', '{}'::jsonb, 10)
  on conflict (template_id, field_code) do nothing;

end $$;

-- Verification
select code, name, description
  from public.platform_form_templates
 where code = 'CONSTRUCTIONS_ON_IMPLANTS';

select field_code, field_type, label, sort_order
  from public.platform_template_fields
 where template_id = (
   select id from public.platform_form_templates
    where code = 'CONSTRUCTIONS_ON_IMPLANTS'
 )
 order by sort_order;
