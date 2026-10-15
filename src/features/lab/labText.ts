import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  FieldConfig,
  LabPublicTranslations,
  LabServiceTextField,
  LabServiceTranslations,
  LabTextField,
  LabTextLang,
  MaterialOption,
  PricingConfig,
} from '@/types/database';

/**
 * Lab-authored text in the reader's language.
 *
 * Everything a lab types that a doctor reads can carry optional per-language
 * copies, all in one shape — `{ "en": { "<field>": "..." }, "ru": {...} }`:
 *
 *   labs.public_translations (0037)      public_name, short_description
 *   lab_services.translations (0042)     name, short_description,
 *                                        average_turnaround_label
 *   a form field's `translations`        label, helper_text, options[]
 *   a material's `translations`          name
 *   the pricing config's `translations`  price_description
 *
 * One fallback rule for all of them (`pickText`): a translation wins only when
 * present and non-blank after trimming; otherwise the base field, whichever
 * language the lab wrote it in. So there is no "primary language" setting, and
 * a lab that never translates reads exactly as it did before.
 *
 * Order rows keep reading their snapshots: a snapshot is what the lab and the
 * service were called when the order was placed, and is not translated after
 * the fact. Form and pricing text lives in the immutable form version, so an
 * order keeps the wording it was answered with.
 */

/** The translation slots, in the order the lab's editor shows them. */
export const LAB_TEXT_LANGS: readonly LabTextLang[] = ['ka', 'en', 'ru'];

export const LAB_TEXT_FIELDS: readonly LabTextField[] = ['public_name', 'short_description'];

/** Mirrors the server's limits (`lab_public_translations_valid`, 0037). */
export const LAB_TEXT_MAX: Record<LabTextField, number> = {
  public_name: 200,
  short_description: 2000,
};

/** The UI language as a two-letter code — the detector can hand back `en-US`. */
export function uiLang(i18n: { resolvedLanguage?: string; language?: string }): string {
  return (i18n.resolvedLanguage ?? i18n.language ?? 'en').slice(0, 2);
}

const isLang = (v: string): v is LabTextLang => (LAB_TEXT_LANGS as readonly string[]).includes(v);

const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

/** The one rule for a stored translation: a non-blank string, trimmed. */
const ownText = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null;

/** `translations[lang]` when it is an object, for any of the shapes above. */
function langBody(translations: unknown, lang: string): Record<string, unknown> | null {
  const code = lang.slice(0, 2);
  if (!isLang(code) || !isObject(translations)) return null;
  const body = translations[code];
  return isObject(body) ? body : null;
}

/**
 * Defensive read of a stored `{lang: {field: text}}` blob: anything that isn't
 * the expected shape is dropped rather than rendered, and blank strings count
 * as absent. Also covers the column not existing yet (undefined).
 */
export function coerceTextTranslations<F extends string>(
  raw: unknown,
  fields: readonly F[],
): Partial<Record<LabTextLang, Partial<Record<F, string>>>> {
  const out: Partial<Record<LabTextLang, Partial<Record<F, string>>>> = {};
  for (const lang of LAB_TEXT_LANGS) {
    const body = langBody(raw, lang);
    if (!body) continue;
    const own: Partial<Record<F, string>> = {};
    for (const field of fields) {
      const v = ownText(body[field]);
      if (v) own[field] = v;
    }
    if (Object.keys(own).length) out[lang] = own;
  }
  return out;
}

/** `labs.public_translations` (0037), coerced. */
export function coercePublicTranslations(raw: unknown): LabPublicTranslations {
  return coerceTextTranslations(raw, LAB_TEXT_FIELDS);
}

/**
 * The translation for `field` in the reader's language, or the base value.
 * Returns '' when there is nothing at all, so callers keep their existing
 * "render only if present" checks. The base comes back as stored (untrimmed).
 */
export function pickText<T extends string>(
  base: string | null | undefined,
  translations: unknown,
  field: T,
  lang: string,
): string {
  return ownText(langBody(translations, lang)?.[field]) ?? base ?? '';
}

/** The fields `labText` reads. Every lab-shaped object on the doctor side fits. */
export type LabTextSource = {
  public_name?: string | null;
  short_description?: string | null;
  public_translations?: unknown;
};

