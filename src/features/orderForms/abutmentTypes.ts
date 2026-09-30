import type { FormConfiguration } from '@/types/database';
import {
  TEMPLATE_CODE_IMPLANT_ABUTMENTS,
  coerceImplantAnswers,
  emptyImplantAnswers,
  validateImplantRestoration,
  type ImplantRestorationAnswers,
  type ImplantRestorationErrors,
} from './implantTypes';

/**
 * Lab-placed abutments ("აბატმენტების ჩაყენება ლაბორატორიულად").
 *
 * Only the implant configuration of Constructions on Implants — brand,
 * positions, and each implant's abutment status, type and options — drawn by
 * `ImplantRestorationForm` in its `abutments` variant. No bar, no crown. The
 * one question of its own is whether the doctor wants a transfer check, which
 * is not priced. The price is the implant component grid, as on the parent
 * template, with nothing for crowns.
 */
export { TEMPLATE_CODE_IMPLANT_ABUTMENTS };

/**
 * The transfer-check question's field code, and its answer key. The two are
 * the same on purpose: the lab toggles the question (and whether it is
 * required) as a field of the form, and anything that reads the answers by
 * field code finds the answer under it. Prefixed because the answers map is
 * shared with the lab's own appended questions.
 */
export const AB_TRANSFER_CHECK = 'abTransferCheck';

export type ImplantAbutmentAnswers = ImplantRestorationAnswers & {
  /** Does the doctor want a transfer check? Unset until answered. Not priced. */
  abTransferCheck?: boolean;
};

export const emptyAbutmentAnswers: ImplantAbutmentAnswers = {
  ...emptyImplantAnswers,
  bar: { barTeeth: [] },
};

/**
 * The implant answers, minus what this template never asks for. A bar or a
 * crown can only get here from a payload that was not written by this form;
 * dropping them keeps them out of the price, which would otherwise charge the
 * doctor for work nobody ordered.
 */
export function coerceAbutmentAnswers(raw: unknown): ImplantAbutmentAnswers {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    ...coerceImplantAnswers(raw),
    bar: { barTeeth: [] },
    cnbAnswers: undefined,
    abTransferCheck: typeof r[AB_TRANSFER_CHECK] === 'boolean' ? (r[AB_TRANSFER_CHECK] as boolean) : undefined,
  };
}

/** Missing field ⇒ shown, as the other templates treat their sections. */
export function isAbutmentFieldEnabled(configuration: FormConfiguration, code: string): boolean {
  const f = configuration.fields.find((x) => x.code === code);
  return f ? f.enabled : true;
}

export function isAbutmentFieldRequired(configuration: FormConfiguration, code: string): boolean {
  const f = configuration.fields.find((x) => x.code === code);
  return !!f && f.enabled && f.required;
}

export type ImplantAbutmentErrors = ImplantRestorationErrors & {
  abTransferCheck?: string;
};

export function validateAbutments(
  a: ImplantAbutmentAnswers,
  configuration: FormConfiguration,
): ImplantAbutmentErrors {
  // The bar checks inside never fire: the bar is always unset here.
  const e: ImplantAbutmentErrors = validateImplantRestoration(a);
  if (isAbutmentFieldRequired(configuration, AB_TRANSFER_CHECK) && a.abTransferCheck === undefined) {
    e.abTransferCheck = 'Please fill out the missing fields.';
  }
  return e;
}
