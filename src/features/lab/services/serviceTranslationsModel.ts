import type {
  FieldConfig,
  FormConfiguration,
  LabServiceTextField,
  LabServiceTranslations,
  LabTextLang,
  MaterialOption,
  PricingConfig,
} from '@/types/database';
import { coerceServiceTranslations, SERVICE_TEXT_MAX } from '@/features/lab/labText';

/*
 * The service editor's Translations tab, as data: which of the lab's strings
 * can be translated, where each translation is stored, and how a draft is
 * cleaned before it is saved. The reading side is `features/lab/labText.ts`.
 *
 *   service text   lab_services.translations   (set_lab_service_translations, 0042)
 *   questions      field.translations          (inside configuration_json)
 *   materials      material.translations       (inside pricing_configuration_json)
 *   price text     pricing.translations        (inside pricing_configuration_json)
 *
 * The last three ride the save the page already makes (a new form version), so
 * an order keeps the wording it was answered with.
 */

/** The columns the tab offers, beside the lab's own text. */
export const EDITOR_LANGS = ['en', 'ru'] as const satisfies readonly LabTextLang[];
export type EditorLang = (typeof EDITOR_LANGS)[number];

/** Input limits, matching the inputs the base text is typed into. */
const MAX = {
  label: 300,
  helper_text: 500,
  option: 500,
  material: 200,
  price_description: 4000,
} as const;

const CHOICE_TYPES = new Set(['select', 'chip_multi_select']);

type MaterialList = 'materials' | 'implant_crown_materials';

/** Where one translatable string lives. */
export type TrTarget =
  | { kind: 'service'; field: LabServiceTextField }
  | { kind: 'field'; code: string; key: 'label' | 'helper_text' }
  | { kind: 'option'; code: string; index: number }
  | { kind: 'material'; list: MaterialList; id: string }
  | { kind: 'priceDescription' };

export type TrGroup = 'service' | 'questions' | 'pricing';

export type TrRow = {
  key: string;
  group: TrGroup;
  target: TrTarget;
  /** The lab's own text, shown read-only beside the inputs. */
  base: string;
  /** 1-based position for a question / option caption. */
  number?: number;
  multiline: boolean;
  max: number;
};

/** The service's own text, from the basics form as it stands right now. */
export type ServiceBase = Record<LabServiceTextField, string>;

/**
 * Questions whose wording the lab wrote: every field of a custom form, and the
 * appended questions of a template form. A template's own fields are
 * translated by the platform (`templates.<code>.*`) and stay out of this.
 */
export function labAuthoredFields(config: FormConfiguration): FieldConfig[] {
  return config.fields.filter(
    (f) =>
      f.enabled &&
      f.visible_to_doctor !== false &&
      (config._templateCode === 'OTHER_CUSTOM' || f.type === 'custom_question'),
  );
}

const has = (s: string | null | undefined): s is string => !!s && !!s.trim();

