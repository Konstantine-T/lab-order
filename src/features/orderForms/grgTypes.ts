import type { FormConfiguration } from '@/types/database';

export const TEMPLATE_CODE_GRG = 'GINGIVAL_REDUCTION_GUIDE';

export const GRG_FIELD_CODES = [
  'grg_teeth',
  'grg_additive_wax_up',
  'grg_approval_needed',
  'grg_notes',
] as const;

export type GrgFieldCode = (typeof GRG_FIELD_CODES)[number];

export type GrgAnswers = {
  teeth: number[];
  additiveWaxUp: 'YES' | 'NO' | '';
  approvalNeeded: 'YES' | 'NO' | '';
  notes: string;
};

export type GrgErrors = Partial<{
  teeth: string;
  additiveWaxUp: string;
  approvalNeeded: string;
}>;

export const emptyGrgAnswers: GrgAnswers = {
  teeth: [],
  additiveWaxUp: '',
  approvalNeeded: '',
  notes: '',
};

export function isGrgFieldEnabled(
  configuration: FormConfiguration,
  code: GrgFieldCode,
): boolean {
  const f = configuration.fields.find((x) => x.code === code);
  if (!f) return true;
  return f.enabled;
}

export function isGrgFieldRequired(
  configuration: FormConfiguration,
  code: GrgFieldCode,
): boolean {
  const f = configuration.fields.find((x) => x.code === code);
  if (!f) return false;
  return f.enabled && f.required;
}

export function coerceGrgAnswers(raw: unknown): GrgAnswers {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    teeth: Array.isArray(r.teeth) ? (r.teeth as number[]) : [],
    additiveWaxUp: (typeof r.additiveWaxUp === 'string'
      ? r.additiveWaxUp
      : '') as 'YES' | 'NO' | '',
    approvalNeeded: (typeof r.approvalNeeded === 'string'
      ? r.approvalNeeded
      : '') as 'YES' | 'NO' | '',
    notes: typeof r.notes === 'string' ? r.notes : '',
  };
}

export function validateGrg(
  a: GrgAnswers,
  configuration: FormConfiguration,
): GrgErrors {
  const e: GrgErrors = {};
  const req = 'Please fill out the required fields.';
  const enabled = (code: GrgFieldCode) => isGrgFieldEnabled(configuration, code);
  const required = (code: GrgFieldCode) => isGrgFieldRequired(configuration, code);

  if (enabled('grg_teeth') && required('grg_teeth') && a.teeth.length === 0) e.teeth = req;
  if (enabled('grg_additive_wax_up') && required('grg_additive_wax_up') && !a.additiveWaxUp)
    e.additiveWaxUp = req;
  if (enabled('grg_approval_needed') && required('grg_approval_needed') && !a.approvalNeeded)
    e.approvalNeeded = req;
  return e;
}
