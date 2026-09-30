import { startingPrice, type StartingPrice } from '@/utils/pricing';
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
