import type {
  FieldConfig,
  FormConfiguration,
  PlatformTemplateFieldRow,
  PricingConfig,
  PricingModel,
} from '@/types/database';
import {
  DEFAULT_IMPLANT_PRICE_CONFIG,
  TEMPLATE_CODE_IMPLANT,
  isImplantTemplate,
} from '@/features/orderForms/implantTypes';
import { isCnbTemplate } from '@/features/orderForms/cnbTypes';
import { isFabTemplate } from '@/features/orderForms/fabTypes';
import { isModelTemplateCode } from '@/features/orderForms/modelTypes';

export function buildDefaultConfig(
  templateFields: PlatformTemplateFieldRow[],
  templateCode?: string,
): { configuration: FormConfiguration; pricing: PricingConfig } {
  const fields = templateFields
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((f) => ({
      code: f.field_code,
      type: f.field_type,
      label: f.label,
      enabled: true,
      required: false,
      helper_text: '',
      affects_price: Boolean(
        (f.default_settings as Record<string, unknown>)?.affects_price,
      ),
      visible_to_doctor: true,
      options: ((f.default_settings as { options?: string[] })?.options ?? []) as string[],
    }));

  const configuration: FormConfiguration = {
    fields,
    _templateCode: templateCode,
  };

  const isSg = templateCode === 'SURGICAL_GUIDE';
  const isEsp = templateCode === 'EVIDENT_SMILE';
  // Constructions on Implants and lab-placed abutments share the implant
  // component grid, bar prices included. Only the former has crowns, so only
  // it gets a crown material list — whose absence is also what keeps an
  // abutments-only service from advertising a crown's "from" price.
  const isImplant = isImplantTemplate(templateCode);
  const hasImplantCrowns = templateCode === TEMPLATE_CODE_IMPLANT;
  const isFab = isFabTemplate(templateCode);
  // Model (Print Model only — Titanium moved to C&B) is priced per jaw
  // (arch → qty, BOTH = 2), distinct from the material-based UNIT_BASED
  // templates — so it seeds a per-jaw price, not materials. Existing Model
  // services (seeded FIXED_PRICE) are untouched.
  const isModel = isModelTemplateCode(templateCode);
  const isCnb = isCnbTemplate(templateCode);
  // Every new service starts priced in the lab's own words (to75nCxF): the
  // lab writes what it charges and confirms the final price per order.
  // Automatic pricing stays one switch away in the Pricing tab, and the choice
  // lists below are seeded exactly as before, so switching finds them in place.
  const pricing: PricingConfig = {
    model: 'LAB_DESCRIBED',
    materials: isCnb || isEsp || isFab ? [] : undefined,
    model_per_jaw_price: isModel ? 0 : undefined,
    sg_support_fees: isSg ? [] : undefined,
    implant_price_config: isImplant ? DEFAULT_IMPLANT_PRICE_CONFIG : undefined,
    implant_crown_materials: hasImplantCrowns ? [] : undefined,
    rush: { type: 'NONE' },
  };

  return { configuration, pricing };
}

/**
 * The automatic model a template was seeded with before descriptions became
 * the default: unit based for every template with a tooth chart or a lab
 * list to price, a fixed price for the rest. The Pricing tab starts here when
 * a described service is switched to "Automatic estimate".
 */
export function defaultAutomaticModel(
  templateCode: string | undefined,
  fields: Pick<FieldConfig, 'type'>[],
): Extract<PricingModel, 'UNIT_BASED' | 'FIXED_PRICE'> {
  const unitBased =
    fields.some((f) => f.type === 'tooth_selection') ||
    isCnbTemplate(templateCode) ||
    templateCode === 'SURGICAL_GUIDE' ||
    templateCode === 'EVIDENT_SMILE' ||
    isImplantTemplate(templateCode) ||
    isFabTemplate(templateCode) ||
    isModelTemplateCode(templateCode);
  return unitBased ? 'UNIT_BASED' : 'FIXED_PRICE';
}
