import type { FormConfiguration, ImplantPriceItem } from '@/types/database';

export { type ImplantPriceItem };

export const TEMPLATE_CODE_IMPLANT = 'CONSTRUCTIONS_ON_IMPLANTS';

// ─── Option lists ─────────────────────────────────────────────────────────────

export const ABUTMENT_STATUS_OPTIONS = [
  { key: 'existingAbutment', label: 'Already in Mouth' },
  { key: 'noAbutment',       label: 'Need to Plan' },
  { key: 'labDecides',       label: 'Lab Decides' },
] as const;

export const GINGIVAL_HEIGHT_MODE_OPTIONS = [
  { key: 'manual',        label: 'Specify Height' },
  { key: 'labDetermines', label: 'Lab Determines' },
] as const;

export const ABUTMENT_TYPE_OPTIONS = [
  { key: 'individual', label: 'Individual Abutment' },
  { key: 'multiunit',  label: 'Multi-Unit (MUA)' },
  { key: 'tibase',     label: 'Ti-Base' },
  { key: 'factory',    label: 'Factory Abutment' },
] as const;

export const IND_MATERIAL_OPTIONS = [
  { key: 'titanium', label: 'Titanium' },
  { key: 'cocr',     label: 'Co-Cr' },
  { key: 'zirconia', label: 'Zirconia' },
] as const;

export const IND_SHAPE_OPTIONS = [
  { key: 'concave',  label: 'Concave' },
  { key: 'straight', label: 'Straight' },
  { key: 'convex',   label: 'Convex' },
] as const;

export const RETENTION_OPTIONS = [
  { key: 'cement', label: 'Cement-Retained' },
  { key: 'screw',  label: 'Screw-Retained' },
] as const;

export const MUA_HEX_OPTIONS = [
  { key: 'hex',    label: 'Hex' },
  { key: 'nonHex', label: 'Non-Hex' },
] as const;

export const MUA_UPPER_CONN_OPTIONS = [
  { key: 'cups',        label: 'On Cups (Locator)' },
  { key: 'rosen',       label: 'Rosen Screw' },
  { key: 'screwForBar', label: 'Screw for Bar' },
] as const;

export const BAR_MATERIAL_OPTIONS = [
  { key: 'titaniumBar',  label: 'Titanium' },
  { key: 'cocrMilled',   label: 'Co-Cr Milled' },
  { key: 'cocrPrinted',  label: 'Co-Cr 3D Printed' },
  { key: 'zirconiaBar',  label: 'Zirconia' },
  { key: 'peekBar',      label: 'PEEK' },
] as const;

export const BAR_TRY_IN_OPTIONS = [
  { key: 'pmma',    label: 'PMMA' },
  { key: 'printed', label: 'Printed Material' },
] as const;

// ─── State ────────────────────────────────────────────────────────────────────

export type AbutmentStatus = 'existingAbutment' | 'noAbutment' | 'labDecides';
export type AbutmentType = 'individual' | 'multiunit' | 'tibase' | 'factory';
export type GingivalHeightMode = 'manual' | 'labDetermines';

export type ImplantConfig = {
  // Brand (per-implant)
  brand?: string;
  brandCustom?: string;
  abutmentStatus?: AbutmentStatus;
  // When noAbutment: gingival height
  gingivalHeightMode?: GingivalHeightMode;
  gingivalHeightMm?: number;
  // Abutment type (when noAbutment)
  abutmentType?: AbutmentType;
  // Individual path
  indMaterial?: string;
  indShape?: string;
  indRetention?: string;
  // Multiunit path
  muaHex?: string;
  muaUpperConn?: string;
  // Factory path
  factoryRetention?: string;
};

export type ImplantBarAnswers = {
  needsBar?: boolean;
  barMaterial?: string;
  tryIn?: string;
  barTeeth: number[];
};

export type ImplantRestorationAnswers = {
  /** Active brush brand used when clicking new teeth on the map. */
  brand?: string;
  brandCustom?: string;
  implantPositions: number[];
  notation: 'Universal' | 'FDI';
  configsByPosition: Record<string, ImplantConfig>;
  /** Positions the doctor has explicitly confirmed via the Submit button. */
  submittedPositions?: number[];
  bar: ImplantBarAnswers;
  /** CNB-form answers for the final crown restoration (stored as raw JSON). */
  cnbAnswers?: Record<string, unknown>;
};

