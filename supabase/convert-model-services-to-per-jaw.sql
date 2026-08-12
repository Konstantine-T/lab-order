-- ============================================================================
-- OPTIONAL / MANUAL — Convert ONE existing Model service to per-jaw pricing
-- ----------------------------------------------------------------------------
-- ⚠️ This file is NOT part of the numbered migration flow. Do not add it to
-- supabase/migrations/. Run it by hand, only if you want to migrate a specific
-- pre-existing Model (or Titanium Milling) service to the new per-jaw pricing.
-- New Model services created after this change already seed per-jaw pricing;
-- this script exists purely to retrofit OLD ones.
--
-- Why it must "publish a new version": lab_form_versions are immutable
-- snapshots. We never edit an existing version's pricing in place — we insert a
-- new PUBLISHED version and repoint the form at it. Historical orders keep the
-- version they were submitted with, exactly like the app's own publish flow.
--
-- What it does for the targeted service:
--   • confirms the linked form's template is MODEL or TITANIUM_MILLING
--   • confirms the current pricing model is FIXED_PRICE (i.e. not already
--     converted) — otherwise it skips, so re-running is safe
--   • builds a new pricing config: model = 'UNIT_BASED',
--     model_per_jaw_price = the OLD fixed_price, and drops fixed_price
--   • inserts a new PUBLISHED lab_form_versions row and repoints the form
--
-- SAFETY: it is a NO-OP unless you set v_service_id below to a real service id.
-- It touches ONLY that one service. It never auto-migrates anything.
-- Run it inside the Supabase SQL editor (service role) or via psql.
-- ============================================================================

do $$
declare
  -- 👇 SET THIS to the lab_services.id you want to convert. Leave NULL to no-op.
  v_service_id uuid := null;

  v_form            public.lab_forms;
  v_version         public.lab_form_versions;
  v_template_code   text;
  v_old_pricing     jsonb;
  v_new_pricing     jsonb;
  v_old_fixed       numeric;
  v_next_version    int;
  v_new_version_id  uuid;
begin
  if v_service_id is null then
    raise notice 'No v_service_id set — nothing to do. Edit the script and set it.';
    return;
  end if;

  -- Resolve the service's linked form.
  select f.* into v_form
  from public.lab_services s
  join public.lab_forms f on f.id = s.linked_lab_form_id
  where s.id = v_service_id;
  if not found then
    raise exception 'Service % has no linked lab_form.', v_service_id;
  end if;

  -- Guard: only Model / Titanium Milling services.
  select t.code into v_template_code
  from public.platform_form_templates t
  where t.id = v_form.template_id;
  if v_template_code is null or v_template_code not in ('MODEL', 'TITANIUM_MILLING') then
    raise exception 'Service % is template % — not a Model service. Aborting.',
      v_service_id, coalesce(v_template_code, '(none)');
  end if;

  -- Read the current published version's config + pricing.
  select v.* into v_version
  from public.lab_form_versions v
  where v.id = v_form.current_version_id;
  if not found then
    raise exception 'Form % has no current version.', v_form.id;
  end if;
  v_old_pricing := v_version.pricing_configuration_json;

  -- Guard: skip if already per-jaw (idempotent — safe to re-run).
  if (v_old_pricing ->> 'model') = 'UNIT_BASED'
     and v_old_pricing ? 'model_per_jaw_price' then
    raise notice 'Service % already uses per-jaw pricing — skipping.', v_service_id;
    return;
  end if;
  if (v_old_pricing ->> 'model') is distinct from 'FIXED_PRICE' then
    raise exception 'Service % pricing model is %, expected FIXED_PRICE. Aborting to be safe.',
      v_service_id, coalesce(v_old_pricing ->> 'model', '(none)');
  end if;

  -- Treat the old flat price as the new per-jaw unit price.
  v_old_fixed := coalesce((v_old_pricing ->> 'fixed_price')::numeric, 0);

  -- Patch the pricing: UNIT_BASED + model_per_jaw_price, drop fixed_price.
  v_new_pricing := (v_old_pricing - 'fixed_price')
                   || jsonb_build_object('model', 'UNIT_BASED')
                   || jsonb_build_object('model_per_jaw_price', v_old_fixed);

  -- Publish a new immutable version and repoint the form (mirrors publish_lab_form).
  select coalesce(max(version_number), 0) + 1 into v_next_version
  from public.lab_form_versions where lab_form_id = v_form.id;

  insert into public.lab_form_versions
    (lab_form_id, version_number, configuration_json, pricing_configuration_json, status)
  values
    (v_form.id, v_next_version, v_version.configuration_json, v_new_pricing, 'PUBLISHED')
  returning id into v_new_version_id;

  update public.lab_forms
    set current_version_id = v_new_version_id, status = 'PUBLISHED'
    where id = v_form.id;

  raise notice 'Converted service % (template %): fixed_price % → model_per_jaw_price %. New version % (%).',
    v_service_id, v_template_code, v_old_fixed, v_old_fixed, v_next_version, v_new_version_id;
end $$;
