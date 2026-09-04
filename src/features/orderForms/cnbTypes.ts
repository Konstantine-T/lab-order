// Crown & Bridge form payload — see spec in chat.

import type { FormConfiguration, MaterialOption } from '@/types/database';

/**
 * Which numbering the tooth chart is *labelled* in. FDI is the default because
 * it is what dentists here write; teeth are still stored in Universal (1-32)
 * everywhere, and this only changes what the doctor reads off the map.
 */
export type CnbNotation = 'Universal' | 'FDI';

/** One tooth in the order assigned to one of the lab's materials. */
export type CnbToothAssignment = {
  tooth: number;       // Universal numbering (1–32)
  materialId: string;  // FK to PricingConfig.materials[].id
};

export type CnbChoiceWithMm<C extends string> = {
  choice: C | '';
  desiredLengthMm: number | null;
};

export type CnbAnswers = {
  toothAssignments: CnbToothAssignment[];
  notation: CnbNotation;
  notes: string; // section 1 notes (under tooth chart)
  shade: string;
  shadeScale: ShadeScale;
  shadeNotes: string;
  gingivalContouring: CnbChoiceWithMm<'Yes' | 'No'>;
  verticalDimension: CnbChoiceWithMm<'Keep Existing' | 'Open Bite' | 'Make Ideal'>;
  maxLengthOfCentrals: CnbChoiceWithMm<'Ideal' | 'Other'>;
  checkDesign: 'Yes' | 'No' | '';
  occlusalContact: 'Tight' | 'Zero' | 'Relief' | '';
  rxNotes: string; // section 8 RX notes
};

export const emptyCnbAnswers: CnbAnswers = {
  toothAssignments: [],
  notation: 'FDI',
  notes: '',
  shade: '',
  shadeScale: 'CLASSICAL',
  shadeNotes: '',
  gingivalContouring: { choice: '', desiredLengthMm: null },
  verticalDimension: { choice: '', desiredLengthMm: null },
  maxLengthOfCentrals: { choice: '', desiredLengthMm: null },
  checkDesign: '',
  occlusalContact: '',
  rxNotes: '',
};

export const SHADE_GROUPS: Array<{ family: string; shades: string[] }> = [
  { family: 'A', shades: ['A1', 'A2', 'A3', 'A3.5', 'A4'] },
  { family: 'B', shades: ['B1', 'B2', 'B3', 'B4'] },
  { family: 'C', shades: ['C1', 'C2', 'C3', 'C4'] },
  { family: 'D', shades: ['D2', 'D3', 'D4'] },
];

/** Shade scale the doctor picks from. Classical is the historical default. */
export type ShadeScale = 'CLASSICAL' | '3D_MASTER';
export const SHADE_SCALES: ShadeScale[] = ['CLASSICAL', '3D_MASTER'];

/**
 * VITA Toothguide 3D-MASTER — standard 26 tabs, grouped by lightness (value) 1–5.
 * (The bleached 0M group is intentionally omitted; add it here if labs need it.)
 */
export const SHADE_GROUPS_3D_MASTER: Array<{ family: string; shades: string[] }> = [
  { family: '1', shades: ['1M1', '1M2'] },
  { family: '2', shades: ['2L1.5', '2L2.5', '2M1', '2M2', '2M3', '2R1.5', '2R2.5'] },
  { family: '3', shades: ['3L1.5', '3L2.5', '3M1', '3M2', '3M3', '3R1.5', '3R2.5'] },
  { family: '4', shades: ['4L1.5', '4L2.5', '4M1', '4M2', '4M3', '4R1.5', '4R2.5'] },
  { family: '5', shades: ['5M1', '5M2', '5M3'] },
];

/** The shade groups (families → tabs) for the selected scale. */
export function shadeGroupsForScale(
  scale: ShadeScale,
): Array<{ family: string; shades: string[] }> {
  return scale === '3D_MASTER' ? SHADE_GROUPS_3D_MASTER : SHADE_GROUPS;
}

export const TEMPLATE_CODE_CNB = 'CROWN_AND_BRIDGE';

/**
 * Temporary Crown is a distinct platform template (its own picker card + service
 * identity) that reuses the entire Crown & Bridge form — same fields, coercion,
 * validation, and pricing — so it renders and behaves identically.
 */
export const TEMPLATE_CODE_TEMPORARY_CROWN = 'TEMPORARY_CROWN';

