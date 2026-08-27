/**
 * Patient-name normalization, client side.
 *
 * INVARIANT: this must produce the same string the SQL side compares on —
 * `public.patient_name_tidy` in migration 0020 (trim + collapse internal runs
 * of whitespace, case preserved). If the two ever disagree, the wizard's match
 * dialog and the server's insert-guard disagree too, and duplicate patients
 * come back. That drift is exactly what this ticket fixed.
 *
 * Case is deliberately NOT folded here: SQL lowercases only for comparison
 * (`patient_name_key`), while what we store and display keeps the doctor's
 * capitalisation.
 */
export function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

/** The patient payload as the RPCs want it: names normalized, everything else
 *  untouched. Used for both `submit_order` and `edit_order`. */
export function normalizePatientPayload<
  T extends { first_name: string; last_name: string },
>(patient: T): T {
  return {
    ...patient,
    first_name: normalizeName(patient.first_name),
    last_name: normalizeName(patient.last_name),
  };
}
