import type { TFunction } from 'i18next';
import type { LabRow } from '@/types/database';
import type { WizardState } from '@/features/doctor/orderCreate/types';
import { normalizePatientPayload } from '@/features/doctor/orderCreate/patientName';

/** `orders.patient_reference`'s CHECK (0048). */
export const PATIENT_REFERENCE_MAX = 200;

/**
 * The `p_patient` a buying lab sends to submit_order / edit_order (0048).
 *
 * No patient: both names blank, which the RPCs read as "no patient". The
 * reference rides along either way, trimmed; the server stores a blank one
 * as null and refuses nothing over 200 characters, which the field caps.
 */
export function buyerPatientPayload(
  state: Pick<WizardState, 'patient' | 'with_patient' | 'patient_reference'>,
) {
  const reference = (state.patient_reference ?? '').trim().slice(0, PATIENT_REFERENCE_MAX) || null;
  if (!state.with_patient) return { first_name: '', last_name: '', reference };
  return { ...normalizePatientPayload(state.patient), reference };
}

const join = (...parts: (string | null | undefined)[]) =>
  parts
    .map((p) => (p ?? '').trim())
    .filter(Boolean)
    .join(', ');

/** "Rustaveli Ave 12, Tbilisi": where a purchase is delivered (the lab's working address). */
export function labDeliveryLine(lab: Pick<LabRow, 'working_address' | 'city'>): string {
  return join(lab.working_address, lab.city);
}

/**
 * "Dent Lab LLC, ID 404123456": who a purchase is invoiced to. `t` is the
 * `doctor` namespace's (the code's abbreviation differs per language: ს/კ in
 * Georgian).
 */
export function invoiceLine(
  name: string | null | undefined,
  code: string | null | undefined,
  t: TFunction,
): string {
  return join(name, code?.trim() ? t('labBuyer.idCode', { code: code.trim() }) : null);
}

/** The buying lab's own invoice line, from its profile, before an order exists. */
export function labInvoiceLine(
  lab: Pick<LabRow, 'legal_name' | 'public_name' | 'identification_code'>,
  t: TFunction,
): string {
  return invoiceLine(lab.legal_name?.trim() || lab.public_name, lab.identification_code, t);
}

/** The delivery line an order was placed with, from its snapshot. */
export function snapshotDeliveryLine(snapshot: unknown): string {
  const s = (snapshot ?? {}) as { address?: string | null; city?: string | null };
  return join(s.address, s.city);
}

/** The invoice line an order was placed with, from its snapshot. */
export function snapshotInvoiceLine(snapshot: unknown, t: TFunction): string {
  const s = (snapshot ?? {}) as { name?: string | null; identification_code?: string | null };
  return invoiceLine(s.name, s.identification_code, t);
}