/** Every string on the tab that has base text to translate, grouped, in order. */
export function translationRows(
  base: ServiceBase,
  config: FormConfiguration,
  pricing: PricingConfig,
): TrRow[] {
  const rows: TrRow[] = [];

  (['name', 'short_description', 'average_turnaround_label'] as const).forEach((field) => {
    if (!has(base[field])) return;
    rows.push({
      key: `s:${field}`,
      group: 'service',
      target: { kind: 'service', field },
      base: base[field],
      multiline: field === 'short_description',
      max: SERVICE_TEXT_MAX[field],
    });
  });

  labAuthoredFields(config).forEach((f, qi) => {
    if (!has(f.label)) return;
    rows.push({
      key: `q:${f.code}:label`,
      group: 'questions',
      target: { kind: 'field', code: f.code, key: 'label' },
      base: f.label,
      number: qi + 1,
      multiline: false,
      max: MAX.label,
    });
    if (has(f.helper_text)) {
      rows.push({
        key: `q:${f.code}:helper`,
        group: 'questions',
        target: { kind: 'field', code: f.code, key: 'helper_text' },
        base: f.helper_text,
        multiline: false,
        max: MAX.helper_text,
      });
    }
    if (CHOICE_TYPES.has(f.type)) {
      (f.options ?? []).forEach((opt, index) => {
        if (!has(opt)) return;
        rows.push({
          key: `q:${f.code}:opt:${index}`,
          group: 'questions',
          target: { kind: 'option', code: f.code, index },
          base: opt,
          number: index + 1,
          multiline: false,
          max: MAX.option,
        });
      });
    }
  });

  (['materials', 'implant_crown_materials'] as const).forEach((list) => {
    for (const m of pricing[list] ?? []) {
      if (!has(m.name)) continue;
      rows.push({
        key: `m:${list}:${m.id}`,
        group: 'pricing',
        target: { kind: 'material', list, id: m.id },
        base: m.name,
        multiline: false,
        max: MAX.material,
      });
    }
  });

  // Only shown to the doctor under LAB_DESCRIBED; a description kept from an
  // earlier model is not offered.
  if (pricing.model === 'LAB_DESCRIBED' && has(pricing.price_description)) {
    rows.push({
      key: 'p:description',
      group: 'pricing',
      target: { kind: 'priceDescription' },
      base: pricing.price_description,
      multiline: true,
      max: MAX.price_description,
    });
  }

  return rows;
}

/** The whole draft the tab edits; nothing is written until the page saves. */
export type TrDraft = {
  service: LabServiceTranslations;
  config: FormConfiguration;
  pricing: PricingConfig;
};

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** The draft's value for `target` in `lang`, as typed. */
export function readTranslation(draft: TrDraft, target: TrTarget, lang: EditorLang): string {
  switch (target.kind) {
    case 'service':
      return str(draft.service[lang]?.[target.field]);
    case 'field': {
      const f = draft.config.fields.find((x) => x.code === target.code);
      return str(f?.translations?.[lang]?.[target.key]);
    }
    case 'option': {
      const f = draft.config.fields.find((x) => x.code === target.code);
      return str(f?.translations?.[lang]?.options?.[target.index]);
    }
    case 'material': {
      const m = (draft.pricing[target.list] ?? []).find((x) => x.id === target.id);
      return str(m?.translations?.[lang]?.name);
    }
    case 'priceDescription':
      return str(draft.pricing.translations?.[lang]?.price_description);
  }
}

/** The draft with `target` in `lang` set to `value`, as typed (cleaned on save). */
export function writeTranslation(
  draft: TrDraft,
  target: TrTarget,
  lang: EditorLang,
  value: string,
): TrDraft {
  switch (target.kind) {
    case 'service':
      return {
        ...draft,
        service: {
          ...draft.service,
          [lang]: { ...draft.service[lang], [target.field]: value },
        },
      };
    case 'field':
    case 'option':
      return {
        ...draft,
        config: {
          ...draft.config,
          fields: draft.config.fields.map((f) => {
            if (f.code !== target.code) return f;
            const own = f.translations?.[lang] ?? {};
            let next: typeof own;
            if (target.kind === 'field') {
              next = { ...own, [target.key]: value };
            } else {
              const options = [...(own.options ?? [])];
              while (options.length < target.index) options.push(null);
              options[target.index] = value;
              next = { ...own, options };
            }
            return { ...f, translations: { ...f.translations, [lang]: next } };
          }),
        },
      };
    case 'material':
      return {
        ...draft,
        pricing: {
          ...draft.pricing,
          [target.list]: (draft.pricing[target.list] ?? []).map((m) =>
            m.id === target.id
              ? { ...m, translations: { ...m.translations, [lang]: { ...m.translations?.[lang], name: value } } }
              : m,
          ),
        },
      };
    case 'priceDescription':
      return {
        ...draft,
        pricing: {
          ...draft.pricing,
          translations: {
            ...draft.pricing.translations,
            [lang]: { ...draft.pricing.translations?.[lang], price_description: value },
          },
        },
      };
  }
}

