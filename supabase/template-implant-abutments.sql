-- ============================================================================
-- Lab-placed Abutments platform template.
-- Georgian: აბატმენტების ჩაყენება ლაბორატორიულად
--
-- Only the implant configuration of Constructions on Implants — implant brand,
-- positions, and each implant's abutment status / type / options — with no bar
-- and no crown section, plus one question of its own: "transfer check needed?"
-- (yes / no, not priced). The frontend renders <ImplantRestorationForm
-- variant="abutments"> for this code (see TEMPLATE_CODE_IMPLANT_ABUTMENTS and
-- isImplantTemplate() in src/features/orderForms/implantTypes.ts), and prices it
-- with the implant component grid, without crown materials.
--
-- The one seeded field is the transfer-check question, so the lab can switch it
-- off or make it required in the Fields tab. Its field_code is also its answer
-- key (`abTransferCheck`).
--
-- Run in the Supabase SQL Editor. Idempotent — safe to re-run.
-- ============================================================================

do $$
declare v_id uuid;
begin

  -- 1) Insert template if it doesn't exist
  insert into public.platform_form_templates (code, name, description)
  values (
    'IMPLANT_ABUTMENTS',
    'Lab-placed Abutments',
    'Abutments placed by the lab — the implant configuration of Constructions on Implants (brand, positions, abutment per implant), without the crown.'
  )
  on conflict (code) do update
    set name        = excluded.name,
        description = excluded.description;

  select id into v_id
    from public.platform_form_templates
   where code = 'IMPLANT_ABUTMENTS';

  if v_id is null then
    raise exception 'Template insert failed';
  end if;

  -- 2) Seed its field (the structured form drives the rest of the UI; the lab
  --    can still add custom questions below the form).
  insert into public.platform_template_fields
    (template_id, field_code, field_type, label, default_settings, sort_order)
  values
    (v_id, 'abTransferCheck', 'ab_transfer_check', 'Transfer check', '{}'::jsonb, 10)
  on conflict (template_id, field_code) do nothing;

end $$;

-- Verification
select code, name, description
  from public.platform_form_templates
 where code = 'IMPLANT_ABUTMENTS';

select field_code, field_type, label, sort_order
  from public.platform_template_fields
 where template_id = (
   select id from public.platform_form_templates
    where code = 'IMPLANT_ABUTMENTS'
 )
 order by sort_order;