// ─── Empty answers ────────────────────────────────────────────────────────────

export const emptyImplantAnswers: ImplantRestorationAnswers = {
  implantPositions: [],
  notation: 'FDI',
  configsByPosition: {},
  bar: { barTeeth: [] },
};

// ─── Coerce ───────────────────────────────────────────────────────────────────

export function coerceImplantAnswers(raw: unknown): ImplantRestorationAnswers {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

  const toNumArray = (v: unknown) =>
    Array.isArray(v) ? (v as unknown[]).filter((x): x is number => typeof x === 'number') : [];

  const configs = r.configsByPosition && typeof r.configsByPosition === 'object'
    ? (r.configsByPosition as Record<string, unknown>)
    : {};
  const coercedConfigs: Record<string, ImplantConfig> = {};
  for (const [k, v] of Object.entries(configs)) {
    if (v && typeof v === 'object') coercedConfigs[k] = v as ImplantConfig;
  }

  const bar = r.bar && typeof r.bar === 'object'
    ? (r.bar as Record<string, unknown>)
    : {};

  return {
    brand: typeof r.brand === 'string' ? r.brand : undefined,
    brandCustom: typeof r.brandCustom === 'string' ? r.brandCustom : undefined,
    implantPositions: toNumArray(r.implantPositions),
    notation: r.notation === 'Universal' ? 'Universal' : 'FDI',
    configsByPosition: coercedConfigs,
    submittedPositions: toNumArray(r.submittedPositions),
    bar: {
      needsBar: typeof bar.needsBar === 'boolean' ? bar.needsBar : undefined,
      barMaterial: typeof bar.barMaterial === 'string' ? bar.barMaterial : undefined,
      tryIn: typeof bar.tryIn === 'string' ? bar.tryIn : undefined,
      barTeeth: toNumArray(bar.barTeeth),
    },
    cnbAnswers: r.cnbAnswers && typeof r.cnbAnswers === 'object'
      ? (r.cnbAnswers as Record<string, unknown>)
      : undefined,
  };
}

// ─── Completion check ─────────────────────────────────────────────────────────

export function isImplantConfigComplete(cfg: ImplantConfig): boolean {
  if (!cfg.abutmentStatus) return false;
  if (cfg.abutmentStatus === 'labDecides') return true;
  if (cfg.abutmentStatus === 'existingAbutment') return true;
  // noAbutment: need gingival height + abutment type + type-specific options
  if (!cfg.gingivalHeightMode) return false;
  if (cfg.gingivalHeightMode === 'manual' && !cfg.gingivalHeightMm) return false;
  if (!cfg.abutmentType) return false;
  switch (cfg.abutmentType) {
    case 'individual':
      return !!(cfg.indMaterial && cfg.indShape && cfg.indRetention);
    case 'multiunit':
      return !!(cfg.muaHex && cfg.muaUpperConn);
    case 'tibase':
      return true;
    case 'factory':
      return !!cfg.factoryRetention;
    default:
      return false;
  }
}

// ─── Validation ───────────────────────────────────────────────────────────────

export type ImplantRestorationErrors = {
  implantPositions?: string;
  brandCustom?: string;
  incompleteConfigs?: number[];
  barMaterial?: string;
  barTeeth?: string;
};

export function validateImplantRestoration(a: ImplantRestorationAnswers): ImplantRestorationErrors {
  const e: ImplantRestorationErrors = {};

  if (a.implantPositions.length === 0) {
    e.implantPositions = 'Select at least one implant position.';
  }

  if (a.brand === 'custom' && !a.brandCustom?.trim()) {
    e.brandCustom = 'Enter the brand name.';
  }

  const submitted = a.submittedPositions ?? [];
  const incomplete = a.implantPositions.filter((pos) => {
    if (!submitted.includes(pos)) return true;
    const cfg = a.configsByPosition[String(pos)];
    return !cfg || !isImplantConfigComplete(cfg);
  });
  if (incomplete.length > 0) e.incompleteConfigs = incomplete;

  if (a.bar.needsBar) {
    if (!a.bar.barMaterial) e.barMaterial = 'Select bar material.';
    if (a.bar.barTeeth.length < 2) e.barTeeth = 'Select at least 2 teeth under the bar.';
  }

  return e;
}