/**
 * The lab's `field` in `lang`, or the base column when that language has no
 * (non-blank) translation. Returns '' when there is nothing at all, so callers
 * keep their existing "render only if present" checks.
 */
export function labText(lab: LabTextSource, field: LabTextField, lang: string): string {
  return pickText(lab[field], lab.public_translations, field, lang);
}

/** Every name the lab goes by — the base and each translation — for search. */
export function labNames(lab: LabTextSource): string[] {
  const tr = coercePublicTranslations(lab.public_translations);
  return [
    lab.public_name ?? '',
    ...LAB_TEXT_LANGS.map((l) => tr[l]?.public_name ?? ''),
  ].filter(Boolean);
}

/** `labText` bound to the current UI language, re-rendering when it changes. */
export function useLabText() {
  const { i18n } = useTranslation();
  const lang = uiLang(i18n);
  const text = useCallback(
    (lab: LabTextSource, field: LabTextField) => labText(lab, field, lang),
    [lang],
  );
  return { labText: text, lang };
}

/* ---------------------------------------------------------------------------
 * A lab's services (`lab_services.translations`, 0042)
 * ------------------------------------------------------------------------- */

/** Mirrors the server's limits (`lab_service_translations_valid`, 0042). */
export const SERVICE_TEXT_MAX: Record<LabServiceTextField, number> = {
  name: 200,
  short_description: 2000,
  average_turnaround_label: 200,
};

export const SERVICE_TEXT_FIELDS: readonly LabServiceTextField[] = [
  'name',
  'short_description',
  'average_turnaround_label',
];

/** `lab_services.translations` (0042), coerced. */
export function coerceServiceTranslations(raw: unknown): LabServiceTranslations {
  return coerceTextTranslations(raw, SERVICE_TEXT_FIELDS);
}

/** Every name a service goes by — the base and each translation — for search. */
export function serviceNames(service: { name?: string | null; translations?: unknown }): string[] {
  const tr = coerceServiceTranslations(service.translations);
  return [service.name ?? '', ...LAB_TEXT_LANGS.map((l) => tr[l]?.name ?? '')].filter(Boolean);
}

/* ---------------------------------------------------------------------------
 * The lab's form and pricing text (inside the form version's JSON)
 * ------------------------------------------------------------------------- */

/** A form field's label or helper text in `lang`. */
export function fieldText(
  field: Pick<FieldConfig, 'label' | 'helper_text' | 'translations'>,
  key: 'label' | 'helper_text',
  lang: string,
): string {
  return pickText(field[key], field.translations, key, lang);
}

/**
 * What to SHOW for each of a choice field's options, by index against the base
 * `options`. Display only: the value a doctor picks, and the one stored in the
 * answers, is always the base option — a translated value would no longer match
 * the option list. An option with no translation shows its base text, so an
 * option added after translating simply falls back.
 */
export function optionLabels(
  field: Pick<FieldConfig, 'options' | 'translations'>,
  lang: string,
): string[] {
  const own = langBody(field.translations, lang)?.options;
  const list = Array.isArray(own) ? own : [];
  return (field.options ?? []).map((base, i) => ownText(list[i]) ?? base);
}

/** The label to show for the stored option `value` (itself when unknown). */
export function optionLabel(
  field: Pick<FieldConfig, 'options' | 'translations'>,
  value: string,
  lang: string,
): string {
  const i = (field.options ?? []).indexOf(value);
  return i < 0 ? value : optionLabels(field, lang)[i];
}

/**
 * The lab's materials with `name` in `lang`. Display only: `id` and
 * `unit_price` are untouched, so anything keyed on them prices the same.
 */
export function localizeMaterials<M extends MaterialOption>(
  materials: readonly M[] | null | undefined,
  lang: string,
): M[] {
  return (materials ?? []).map((m) => {
    const name = pickText(m.name, m.translations, 'name', lang);
    return name === m.name ? m : { ...m, name };
  });
}

/** A LAB_DESCRIBED service's price description in `lang`. */
export function priceDescription(
  pricing: Pick<PricingConfig, 'price_description' | 'translations'> | null | undefined,
  lang: string,
): string {
  return pickText(pricing?.price_description, pricing?.translations, 'price_description', lang);
}

/** The UI language, re-read on every change, for the helpers above. */
export function useUiLang(): string {
  const { i18n } = useTranslation();
  return uiLang(i18n);
}
