/**
 * Who ordered, from the selling lab's side (0048, hc61AYfA).
 *
 * A lab can buy from another lab through a hidden doctor-style "buying
 * profile", so on the seller's screens the customer is either a doctor or a
 * laboratory. `doctor_snapshot` already carries the buying lab's name for a
 * purchase, so every name on these screens reads right without a branch; what
 * the helpers here add is telling the two apart (the badge, the filter, the
 * sheet's "Laboratory" cell) and the patient-less purchase.
 */

/** The columns a row needs to be told apart. Both optional, so a list that
 *  selects only one of them still type-checks. */
export type CustomerSource = {
  buyer_lab_id?: string | null;
  doctor_snapshot?: { is_lab?: boolean } | null;
};

/**
 * Placed by another lab. `buyer_lab_id` is stamped by submit_order and frozen,
 * so it is the answer; the snapshot flag is the fallback for a row whose
 * column was not selected.
 */
export function isLabPurchase(row: CustomerSource): boolean {
  return row.buyer_lab_id != null || row.doctor_snapshot?.is_lab === true;
}

/** The lab orders list's "Customer" filter. */
export type CustomerKind = 'all' | 'doctors' | 'labs';
export const CUSTOMER_KINDS: readonly CustomerKind[] = ['all', 'doctors', 'labs'];

export function matchesCustomerKind(row: CustomerSource, kind: CustomerKind): boolean {
  if (kind === 'all') return true;
  return isLabPurchase(row) === (kind === 'labs');
}

type PatientSource = {
  patients?: { first_name?: string | null; last_name?: string | null } | null;
  patient_reference?: string | null;
};

/**
 * The patient column on the lab's lists: the patient's name, else the buying
 * lab's free-text case reference (a purchase may have no patient), else "—".
 */
export function patientLabel(row: PatientSource): string {
  const name = [row.patients?.first_name?.trim(), row.patients?.last_name?.trim()]
    .filter(Boolean)
    .join(' ');
  return name || row.patient_reference?.trim() || '—';
}

const text = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : null;

/**
 * The buying lab's legal name and identification code, for the sheet. Read
 * from the order's own snapshots (frozen at submit), never the live lab row:
 * the doctor snapshot first, then the invoice recipient, which carries the
 * same LLC on every purchase (the recipient is always the buying lab).
 */
export function labCustomerIdentity(order: {
  doctor_snapshot?: { legal_name?: string | null; identification_code?: string | null } | null;
  invoice_recipient_snapshot?: Record<string, unknown> | null;
}): { legalName: string | null; code: string | null } {
  const ds = order.doctor_snapshot ?? {};
  const inv = order.invoice_recipient_snapshot ?? {};
  return {
    legalName: text(ds.legal_name) ?? text(inv.name),
    code: text(ds.identification_code) ?? text(inv.identification_code),
  };
}
