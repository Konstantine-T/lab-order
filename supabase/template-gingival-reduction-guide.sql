-- ============================================================================
-- Gingival Reduction Guide platform template.
-- Georgian: ღრძილის მოჭრის ინსტრუქცია
--
-- Run in Supabase SQL Editor. Idempotent — safe to re-run.
-- ============================================================================

do $$
declare v_id uuid;
begin

  -- 1) Insert template if it doesn't exist
  insert into public.platform_form_templates (code, name, description)
  values (
    'GINGIVAL_REDUCTION_GUIDE',
    'Gingival Reduction Guide',
    'ღრძილის მოჭრის ინსტრუქცია. Tooth map with wax-up and approval options. Lab configures which fields are shown and required.'
  )
  on conflict (code) do update
    set name        = excluded.name,
        description = excluded.description;

  select id into v_id
    from public.platform_form_templates
   where code = 'GINGIVAL_REDUCTION_GUIDE';

  if v_id is null then
    raise exception 'Template insert failed';
  end if;

  -- 2) Seed the four configurable fields.
  --    Labs can toggle enabled/required on each and add custom questions below.
  insert into public.platform_template_fields
    (template_id, field_code, field_type, label, default_settings, sort_order)
  values
    (v_id, 'grg_teeth',             'tooth_selection',    'Select teeth',                     '{"affects_price": false}'::jsonb, 10),
    (v_id, 'grg_additive_wax_up',   'grg_additive_wax_up','Is This an Additive Wax Up?',      '{}'::jsonb,                       20),
    (v_id, 'grg_approval_needed',   'grg_approval_needed','Does Doctor Need to Approve?',     '{}'::jsonb,                       30),
    (v_id, 'grg_notes',             'grg_notes',          'Notes',                            '{}'::jsonb,                       40)
  on conflict (template_id, field_code) do nothing;

end $$;

-- Verification
select code, name, description
  from public.platform_form_templates
 where code = 'GINGIVAL_REDUCTION_GUIDE';

select field_code, field_type, label, sort_order
  from public.platform_template_fields
 where template_id = (
   select id from public.platform_form_templates
    where code = 'GINGIVAL_REDUCTION_GUIDE'
 )
 order by sort_order;
