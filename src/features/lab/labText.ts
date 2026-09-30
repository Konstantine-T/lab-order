import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { LabPublicTranslations, LabTextField, LabTextLang } from '@/types/database';

/**
 * A lab's public name and description in the reader's language.
 *
 * `labs.public_translations` (0037) holds optional per-language copies of the
 * two doctor-facing text fields. Whatever the lab typed into `public_name` /
 * `short_description` stays the base and the fallback, whichever language that
 * was — so there is no "primary language" setting, and a lab that never opens
 * the translation tabs reads exactly as it did before.
 *
 * Order rows keep reading `lab_snapshot`: a snapshot is what the lab was called
 * when the order was placed, and is not translated after the fact.
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

/**
 * Defensive read of the stored column: anything that isn't the expected shape
 * is dropped rather than rendered, and blank strings count as absent. Also
 * covers the column not existing yet (undefined) before 0037 is applied.
 */
export function coercePublicTranslations(raw: unknown): LabPublicTranslations {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: LabPublicTranslations = {};
  for (const [lang, body] of Object.entries(raw as Record<string, unknown>)) {
    if (!isLang(lang) || !body || typeof body !== 'object' || Array.isArray(body)) continue;
    const fields: Partial<Record<LabTextField, string>> = {};
    for (const field of LAB_TEXT_FIELDS) {
      const v = (body as Record<string, unknown>)[field];
      if (typeof v === 'string' && v.trim()) fields[field] = v.trim();
    }
    if (Object.keys(fields).length) out[lang] = fields;
  }
  return out;
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
  const code = lang.slice(0, 2);
  if (isLang(code)) {
    const own = coercePublicTranslations(lab.public_translations)[code]?.[field];
    if (own) return own;
  }
  return lab[field] ?? '';
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
