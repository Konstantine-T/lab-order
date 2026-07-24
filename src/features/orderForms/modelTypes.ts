import type { FormConfiguration } from '@/types/database';

export const TEMPLATE_CODE_MODEL = 'MODEL';
/** Titanium milling ("ტიტანის გამოჩარხვა") reuses the Print Model form verbatim. */
export const TEMPLATE_CODE_TITANIUM = 'TITANIUM_MILLING';

/** True for every template rendered with the Model form (Print Model + Titanium Milling). */
export function isModelTemplateCode(code: string | undefined): boolean {
  return code === TEMPLATE_CODE_MODEL || code === TEMPLATE_CODE_TITANIUM;
}

export const MODEL_FIELD_CODES = [
  'model_type',
  'model_articulator',
  'model_arch',
  'model_markings',
  'model_base_type',
  'model_prepared_dies',
  'model_notes',
] as const;

export type ModelFieldCode = (typeof MODEL_FIELD_CODES)[number];

export type ModelType = 'BASE_MODEL' | 'IMPLANT_MODEL' | 'ORTHO_MODEL';
export type ModelArch = 'UPPER' | 'LOWER' | 'BOTH';
export type ModelBaseType = 'HOLLOW' | 'SOLID';

export type ModelAnswers = {
  modelType: ModelType | '';
  articulatorAlignment: 'YES' | 'NO' | '';
  arch: ModelArch | '';
  markings: string;
  baseType: ModelBaseType | '';
  preparedDies: 'YES' | 'NO' | '';
  notes: string;
};

export type ModelErrors = Partial<{
  modelType: string;
  articulatorAlignment: string;
  arch: string;
  baseType: string;
  preparedDies: string;
}>;

export const emptyModelAnswers: ModelAnswers = {
  modelType: '',
  articulatorAlignment: '',
  arch: '',
  markings: '',
  baseType: '',
  preparedDies: '',
  notes: '',
};

/** Missing field ⟹ enabled (so existing configs without explicit fields keep working). */
export function isModelFieldEnabled(
  configuration: FormConfiguration,
  code: ModelFieldCode,
): boolean {
  const f = configuration.fields.find((x) => x.code === code);
  if (!f) return true;
  return f.enabled;
}

export function isModelFieldRequired(
  configuration: FormConfiguration,
  code: ModelFieldCode,
): boolean {
  const f = configuration.fields.find((x) => x.code === code);
  if (!f) return false;
  return f.enabled && f.required;
}

export function coerceModelAnswers(raw: unknown): ModelAnswers {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    modelType: (typeof r.modelType === 'string' ? r.modelType : '') as ModelType | '',
    articulatorAlignment: (typeof r.articulatorAlignment === 'string'
      ? r.articulatorAlignment
      : '') as 'YES' | 'NO' | '',
    arch: (typeof r.arch === 'string' ? r.arch : '') as ModelArch | '',
    markings: typeof r.markings === 'string' ? r.markings : '',
    baseType: (typeof r.baseType === 'string' ? r.baseType : '') as ModelBaseType | '',
    preparedDies: (typeof r.preparedDies === 'string'
      ? r.preparedDies
      : '') as 'YES' | 'NO' | '',
    notes: typeof r.notes === 'string' ? r.notes : '',
  };
}

export function validateModel(
  a: ModelAnswers,
  configuration: FormConfiguration,
): ModelErrors {
  const e: ModelErrors = {};
  const req = 'Please fill out the required fields.';
  const enabled = (code: ModelFieldCode) => isModelFieldEnabled(configuration, code);
  const required = (code: ModelFieldCode) => isModelFieldRequired(configuration, code);

  if (enabled('model_type') && required('model_type') && !a.modelType) e.modelType = req;
  if (enabled('model_articulator') && required('model_articulator') && !a.articulatorAlignment) e.articulatorAlignment = req;
  if (enabled('model_arch') && required('model_arch') && !a.arch) e.arch = req;
  if (enabled('model_base_type') && required('model_base_type') && !a.baseType) e.baseType = req;
  if (enabled('model_prepared_dies') && required('model_prepared_dies') && !a.preparedDies) e.preparedDies = req;
  return e;
}
