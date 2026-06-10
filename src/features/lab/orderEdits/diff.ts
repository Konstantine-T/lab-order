import type { OrderEditSnapshot, OrderRow } from '@/types/database';

// Normalized view of an order's editable fields. We diff two of these — a
// "before" (older) and an "after" (newer) — to decide what the edit changed.
// Patient is intentionally absent: it's doctor-only PII and must never surface
// on the lab side, which is the only consumer of this diff.
export type EditState = {
  workLocationDisplay: string;
  invoiceRecipientType: string;
  answers: Record<string, unknown>;
};

// Which discrete fields differ between before/after. The dental answers are
// treated as one block (whole-block diff).
export type EditDiff = {
  workLocation: boolean;
  invoiceRecipient: boolean;
  answers: boolean;
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

export function stateFromSnapshot(s: OrderEditSnapshot): EditState {
  return {
    workLocationDisplay: workLocationDisplay(s.work_location_snapshot),
    invoiceRecipientType: s.invoice_recipient_type,
    answers: s.answers ?? {},
  };
}

// Live state = current order + answers.
export function stateFromLive(
  order: OrderRow,
  answersMap: Record<string, unknown>,
): EditState {
  return {
    workLocationDisplay: workLocationDisplay(order.work_location_snapshot),
    invoiceRecipientType: order.invoice_recipient_type,
    answers: answersMap,
  };
}

export function diffStates(before: EditState, after: EditState): EditDiff {
  return {
    workLocation: before.workLocationDisplay !== after.workLocationDisplay,
    invoiceRecipient: before.invoiceRecipientType !== after.invoiceRecipientType,
    answers: !valuesEqual(before.answers, after.answers),
  };
}