/** Per language: how many of `rows` have a (non-blank) translation. */
export function completeness(
  draft: TrDraft,
  rows: TrRow[],
): Record<EditorLang, { done: number; total: number }> {
  const out = {} as Record<EditorLang, { done: number; total: number }>;
  for (const lang of EDITOR_LANGS) {
    out[lang] = {
      done: rows.filter((r) => readTranslation(draft, r.target, lang).trim()).length,
      total: rows.length,
    };
  }
  return out;
}

/* ---------------------------------------------------------------------------
 * Cleaning — "has this been translated?" must stay answerable, so blanks are
 * never stored: an untouched language is absent, not a blob of "".
 * ------------------------------------------------------------------------- */

const LANGS: readonly LabTextLang[] = ['ka', 'en', 'ru'];

const clean = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null;

/**
 * `{lang: {key: text}}` with only non-blank strings, trimmed; null when
 * nothing is left. `keys` lists the string fields kept; an `options` array is
 * kept by index (null for an untranslated option), trailing gaps dropped.
 */
function cleanBlob(
  raw: unknown,
  keys: readonly string[],
  withOptions = false,
): Record<string, Record<string, unknown>> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: Record<string, Record<string, unknown>> = {};
  for (const lang of LANGS) {
    const body = (raw as Record<string, unknown>)[lang];
    if (!body || typeof body !== 'object' || Array.isArray(body)) continue;
    const own: Record<string, unknown> = {};
    for (const k of keys) {
      const v = clean((body as Record<string, unknown>)[k]);
      if (v) own[k] = v;
    }
    const options = (body as Record<string, unknown>).options;
    if (withOptions && Array.isArray(options)) {
      const list = options.map(clean);
      while (list.length && list[list.length - 1] === null) list.pop();
      if (list.length) own.options = list;
    }
    if (Object.keys(own).length) out[lang] = own;
  }
  return Object.keys(out).length ? out : null;
}

/** Sets or removes `translations` on an object, so an untranslated one is unchanged. */
function withTranslations<T extends { translations?: unknown }>(obj: T, tr: unknown): T {
  if (tr) return { ...obj, translations: tr };
  if (!('translations' in obj)) return obj;
  const rest = { ...obj };
  delete rest.translations;
  return rest;
}

export function cleanServiceTranslations(raw: LabServiceTranslations): LabServiceTranslations {
  return coerceServiceTranslations(raw);
}

export function cleanConfigTranslations(config: FormConfiguration): FormConfiguration {
  return {
    ...config,
    fields: config.fields.map((f) =>
      withTranslations(f, cleanBlob(f.translations, ['label', 'helper_text'], true)),
    ),
  };
}

export function cleanPricingTranslations(pricing: PricingConfig): PricingConfig {
  const materials = (list: MaterialOption[] | undefined) =>
    list?.map((m) => withTranslations(m, cleanBlob(m.translations, ['name'])));
  let out: PricingConfig = withTranslations(
    pricing,
    cleanBlob(pricing.translations, ['price_description']),
  );
  if (pricing.materials) out = { ...out, materials: materials(pricing.materials) };
  if (pricing.implant_crown_materials) {
    out = { ...out, implant_crown_materials: materials(pricing.implant_crown_materials) };
  }
  return out;
}

/** A translated service name the server would refuse (0042: 2–200 characters). */
export function serviceNameTooShort(service: LabServiceTranslations): EditorLang[] {
  return EDITOR_LANGS.filter((l) => {
    const v = service[l]?.name?.trim() ?? '';
    return v.length > 0 && v.length < 2;
  });
}

/**
 * The option translations after the base option at `index` is removed, so the
 * ones after it keep lining up with their options.
 */
export function dropOptionTranslation(
  translations: FieldConfig['translations'],
  index: number,
): FieldConfig['translations'] {
  if (!translations) return translations;
  const out: NonNullable<FieldConfig['translations']> = {};
  for (const lang of LANGS) {
    const own = translations[lang];
    if (!own) continue;
    out[lang] = Array.isArray(own.options)
      ? { ...own, options: own.options.filter((_, i) => i !== index) }
      : own;
  }
  return out;
}