/**
 * Titanium Milling ("ტიტანის გამოჩარხვა") mirrors Temporary Crown per the lab's
 * request: it reuses the Crown & Bridge form 1:1 (same 8 sections, per-tooth-
 * material pricing). It used to reuse the Model form — no longer.
 */
export const TEMPLATE_CODE_TITANIUM_MILLING = 'TITANIUM_MILLING';

/** True for the templates that share the Crown & Bridge form: C&B, Temporary
 *  Crown, and Titanium Milling. */
export function isCnbTemplate(code: string | undefined | null): boolean {
  return (
    code === TEMPLATE_CODE_CNB ||
    code === TEMPLATE_CODE_TEMPORARY_CROWN ||
    code === TEMPLATE_CODE_TITANIUM_MILLING
  );
}

// Distinct color palette for material chips/teeth — index 0..4. Kept
// visually distinct from the brand `#9292FF` so a tooth's material color
// never reads as "selected by the app", and harmonious with the soft
// luxury palette overall.
export const MATERIAL_COLORS: readonly string[] = [
  '#6366F1', // indigo (sister to brand, slightly bolder)
  '#F59E0B', // amber
  '#10B981', // emerald
  '#EC4899', // pink
  '#0EA5E9', // sky
];

export const MAX_MATERIALS = 5;

export function materialColor(index: number): string {
  return MATERIAL_COLORS[index % MATERIAL_COLORS.length];
}

// Section codes — the lab toggles each in the Fields tab.
export const CNB_SECTION_CODES = [
  'treatments',
  'shade',
  'gingivalContouring',
  'verticalDimension',
  'maxLengthOfCentrals',
  'checkDesign',
  'occlusalContact',
  'rxNotes',
] as const;
export type CnbSectionCode = (typeof CNB_SECTION_CODES)[number];

/** Backward-compat helper: missing field => default to enabled (so old forms keep working). */
export function isSectionEnabled(
  configuration: FormConfiguration,
  code: CnbSectionCode,
): boolean {
  const f = configuration.fields.find((x) => x.code === code);
  if (!f) return true;
  return f.enabled;
}

export function isSectionRequired(
  configuration: FormConfiguration,
  code: CnbSectionCode,
): boolean {
  const f = configuration.fields.find((x) => x.code === code);
  if (!f) return false;
  return f.enabled && f.required;
}

// ---------------------------------------------------------------------------
// Coercion: hydrate a possibly-partial / possibly-old answers payload to the
// CnbAnswers shape so the form never blows up on missing nested keys.
// Old payloads with `treatments[]` array → flatten into toothAssignments[] with
// no materialId (best effort).
// ---------------------------------------------------------------------------
export function coerceCnbAnswers(
  raw: unknown,
  materials?: MaterialOption[],
): CnbAnswers {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

  const choice = (
    obj: unknown,
    allowed: readonly string[],
  ): { choice: string; desiredLengthMm: number | null } => {
    const o = (obj && typeof obj === 'object' ? obj : {}) as Record<string, unknown>;
    const c = typeof o.choice === 'string' && allowed.includes(o.choice) ? o.choice : '';
    const mm =
      typeof o.desiredLengthMm === 'number' && !Number.isNaN(o.desiredLengthMm)
        ? o.desiredLengthMm
        : null;
    return { choice: c, desiredLengthMm: mm };
  };

  // Read toothAssignments; fall back to flattening legacy treatments[].
  let toothAssignments: CnbToothAssignment[] = [];
  let notation: CnbNotation = 'FDI';
  let notes = '';

  const knownIds = new Set((materials ?? []).map((m) => m.id));
  if (Array.isArray(r.toothAssignments)) {
    toothAssignments = (r.toothAssignments as unknown[])
      .map((a) => {
        const o = (a && typeof a === 'object' ? a : {}) as Record<string, unknown>;
        const tooth =
          typeof o.tooth === 'number' && o.tooth >= 1 && o.tooth <= 32 ? o.tooth : null;
        const materialId = typeof o.materialId === 'string' ? o.materialId : '';
        if (tooth === null) return null;
        return { tooth, materialId } as CnbToothAssignment;
      })
      .filter((x): x is CnbToothAssignment => x !== null)
      // drop assignments to materials that no longer exist (when we can check)
      .filter((x) => knownIds.size === 0 || x.materialId === '' || knownIds.has(x.materialId));
  } else if (Array.isArray(r.treatments)) {
    // legacy: flatten treatments[].teeth into bare assignments (no material).
    for (const t of r.treatments) {
      const o = (t && typeof t === 'object' ? t : {}) as Record<string, unknown>;
      const teeth = Array.isArray(o.teeth)
        ? (o.teeth as unknown[]).filter(
            (n): n is number => typeof n === 'number' && n >= 1 && n <= 32,
          )
        : [];
      for (const tooth of teeth) {
        if (!toothAssignments.find((x) => x.tooth === tooth)) {
          toothAssignments.push({ tooth, materialId: '' });
        }
      }
    }
  }

  if (r.notation === 'FDI' || r.notation === 'Universal') notation = r.notation;
  if (typeof r.notes === 'string') notes = r.notes;

  const gc = choice(r.gingivalContouring, ['Yes', 'No']);
  const vd = choice(r.verticalDimension, ['Keep Existing', 'Open Bite', 'Make Ideal']);
  const mlc = choice(r.maxLengthOfCentrals, ['Ideal', 'Other']);

  return {
    toothAssignments,
    notation,
    notes,
    shade: typeof r.shade === 'string' ? r.shade : '',
    shadeScale: r.shadeScale === '3D_MASTER' ? '3D_MASTER' : 'CLASSICAL',
    shadeNotes: typeof r.shadeNotes === 'string' ? r.shadeNotes : '',
    gingivalContouring: {
      choice: gc.choice as 'Yes' | 'No' | '',
      desiredLengthMm: gc.desiredLengthMm,
    },
    verticalDimension: {
      choice: vd.choice as 'Keep Existing' | 'Open Bite' | 'Make Ideal' | '',
      desiredLengthMm: vd.desiredLengthMm,
    },
    maxLengthOfCentrals: {
      choice: mlc.choice as 'Ideal' | 'Other' | '',
      desiredLengthMm: mlc.desiredLengthMm,
    },
    checkDesign:
      r.checkDesign === 'Yes' || r.checkDesign === 'No' ? r.checkDesign : '',
    occlusalContact:
      r.occlusalContact === 'Tight' || r.occlusalContact === 'Zero' || r.occlusalContact === 'Relief'
        ? r.occlusalContact
        : '',
    rxNotes: typeof r.rxNotes === 'string' ? r.rxNotes : '',
  };
}

