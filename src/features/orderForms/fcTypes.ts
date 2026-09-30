import type { FormConfiguration, MaterialOption } from '@/types/database';
import {
  TEMPLATE_CODE_FINAL_CONSTRUCTION,
  coerceCnbAnswers,
  emptyCnbAnswers,
  validateCnb,
  type CnbAnswers,
  type CnbErrors,
} from './cnbTypes';

/**
 * Final Construction ("საბოლოო კონსტრუქცია").
 *
 * For when the superstructure has to be made again because the doctor did not
 * like its design — a bar and zirconia were made, the zirconia is redone. It
 * is the Crown & Bridge form, priced per tooth like it, plus a design section:
 * the tooth shape and a free-text note on the design wanted. Deliberately not
 * linked to the order it redoes: the doctor places it as a new order.
 */
export { TEMPLATE_CODE_FINAL_CONSTRUCTION };

/**
 * The design section's field code — the lab toggles it (and whether it is
 * required) in the Fields tab like the Crown & Bridge sections. Missing from a
 * configuration means shown, so the section can never silently vanish.
 */
export const FC_DESIGN = 'fcDesign';

/** Tooth shapes, stored as these codes and translated for display. */
export const FC_TOOTH_SHAPES = ['OVOID', 'SQUARE', 'TAPERING'] as const;
export type FcToothShape = (typeof FC_TOOTH_SHAPES)[number];

/**
 * The design answers. Their keys are prefixed because they sit in the same
 * flat answers map as the Crown & Bridge keys and the lab's own questions.
 */
export type FcDesignAnswers = {
  fcToothShape: FcToothShape | '';
  fcDesignNotes: string;
};

export type FinalConstructionAnswers = CnbAnswers & FcDesignAnswers;

export const emptyFcDesign: FcDesignAnswers = { fcToothShape: '', fcDesignNotes: '' };

export const emptyFinalConstructionAnswers: FinalConstructionAnswers = {
  ...emptyCnbAnswers,
  ...emptyFcDesign,
};

export function coerceFcDesign(raw: unknown): FcDesignAnswers {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const shape = r.fcToothShape;
  return {
    fcToothShape:
      typeof shape === 'string' && (FC_TOOTH_SHAPES as readonly string[]).includes(shape)
        ? (shape as FcToothShape)
        : '',
    fcDesignNotes: typeof r.fcDesignNotes === 'string' ? r.fcDesignNotes : '',
  };
}

export function coerceFinalConstructionAnswers(
  raw: unknown,
  materials?: MaterialOption[],
): FinalConstructionAnswers {
  return { ...coerceCnbAnswers(raw, materials), ...coerceFcDesign(raw) };
}

export function isFcDesignEnabled(configuration: FormConfiguration): boolean {
  const f = configuration.fields.find((x) => x.code === FC_DESIGN);
  return f ? f.enabled : true;
}

export function isFcDesignRequired(configuration: FormConfiguration): boolean {
  const f = configuration.fields.find((x) => x.code === FC_DESIGN);
  return !!f && f.enabled && f.required;
}

export type FcDesignErrors = { fcToothShape?: string };

/** A required design section needs a tooth shape; the note is always optional. */
export function validateFcDesign(
  a: FcDesignAnswers,
  configuration: FormConfiguration,
): FcDesignErrors {
  const e: FcDesignErrors = {};
  if (isFcDesignRequired(configuration) && !a.fcToothShape) {
    e.fcToothShape = 'Please fill out the missing fields.';
  }
  return e;
}

export type FinalConstructionErrors = CnbErrors & FcDesignErrors;

export function validateFinalConstruction(
  a: FinalConstructionAnswers,
  configuration: FormConfiguration,
): FinalConstructionErrors {
  return { ...validateCnb(a, configuration), ...validateFcDesign(a, configuration) };
}
