import type { FormConfiguration } from '@/types/database';
import {
  ABUTMENT_STATUS_OPTIONS,
  TEMPLATE_CODE_IMPLANT_ABUTMENTS,
  coerceImplantAnswers,
  emptyImplantAnswers,
  isImplantConfigComplete,
  validateImplantRestoration,
  type ImplantConfig,
  type ImplantRestorationAnswers,
  type ImplantRestorationErrors,
} from './implantTypes';

/**
 * Lab-placed abutments ("აბატმენტების ჩაყენება ლაბორატორიულად").
 *
 * Everything of Constructions on Implants up to the crowns, drawn by
 * `ImplantRestorationForm` in its `abutments` variant: brand, positions, each
 * implant's abutment status, type and options, then the bar. No crown. The
 * one question of its own is whether the doctor wants a transfer check, which
 * is not priced. The price is the implant component grid and the bar, as on
 * the parent template, with nothing for crowns.
 */
export { TEMPLATE_CODE_IMPLANT_ABUTMENTS };

/**
 * The abutment statuses this template offers. "Already in mouth" is the
 * parent's option for a crown or bar going onto an abutment that is already
 * there; here the abutment is what is being ordered, so an implant marked that
 * way would ask the lab for nothing.
 */
export const ABUTMENTS_STATUS_OPTIONS = ABUTMENT_STATUS_OPTIONS.filter(
  (o) => o.key !== 'existingAbutment',
);

/** `isImplantConfigComplete`, with "Already in mouth" not an answer here. */
export function isAbutmentConfigComplete(cfg: ImplantConfig): boolean {
  return cfg.abutmentStatus !== 'existingAbutment' && isImplantConfigComplete(cfg);
}

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
 * The implant answers, minus the crown this template never asks for. A crown
 * can only get here from a payload that was not written by this form;
 * dropping it keeps it out of the price, which would otherwise charge the
 * doctor for work nobody ordered. The bar stays: this form draws it.
 */
export function coerceAbutmentAnswers(raw: unknown): ImplantAbutmentAnswers {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    ...coerceImplantAnswers(raw),
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
  // Positions, brand, each implant's configuration and the bar, as on the
  // parent template.
  const e: ImplantAbutmentErrors = validateImplantRestoration(a);

  // An implant left on "Already in mouth" — from a draft written before the
  // option was taken off this form — is not configured for it: the doctor
  // picks what the lab should make, as for any other unfinished implant.
  const incomplete = new Set(e.incompleteConfigs ?? []);
  for (const pos of a.implantPositions) {
    const cfg = a.configsByPosition[String(pos)];
    if (cfg && !isAbutmentConfigComplete(cfg)) incomplete.add(pos);
  }
  if (incomplete.size > 0) {
    // In the order the positions were picked, as the parent reports them.
    e.incompleteConfigs = a.implantPositions.filter((pos) => incomplete.has(pos));
  }

  if (isAbutmentFieldRequired(configuration, AB_TRANSFER_CHECK) && a.abTransferCheck === undefined) {
    e.abTransferCheck = 'Please fill out the missing fields.';
  }
  return e;
}