// ─── Default price config ─────────────────────────────────────────────────────

export const DEFAULT_IMPLANT_PRICE_CONFIG: Record<string, ImplantPriceItem> = {
  // Abutment types (charged per implant, skipped if existingAbutment)
  individual: { key: 'individual', label: 'Individual Abutment', price: 0, pricingMode: 'per_implant', enabled: true },
  multiunit:  { key: 'multiunit',  label: 'Multi-Unit (MUA)',   price: 0, pricingMode: 'per_implant', enabled: true },
  tibase:     { key: 'tibase',     label: 'Ti-Base',            price: 0, pricingMode: 'per_implant', enabled: true },
  factory:    { key: 'factory',    label: 'Factory Abutment',   price: 0, pricingMode: 'per_implant', enabled: true },
  // Individual: material
  titanium: { key: 'titanium', label: 'Titanium',           price: 0, pricingMode: 'per_implant', enabled: true },
  cocr:     { key: 'cocr',     label: 'Co-Cr',              price: 0, pricingMode: 'per_implant', enabled: true },
  zirconia: { key: 'zirconia', label: 'Zirconia (Abutment)', price: 0, pricingMode: 'per_implant', enabled: true },
  // Individual: shape
  concave:  { key: 'concave',  label: 'Concave',  price: 0, pricingMode: 'per_implant', enabled: true },
  straight: { key: 'straight', label: 'Straight', price: 0, pricingMode: 'per_implant', enabled: true },
  convex:   { key: 'convex',   label: 'Convex',   price: 0, pricingMode: 'per_implant', enabled: true },
  // Retention (individual + factory)
  cement: { key: 'cement', label: 'Cement-Retained', price: 0, pricingMode: 'per_implant', enabled: true },
  screw:  { key: 'screw',  label: 'Screw-Retained',  price: 0, pricingMode: 'per_implant', enabled: true },
  // MUA hex
  hex:    { key: 'hex',    label: 'Hex',     price: 0, pricingMode: 'per_implant', enabled: true },
  nonHex: { key: 'nonHex', label: 'Non-Hex', price: 0, pricingMode: 'per_implant', enabled: true },
  // MUA upper connection
  cups:        { key: 'cups',        label: 'On Cups (Locator)', price: 0, pricingMode: 'per_implant', enabled: true },
  rosen:       { key: 'rosen',       label: 'Rosen Screw',       price: 0, pricingMode: 'per_implant', enabled: true },
  screwForBar: { key: 'screwForBar', label: 'Screw for Bar',     price: 0, pricingMode: 'per_implant', enabled: true },
  // Bar materials (base_plus_per_implant)
  titaniumBar: { key: 'titaniumBar', label: 'Titanium Bar',         price: 0, pricingMode: 'base_plus_per_implant', basePrice: 0, perImplantPrice: 0, enabled: true },
  cocrMilled:  { key: 'cocrMilled',  label: 'Co-Cr Milled Bar',     price: 0, pricingMode: 'base_plus_per_implant', basePrice: 0, perImplantPrice: 0, enabled: true },
  cocrPrinted: { key: 'cocrPrinted', label: 'Co-Cr 3D Printed Bar', price: 0, pricingMode: 'base_plus_per_implant', basePrice: 0, perImplantPrice: 0, enabled: true },
  zirconiaBar: { key: 'zirconiaBar', label: 'Zirconia Bar',          price: 0, pricingMode: 'base_plus_per_implant', basePrice: 0, perImplantPrice: 0, enabled: true },
  peekBar:     { key: 'peekBar',     label: 'PEEK Bar',              price: 0, pricingMode: 'base_plus_per_implant', basePrice: 0, perImplantPrice: 0, enabled: true },
};

// ─── Config helpers ───────────────────────────────────────────────────────────

export function isImplantFieldEnabled(configuration: FormConfiguration, _code: string): boolean {
  void configuration;
  return true;
}
