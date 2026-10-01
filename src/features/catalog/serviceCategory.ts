/**
 * Groups a lab service by the platform form template it was built from, for
 * the catalogue's "service type" filter and the lab profile's category chips.
 *
 * A category is derived from `platform_form_templates.code` alone (the
 * `template:platform_form_templates ( code )` hop of `SERVICE_PRICE_EMBED`),
 * never from the lab's free-text service name. Every code the platform has
 * ever seeded is mapped, including the ones removed by
 * `supabase/remove-deprecated-templates.sql` — a lab_form built from them
 * before the removal still carries its old code. Anything unknown (or a
 * service with no linked form) lands in `other`.
 *
 * Labels: `t(serviceCategoryLabelKey(cat))` in the `common` namespace.
 */

export type ServiceCategory =
  | 'crownBridge'
  | 'implant'
  | 'surgicalGuide'
  | 'smileDesign'
  | 'milling'
  | 'printing'
  | 'prosthesis'
  | 'other';

/** Display order of the category chips / checkboxes. */
export const CATEGORY_ORDER: readonly ServiceCategory[] = [
  'crownBridge',
  'implant',
  'surgicalGuide',
  'smileDesign',
  'milling',
  'printing',
  'prosthesis',
  'other',
];

const BY_TEMPLATE_CODE: Record<string, ServiceCategory> = {
  // Crowns & bridges on the patient's own teeth.
  CROWN_AND_BRIDGE: 'crownBridge',
  TEMPORARY_CROWN: 'crownBridge',
  ZIRCONIA_CROWN: 'crownBridge', // deprecated seed

  // Everything implant-borne.
  CONSTRUCTIONS_ON_IMPLANTS: 'implant',
  IMPLANT_ABUTMENTS: 'implant',
  FINAL_CONSTRUCTION: 'implant', // superstructure remake on implants
  ZIRCONIA_ON_IMPLANT: 'implant', // deprecated
  TEMPORARY_ON_IMPLANT: 'implant', // deprecated

  // Implant surgical guides.
  SURGICAL_GUIDE: 'surgicalGuide',

  // Smile design / aesthetics. The gingival reduction guide is the gum
  // contouring guide of a smile case (Evident Smile prices one as an add-on),
  // not an implant guide.
  EVIDENT_SMILE: 'smileDesign',
  GINGIVAL_REDUCTION_GUIDE: 'smileDesign',
  MOCKUP_WAXUP: 'smileDesign', // deprecated

  // Production.
  MILLING: 'milling',
  TITANIUM_MILLING: 'milling',
  PRINT: 'printing',
  MODEL: 'printing',

  // Removables.
  REMOVABLE_PROSTHESIS: 'prosthesis', // deprecated

  OTHER_CUSTOM: 'other',
};

/** The category of a service built from `templateCode` (null → `other`). */
export function serviceCategory(templateCode: string | null | undefined): ServiceCategory {
  if (!templateCode) return 'other';
  return BY_TEMPLATE_CODE[templateCode] ?? 'other';
}

/** i18n key (common namespace) of a category's label. */
export function serviceCategoryLabelKey(category: ServiceCategory): string {
  return `catalog.category.${category}`;
}

/** Sorts categories into `CATEGORY_ORDER`. */
export function sortCategories(categories: Iterable<ServiceCategory>): ServiceCategory[] {
  const set = new Set(categories);
  return CATEGORY_ORDER.filter((c) => set.has(c));
}
