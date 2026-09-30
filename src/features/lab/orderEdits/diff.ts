import type { OrderEditSnapshot, OrderRow } from '@/types/database';

/**
 * Who the order is for, at one point in its edit history.
 *
 * `name` is null when the patient row could not be read (an embed that came
 * back empty, or a snapshot taken before the row existed). That is "unknown",
 * not "no name", and the diff must not read it as a change.
 */
export type EditPatient = {
  id: string | null;
  name: string | null;
  dateOfBirth: string | null;
};

// Normalized view of an order's editable fields. We diff two of these — a
// "before" (older) and an "after" (newer) — to decide what the edit changed.
export type EditState = {
  /** null when this side carries no patient at all. */
  patient: EditPatient | null;
  workLocationDisplay: string;
  invoiceRecipientType: string;
  answers: Record<string, unknown>;
};

// Which discrete fields differ between before/after. The dental answers are
// treated as one block (whole-block diff).
export type EditDiff = {
  patient: boolean;
  workLocation: boolean;
  invoiceRecipient: boolean;
  answers: boolean;
};

/**
 * The `patient` object edit_order writes into every snapshot (0009 onwards,
 * 0031 at runtime; OrderEditSnapshot.patient). Read field by field as unknown,
 * since snapshot_json is whatever the RPC stored at the time.
 */
type SnapshotPatient = {
  id?: unknown;
  first_name?: unknown;
  last_name?: unknown;
  date_of_birth?: unknown;
};

/** The `patients(first_name, last_name, date_of_birth)` embed on a live order. */
export type LivePatientEmbed = {
  first_name: string | null;
  last_name: string | null;
  date_of_birth: string | null;
};

// Stable stringify (sorted keys) so answer maps compare equal regardless of
// key order coming back from Postgres vs. the client.
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

export function deepEqual(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

// Single comparator shared by the section-level answers diff (here) and the
// per-question diff in OrderAnswersDiff, so the two can never disagree about
// whether a value changed.
export function valuesEqual(a: unknown, b: unknown): boolean {
  return deepEqual(a, b);
}

function workLocationDisplay(snap: Record<string, unknown> | null | undefined): string {
  if (!snap) return '';
  const clinic = (snap.clinic_name as string) ?? '';
  const branch = (snap.branch_name as string) ?? '';
  const city = (snap.city as string) ?? '';
  return [clinic, branch].filter(Boolean).join(' · ') + (city ? ` — ${city}` : '');
}

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : null;

/** "First Last", the way the lab's order lists print it. */
export function patientFullName(
  first: string | null | undefined,
  last: string | null | undefined,
): string {
  return [first?.trim(), last?.trim()].filter(Boolean).join(' ');
}

/** Name plus date of birth, so two same-named patients read differently. */
export function patientDisplay(p: EditPatient | null): string {
  if (!p || p.name === null) return '';
  return p.dateOfBirth ? `${p.name} · ${p.dateOfBirth}` : p.name;
}

function patientFromSnapshot(raw: unknown): EditPatient | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as SnapshotPatient;
  const first = str(p.first_name);
  const last = str(p.last_name);
  return {
    id: str(p.id),
    name: first || last ? patientFullName(first, last) : null,
    dateOfBirth: str(p.date_of_birth),
  };
}

export function stateFromSnapshot(s: OrderEditSnapshot): EditState {
  return {
    patient: patientFromSnapshot(s.patient),
    workLocationDisplay: workLocationDisplay(s.work_location_snapshot),
    invoiceRecipientType: s.invoice_recipient_type,
    answers: s.answers ?? {},
  };
}

// Live state = current order + answers. The patient comes from the order's
// `patients(...)` embed; without one (not selected, or it came back null) the
// id is still known from the order itself, but the name is not.
export function stateFromLive(
  order: OrderRow & { patients?: LivePatientEmbed | null },
  answersMap: Record<string, unknown>,
): EditState {
  const embed = order.patients ?? null;
  const first = str(embed?.first_name);
  const last = str(embed?.last_name);
  return {
    patient: {
      id: order.patient_id ?? null,
      name: first || last ? patientFullName(first, last) : null,
      dateOfBirth: str(embed?.date_of_birth),
    },
    workLocationDisplay: workLocationDisplay(order.work_location_snapshot),
    invoiceRecipientType: order.invoice_recipient_type,
    answers: answersMap,
  };
}

/**
 * Did the edit put the order on a different patient?
 *
 * By id first: edit_order can reassign the order to another patient row, and
 * two patients may share a name (the force_new case in 0031), so name alone
 * would miss exactly the switch that matters. Then by name and date of birth.
 *
 * A side that could not be read never counts as a change, or a missing embed
 * would flag every edit as "patient changed".
 */
export function patientChanged(before: EditPatient | null, after: EditPatient | null): boolean {
  if (!before || !after) return false;
  if (before.id && after.id && before.id !== after.id) return true;
  if (before.name === null || after.name === null) return false;
  return before.name !== after.name || before.dateOfBirth !== after.dateOfBirth;
}

export function diffStates(before: EditState, after: EditState): EditDiff {
  return {
    patient: patientChanged(before.patient, after.patient),
    workLocation: before.workLocationDisplay !== after.workLocationDisplay,
    invoiceRecipient: before.invoiceRecipientType !== after.invoiceRecipientType,
    answers: !valuesEqual(before.answers, after.answers),
  };
}
