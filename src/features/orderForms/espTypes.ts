import type { FormConfiguration } from '@/types/database';
import type { ShadeScale } from './cnbTypes';

export const TEMPLATE_CODE_ESP = 'EVIDENT_SMILE';

export const ESP_FIELD_CODES = [
  'esp_treatments',
  'esp_misalignment',
  'esp_gingival',
  'esp_vertical_dimension',
  'esp_max_length',
  'esp_shade',
  'esp_smile_type',
  'esp_notes',
] as const;

export type EspFieldCode = (typeof ESP_FIELD_CODES)[number];

export type EspMisalignment = 'AS_MUCH_AS_POSSIBLE' | 'OTHER';
export type EspVerticalDimension = 'KEEP_EXISTING' | 'OPEN_BITE' | 'MAKE_IDEAL';
export type EspMaxLength = 'IDEAL' | 'OTHER';
export type EspSmileType =
  | 'HIGH_SMILE_LINE'
  | 'MEDIUM_SMILE_LINE'
  | 'LOW_SMILE_LINE'
  | 'GUMMY_SMILE'
  | 'DUCHENNE_SMILE'
  | 'NON_DUCHENNE_SMILE'
  | 'COMMISSURE_SMILE'
  | 'CUSPID_SMILE'
  | 'COMPLEX_SMILE'
  | 'MONA_LISA_SMILE'
  | 'CANINE_SMILE'
  | 'FULL_DENTURE_SMILE';

export const ESP_SMILE_TYPES: EspSmileType[] = [
  'HIGH_SMILE_LINE',
  'MEDIUM_SMILE_LINE',
  'LOW_SMILE_LINE',
  'GUMMY_SMILE',
  'DUCHENNE_SMILE',
  'NON_DUCHENNE_SMILE',
  'COMMISSURE_SMILE',
  'CUSPID_SMILE',
  'COMPLEX_SMILE',
  'MONA_LISA_SMILE',
  'CANINE_SMILE',
  'FULL_DENTURE_SMILE',
];

export type EspAnswers = {
  // Tooth chart — same shape as CnB so TreatmentBuilder can be reused
  toothAssignments: { tooth: number; materialId: string }[];
  notation: 'Universal' | 'FDI';
  treatmentNotes: string;
  // Questions
  misalignment: EspMisalignment | '';
  misalignmentOther: string;
  gingivalContouring: 'YES' | 'NO' | '';
  needsGingivalReductionGuide: 'YES' | 'NO' | '';
  verticalDimension: EspVerticalDimension | '';
  verticalDimensionMm: number | null;
  maxLength: EspMaxLength | '';
  maxLengthOther: string;
  shade: string;
  shadeScale: ShadeScale;
  shadeNotes: string;
  smileType: EspSmileType | '';
  notes: string;
};

export type EspErrors = Partial<{
  treatments: string;
  misalignment: string;
  gingivalContouring: string;
  verticalDimension: string;
  maxLength: string;
  shade: string;
  smileType: string;
}>;

export const emptyEspAnswers: EspAnswers = {
  toothAssignments: [],
  notation: 'FDI',
  treatmentNotes: '',
  misalignment: '',
  misalignmentOther: '',
  gingivalContouring: '',
  needsGingivalReductionGuide: '',
  verticalDimension: '',
  verticalDimensionMm: null,
  maxLength: '',
  maxLengthOther: '',
  shade: '',
  shadeScale: 'CLASSICAL',
  shadeNotes: '',
  smileType: '',
  notes: '',
};

export function isEspFieldEnabled(configuration: FormConfiguration, code: EspFieldCode): boolean {
  const f = configuration.fields.find((x) => x.code === code);
  if (!f) return true;
  return f.enabled;
}

export function isEspFieldRequired(configuration: FormConfiguration, code: EspFieldCode): boolean {
  const f = configuration.fields.find((x) => x.code === code);
  if (!f) return false;
  return f.enabled && f.required;
}

export function coerceEspAnswers(raw: unknown): EspAnswers {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

  const coerceAssignments = (arr: unknown) => {
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (a): a is { tooth: number; materialId: string } =>
        typeof a === 'object' &&
        a !== null &&
        typeof (a as Record<string, unknown>).tooth === 'number' &&
        typeof (a as Record<string, unknown>).materialId === 'string',
    );
  };

  return {
    toothAssignments: coerceAssignments(r.toothAssignments),
    notation: r.notation === 'Universal' ? 'Universal' : 'FDI',
    treatmentNotes: typeof r.treatmentNotes === 'string' ? r.treatmentNotes : '',
    misalignment: (typeof r.misalignment === 'string' ? r.misalignment : '') as EspMisalignment | '',
    misalignmentOther: typeof r.misalignmentOther === 'string' ? r.misalignmentOther : '',
    gingivalContouring: (typeof r.gingivalContouring === 'string' ? r.gingivalContouring : '') as 'YES' | 'NO' | '',
    needsGingivalReductionGuide: (typeof r.needsGingivalReductionGuide === 'string' ? r.needsGingivalReductionGuide : '') as 'YES' | 'NO' | '',
    verticalDimension: (typeof r.verticalDimension === 'string' ? r.verticalDimension : '') as EspVerticalDimension | '',
    verticalDimensionMm: typeof r.verticalDimensionMm === 'number' ? r.verticalDimensionMm : null,
    maxLength: (typeof r.maxLength === 'string' ? r.maxLength : '') as EspMaxLength | '',
    maxLengthOther: typeof r.maxLengthOther === 'string' ? r.maxLengthOther : '',
    shade: typeof r.shade === 'string' ? r.shade : '',
    shadeScale: r.shadeScale === '3D_MASTER' ? '3D_MASTER' : 'CLASSICAL',
    shadeNotes: typeof r.shadeNotes === 'string' ? r.shadeNotes : '',
    smileType: (typeof r.smileType === 'string' ? r.smileType : '') as EspSmileType | '',
    notes: typeof r.notes === 'string' ? r.notes : '',
  };
}

export function validateEsp(a: EspAnswers, configuration: FormConfiguration): EspErrors {
  const e: EspErrors = {};
  const req = 'Please fill out the required fields.';
  const en = (c: EspFieldCode) => isEspFieldEnabled(configuration, c);
  const rd = (c: EspFieldCode) => isEspFieldRequired(configuration, c);

  if (en('esp_treatments') && rd('esp_treatments') && !a.toothAssignments.length)
    e.treatments = 'Select at least one tooth and assign a material.';
  if (en('esp_misalignment') && rd('esp_misalignment') && !a.misalignment) e.misalignment = req;
  if (en('esp_gingival') && rd('esp_gingival') && !a.gingivalContouring) e.gingivalContouring = req;
  if (en('esp_vertical_dimension') && rd('esp_vertical_dimension') && !a.verticalDimension) e.verticalDimension = req;
  if (en('esp_max_length') && rd('esp_max_length') && !a.maxLength) e.maxLength = req;
  if (en('esp_shade') && rd('esp_shade') && !a.shade) e.shade = req;
  if (en('esp_smile_type') && rd('esp_smile_type') && !a.smileType) e.smileType = req;

  return e;
}
