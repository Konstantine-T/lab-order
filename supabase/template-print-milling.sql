-- ============================================================================
-- Print & Milling platform templates.
--
-- Two simple fabrication services, split because some labs print and some mill.
-- Both are UNIT-PRICED BY MATERIAL: the lab configures the materials it offers
-- (each with a per-unit price, in the Pricing tab); the doctor picks one
-- material and a quantity, and the price is generated from it:
--   * Print   — a typed number of units.
--   * Milling — selected teeth (the teeth count is the unit count).
--
-- The forms are rendered by PrintForm / MillingForm (OrderForm dispatch) and are
-- fully hardcoded, so these templates intentionally have NO
-- platform_template_fields.
--
-- Idempotent: safe to re-run.
-- ============================================================================

insert into public.platform_form_templates (code, name, description) values
  ('PRINT',   'Print',   'Printing by material and unit count.'),
  ('MILLING', 'Milling', 'Milling by material and selected teeth.')
on conflict (code) do update
  set name = excluded.name, description = excluded.description;

select code, name from public.platform_form_templates where code in ('PRINT','MILLING') order by code;
