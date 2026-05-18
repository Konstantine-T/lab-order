export const TEMPLATE_CODE_MODEL = 'MODEL';

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

export function validateModel(a: ModelAnswers): ModelErrors {
  const e: ModelErrors = {};
  const req = 'Please fill out the required fields.';
  if (!a.modelType) e.modelType = req;
  if (!a.articulatorAlignment) e.articulatorAlignment = req;
  if (!a.arch) e.arch = req;
  if (!a.baseType) e.baseType = req;
  if (!a.preparedDies) e.preparedDies = req;
  return e;
}
