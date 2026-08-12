import type {
  FormConfiguration,
  PlatformTemplateFieldRow,
  PricingConfig,
} from '@/types/database';
import { DEFAULT_IMPLANT_PRICE_CONFIG } from '@/features/orderForms/implantTypes';
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

  const toothField = fields.find((f) => f.type === 'tooth_selection');
  const isSg = templateCode === 'SURGICAL_GUIDE';
  const isEsp = templateCode === 'EVIDENT_SMILE';
  const isImplant = templateCode === 'CONSTRUCTIONS_ON_IMPLANTS';
  const isFab = isFabTemplate(templateCode);
  // Model (Print Model only — Titanium moved to C&B) is priced per jaw
  // (arch → qty, BOTH = 2), distinct from the material-based UNIT_BASED
  // templates — so it seeds a per-jaw price, not materials. Existing Model
  // services (seeded FIXED_PRICE) are untouched.
  const isModel = isModelTemplateCode(templateCode);
  const isCnb = isCnbTemplate(templateCode);
  const pricing: PricingConfig = {
    model:
      toothField || isCnb || isSg || isEsp || isImplant || isFab || isModel
        ? 'UNIT_BASED'
        : 'FIXED_PRICE',
    materials: isCnb || isEsp || isFab ? [] : undefined,
    model_per_jaw_price: isModel ? 0 : undefined,
    sg_support_fees: isSg ? [] : undefined,
    implant_price_config: isImplant ? DEFAULT_IMPLANT_PRICE_CONFIG : undefined,
    implant_crown_materials: isImplant ? [] : undefined,
    rush: { type: 'NONE' },
  };

  return { configuration, pricing };
}
