-- ============================================================================
-- Custom Form platform template (code OTHER_CUSTOM).
--
-- A blank, lab-built form: it has NO platform_template_fields. The lab authors
-- every question in the service builder (CustomFormBuilder), and the doctor
-- fills them in via the generic DynamicForm renderer.
--
-- Idempotent: safe to re-run.
-- ============================================================================

insert into public.platform_form_templates (code, name, description)
values (
  'OTHER_CUSTOM',
  'Custom Form',
  'Build your own form from any questions.'
)
on conflict (code) do update
   set name        = excluded.name,
       description = excluded.description;

-- Verification (Custom Form is intentionally field-less).
select code, name,
       (select count(*) from public.platform_template_fields f where f.template_id = t.id) as fields
  from public.platform_form_templates t
 where code = 'OTHER_CUSTOM';
