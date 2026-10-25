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

/** The column a row needs to be told apart. Required, so a list that forgets
 *  to select it fails to type-check instead of reading every order as a
 *  doctor's. */
export type CustomerSource = {
  buyer_lab_id: string | null;
};

/**
 * Placed by another lab. Only `buyer_lab_id` answers this: submit_order
 * stamps it and no client can change it. `doctor_snapshot.is_lab` says the
 * same today, but a snapshot is the order's history, not its authority, and
 * nothing here should trust it for "who is this customer" (0048 review).
 */
export function isLabPurchase(row: CustomerSource): boolean {
  return row.buyer_lab_id != null;
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
