import type {
  FormConfiguration,
  PlatformTemplateFieldRow,
  PricingConfig,
} from '@/types/database';

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
  const pricing: PricingConfig = {
    model: toothField || isSg ? 'UNIT_BASED' : 'FIXED_PRICE',
    materials: templateCode === 'CROWN_AND_BRIDGE' ? [] : undefined,
    sg_support_fees: isSg ? [] : undefined,
    rush: { type: 'NONE' },
  };

  return { configuration, pricing };
}