// ---------------------------------------------------------------------------
// Validation — runs on submit only.
// ---------------------------------------------------------------------------
export type CnbErrors = Partial<{
  treatments: string;
  shade: string;
  gingivalContouring: string;
  gingivalContouringMm: string;
  verticalDimension: string;
  verticalDimensionMm: string;
  maxLengthOfCentrals: string;
  maxLengthOfCentralsMm: string;
  checkDesign: string;
  occlusalContact: string;
}>;

export function validateCnb(
  a: CnbAnswers,
  configuration: FormConfiguration,
): CnbErrors {
  const e: CnbErrors = {};
  const required = 'Please fill out the missing fields.';
  const enabled = (code: CnbSectionCode) => isSectionEnabled(configuration, code);
  const reqd = (code: CnbSectionCode) => isSectionRequired(configuration, code);

  if (reqd('treatments') && !a.toothAssignments.length) {
    e.treatments = 'Select at least one tooth and assign a material.';
  }
  if (reqd('shade') && !a.shade) e.shade = required;

  if (enabled('gingivalContouring')) {
    if (reqd('gingivalContouring') && !a.gingivalContouring.choice) {
      e.gingivalContouring = required;
    } else if (
      a.gingivalContouring.choice === 'Yes' &&
      a.gingivalContouring.desiredLengthMm == null
    ) {
      e.gingivalContouringMm = required;
    }
  }

  if (enabled('verticalDimension')) {
    if (reqd('verticalDimension') && !a.verticalDimension.choice) {
      e.verticalDimension = required;
    } else if (
      a.verticalDimension.choice === 'Open Bite' &&
      a.verticalDimension.desiredLengthMm == null
    ) {
      e.verticalDimensionMm = required;
    }
  }

  if (enabled('maxLengthOfCentrals')) {
    if (reqd('maxLengthOfCentrals') && !a.maxLengthOfCentrals.choice) {
      e.maxLengthOfCentrals = required;
    } else if (
      a.maxLengthOfCentrals.choice === 'Other' &&
      a.maxLengthOfCentrals.desiredLengthMm == null
    ) {
      e.maxLengthOfCentralsMm = required;
    }
  }

  if (reqd('checkDesign') && !a.checkDesign) e.checkDesign = required;
  if (reqd('occlusalContact') && !a.occlusalContact) e.occlusalContact = required;

  return e;
}
