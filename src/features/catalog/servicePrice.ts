import { startingPrice, type StartingPrice } from '@/utils/pricing';
import { TEMPLATE_CODE_PRINT } from '@/features/orderForms/fabTypes';
import type { FormStatus, PricingConfig } from '@/types/database';

/**
 * PostgREST embed, placed inside a `lab_services(...)` select, that brings a
 * service's form status, template code and published pricing along — every
 * hop runs under a policy that admits `anon` (0004, phase4-6, 0034), so the
 * guest catalogue gets it too.
 *
 * The `!column` hints are required, not decoration: lab_services ↔ lab_forms
 * and lab_forms ↔ lab_form_versions each have foreign keys both ways
 * (`linked_lab_form_id` / `service_id`, `current_version_id` /
 * `lab_form_id`), and PostgREST refuses an ambiguous embed. The whole pricing
 * JSON comes along rather than picked keys: a missing key has to stay
 * `undefined` (a per-jaw price is detected by its mere presence), and a
 * JSON-path select would turn it into `null`.
 */
export const SERVICE_PRICE_EMBED = `
  form:lab_forms!linked_lab_form_id (
    status,
    template:platform_form_templates ( code ),
    version:lab_form_versions!current_version_id ( pricing_configuration_json )
  )
`;

/** What `SERVICE_PRICE_EMBED` adds to a service row. */
export type ServicePriceEmbed = {
  form: {
    status: FormStatus;
    template: { code: string } | null;
    version: { pricing_configuration_json: PricingConfig | null } | null;
  } | null;
};

/**
 * The "from" price of a service a doctor can order right now — the same
 * "published form" test the lab's profile uses to enable its order button —
 * or null when it can't be ordered or publishes no number.
 */
export function servicePrice(service: ServicePriceEmbed): StartingPrice | null {
  if (service.form?.status !== 'PUBLISHED') return null;
  return startingPrice(
    service.form.version?.pricing_configuration_json,
    service.form.template?.code,
  );
}

const positive = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0;

const distinctPositive = (values: unknown[]) => new Set(values.filter(positive)).size;

/**
 * Whether `startingPrice`'s figure is *the* price of the smallest order
 * ("250 ₾", "145 ₾ / tooth") rather than only the cheapest of several
 * ("20 ₾-დან"). Walks `startingPrice`'s branches in the same order. The
 * catalogue card and the lab profile both read it, so one service never says
 * "from" on one page and an exact price on the other. Only meaningful when
 * `startingPrice` returned a number.
 */
export function priceIsExact(
  pricing: PricingConfig | null | undefined,
  templateCode: string | null | undefined,
): boolean {
  if (!pricing) return false;
  if (pricing.model === 'FIXED_PRICE') return true;
  if (pricing.model !== 'UNIT_BASED') return false;
  if (pricing.model_per_jaw_price !== undefined) return true;
  if (Array.isArray(pricing.materials)) {
    // Print is priced per typed unit: its figure is one unit, not an order.
    if (templateCode === TEMPLATE_CODE_PRINT) return false;
    // Every listed material at one price is one price; the Evident Smile
    // gingival guide is an optional extra, which no "from" price includes.
    return distinctPositive(pricing.materials.map((m) => m?.unit_price)) === 1;
  }
  if (
    pricing.sg_pilot_unit_price !== undefined ||
    pricing.sg_full_protocol_unit_price !== undefined ||
    pricing.sg_support_fees !== undefined
  ) {
    const rates = distinctPositive([pricing.sg_pilot_unit_price, pricing.sg_full_protocol_unit_price]);
    const anyFee = (pricing.sg_support_fees ?? []).some((f) => positive(f?.extra_fee));
    return rates === 1 && !anyFee;
  }
  // Implants: the crown is the floor; abutment parts come on top.
  if (pricing.implant_price_config !== undefined || pricing.implant_crown_materials !== undefined) {
    return false;
  }
  // One global unit price per tooth (a custom form has no number at all).
  return templateCode !== 'OTHER_CUSTOM';
}
