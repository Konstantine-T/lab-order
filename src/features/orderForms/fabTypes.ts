// Print & Milling — two simple, unit-priced fabrication services. The lab
// configures the materials it offers (each with a per-unit price); the doctor
// picks one material and a quantity, and the price is generated from it:
//   * Print   — a typed number of units.
//   * Milling — selected teeth (the teeth count is the unit count).

export const TEMPLATE_CODE_PRINT = 'PRINT';
export const TEMPLATE_CODE_MILLING = 'MILLING';

/** True for the Print or Milling templates (both unit-priced by material). */
export function isFabTemplate(code: string | undefined | null): boolean {
  return code === TEMPLATE_CODE_PRINT || code === TEMPLATE_CODE_MILLING;
}

// ── Print ──────────────────────────────────────────────────────────────────
export type PrintAnswers = { materialId: string; units: number | null; notes: string };

export const emptyPrintAnswers: PrintAnswers = { materialId: '', units: null, notes: '' };

export function coercePrintAnswers(raw: unknown): PrintAnswers {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    materialId: typeof r.materialId === 'string' ? r.materialId : '',
    units: typeof r.units === 'number' && Number.isFinite(r.units) ? r.units : null,
    notes: typeof r.notes === 'string' ? r.notes : '',
  };
}

export type PrintErrors = Partial<{ materialId: string; units: string }>;

export function validatePrint(a: PrintAnswers): PrintErrors {
  const e: PrintErrors = {};
  const req = 'Please fill out the required fields.';
  if (!a.materialId) e.materialId = req;
  if (a.units == null || a.units <= 0) e.units = req;
  return e;
}

// ── Milling ────────────────────────────────────────────────────────────────
export type MillingAnswers = { materialId: string; teeth: number[]; notes: string };

export const emptyMillingAnswers: MillingAnswers = { materialId: '', teeth: [], notes: '' };

export function coerceMillingAnswers(raw: unknown): MillingAnswers {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const teeth = Array.isArray(r.teeth)
    ? (r.teeth as unknown[]).filter(
        (n): n is number => typeof n === 'number' && n >= 1 && n <= 32,
      )
    : [];
  return {
    materialId: typeof r.materialId === 'string' ? r.materialId : '',
    teeth,
    notes: typeof r.notes === 'string' ? r.notes : '',
  };
}

export type MillingErrors = Partial<{ materialId: string; teeth: string }>;

export function validateMilling(a: MillingAnswers): MillingErrors {
  const e: MillingErrors = {};
  const req = 'Please fill out the required fields.';
  if (!a.materialId) e.materialId = req;
  if (!a.teeth.length) e.teeth = req;
  return e;
}
