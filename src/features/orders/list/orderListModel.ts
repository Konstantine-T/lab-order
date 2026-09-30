import dayjs from 'dayjs';
import type { OrderRow, OrderStatus } from '@/types/database';
import { byDueDate, dueDateOf } from '@/features/orders/orderDates';
import { pipelineIndex } from '@/features/orders/pipeline';

/**
 * Everything the doctor's and the clinic's order lists decide about a row:
 * which group it lands in, which quick filters it matches, what it costs.
 *
 * Pure functions over the row the two pages select (`LIST_ORDER_SELECT`), so
 * both pages — and a fixture preview — group and count the same way.
 */

/** One embedded clarification — enough to tell an open ask from a closed one,
 *  and to quote the open question on the card. */
export type ListClarification = {
  question: string;
  asked_at: string;
  needs_edit: boolean;
  answered_at: string | null;
  resolved_by_edit_at: string | null;
};

export type ListOrderRow = Pick<
  OrderRow,
  | 'id'
  | 'order_code'
  | 'doctor_id'
  | 'lab_id'
  | 'patient_id'
  | 'status'
  | 'payment_status'
  | 'generated_total'
  | 'final_total'
  | 'requested_due_date'
  | 'confirmed_due_date'
  | 'requested_due_time'
  | 'confirmed_due_time'
  | 'created_at'
  | 'completed_at'
  | 'cancelled_at'
  | 'has_unreviewed_edits'
  | 'continues_order_id'
> & {
  /** `service_snapshot->>name` — the service as it was when the order was sent. */
  service_name: string | null;
  /** `lab_snapshot->>public_name` — likewise for the lab. */
  lab_name: string | null;
  /** `doctor_snapshot` — who the order was placed for (the clinic list names them). */
  doctor_snapshot: { first_name?: string; last_name?: string } | null;
  patients: { first_name: string; last_name: string } | null;
  // The live joins stay as fallbacks for a snapshot written before the column
  // carried a name.
  labs: { public_name: string } | null;
  lab_services: { name: string } | null;
  order_clarifications: ListClarification[];
};

/**
 * The columns both lists read. JSON paths rather than whole snapshots: the lab
 * snapshot is the full `labs` row, and a list of hundreds only needs its name.
 */
export const LIST_ORDER_SELECT =
  'id, order_code, doctor_id, lab_id, patient_id, status, payment_status, generated_total, final_total, ' +
  'requested_due_date, confirmed_due_date, requested_due_time, confirmed_due_time, created_at, completed_at, cancelled_at, ' +
  'has_unreviewed_edits, continues_order_id, ' +
  'service_name:service_snapshot->>name, lab_name:lab_snapshot->>public_name, doctor_snapshot, ' +
  'patients(first_name, last_name), labs(public_name), lab_services(name), ' +
  'order_clarifications(question, asked_at, needs_edit, answered_at, resolved_by_edit_at)';

// ===== Names =================================================================

export const serviceNameOf = (row: ListOrderRow) =>
  row.service_name || row.lab_services?.name || '';

export const labNameOf = (row: ListOrderRow) => row.lab_name || row.labs?.public_name || '';

export const patientFullName = (row: ListOrderRow) =>
  row.patients ? `${row.patients.first_name} ${row.patients.last_name}`.trim() : '';

/** "გიორგი ა." — the mockups' short patient name: first name, last initial. */
export function shortName(first: string | undefined, last: string | undefined): string {
  const f = (first ?? '').trim();
  const l = (last ?? '').trim();
  if (!f) return l;
  return l ? `${f} ${l[0]}.` : f;
}

export const patientShortName = (row: ListOrderRow) =>
  row.patients ? shortName(row.patients.first_name, row.patients.last_name) : '';

// ===== Waiting on the doctor =================================================

/**
 * Statuses where the case is waiting on the doctor, not on the lab — the list's
 * "needs action" set, unchanged by the redesign.
 *
 * RECEIVED_BY_CLINIC is here because closing a case is the doctor's call
 * (0022): the work is sitting at the clinic and nothing moves until the doctor
 * confirms it seated. NEEDS_DOCTOR_INPUT is the most action-needing state there
 * is — the lab is blocked until the doctor changes something.
 */
const NEEDS_ACTION: readonly OrderStatus[] = [
  'NEEDS_CLARIFICATION',
  'NEEDS_DOCTOR_INPUT',
  'TRY_IN_PHASE',
  'RECEIVED_BY_CLINIC',
];

const isOpenAsk = (c: ListClarification) =>
  // An edit request closed by a save leaves `answered_at` null forever, so
  // checking it alone keeps the order flagged as needing attention.
  c.answered_at === null && c.resolved_by_edit_at === null;

/**
 * Is a NEEDS_CLARIFICATION order still waiting on the doctor?
 *
 * An order with no clarification rows at all predates the feature (0029), so
 * it keeps the old behaviour and counts.
 */
export const awaitsDoctorAnswer = (row: ListOrderRow) =>
  row.order_clarifications.length === 0 || row.order_clarifications.some(isOpenAsk);

/** Is the ball in the doctor's court? */
export function needsDoctor(row: ListOrderRow): boolean {
  if (row.status === 'NEEDS_CLARIFICATION') return awaitsDoctorAnswer(row);
  return NEEDS_ACTION.includes(row.status);
}

/**
 * The lab's still-open question (or change request note), newest first — the
 * text the card quotes. Only while the order is actually waiting on it: an ask
 * left open under a status the lab has since moved past is history, not a
 * question.
 */
export function openQuestion(row: ListOrderRow): string | undefined {
  if (row.status !== 'NEEDS_CLARIFICATION' && row.status !== 'NEEDS_DOCTOR_INPUT') return undefined;
  const open = row.order_clarifications
    .filter(isOpenAsk)
    .sort((a, b) => (a.asked_at < b.asked_at ? 1 : -1))[0];
  return open?.question?.trim() || undefined;
}

// ===== Groups ================================================================

export type OrderGroupKey =
  | 'needsYou'
  | 'sent'
  | 'inProgress'
  | 'ready'
  | 'delivered'
  | 'completed'
  | 'cancelled';

/** Top to bottom, the order the list stacks its groups in. */
export const GROUP_ORDER: readonly OrderGroupKey[] = [
  'needsYou',
  'sent',
  'inProgress',
  'ready',
  'delivered',
  'completed',
  'cancelled',
];

/**
 * The one group an order belongs to.
 *
 * Waiting-on-the-doctor wins over the pipeline stage, so an order can never sit
 * in two groups. Everything else follows `pipelineIndex`:
 *
 *   SUBMITTED                                   → sent
 *   RECEIVED, answered clarification, IN_PROGRESS → inProgress
 *   READY_FOR_DELIVERY                          → ready
 *   SENT_TO_CLINIC                              → delivered
 *   COMPLETED / CANCELLED                       → their own groups
 *
 * TRY_IN_PHASE and RECEIVED_BY_CLINIC are always in `needsYou` (see
 * NEEDS_ACTION), so the fallbacks below only matter for a status added later.
 */
export function groupOf(row: ListOrderRow): OrderGroupKey {
  if (row.status === 'CANCELLED') return 'cancelled';
  if (row.status === 'COMPLETED') return 'completed';
  if (needsDoctor(row)) return 'needsYou';
  const stage = pipelineIndex(row.status) ?? 0;
  if (stage === 0) return 'sent';
  if (stage <= 2) return 'inProgress';
  if (stage === 3) return 'ready';
  return 'delivered';
}

/** The archive groups: newest first rather than soonest-due. */
const newestFirst = (at: (r: ListOrderRow) => string | null) => (a: ListOrderRow, b: ListOrderRow) => {
  const x = at(a) ?? a.created_at;
  const y = at(b) ?? b.created_at;
  return x === y ? 0 : x > y ? -1 : 1;
};

/**
 * Rows split into groups, each sorted for how it is read: live work by the
 * soonest deadline (it is a work queue), finished and cancelled work by the
 * newest first (it is an archive).
 */
export function groupRows(rows: ListOrderRow[]): Map<OrderGroupKey, ListOrderRow[]> {
  const groups = new Map<OrderGroupKey, ListOrderRow[]>(GROUP_ORDER.map((g) => [g, []]));
  for (const row of rows) groups.get(groupOf(row))!.push(row);
  for (const [key, list] of groups) {
    if (key === 'completed') list.sort(newestFirst((r) => r.completed_at));
    else if (key === 'cancelled') list.sort(newestFirst((r) => r.cancelled_at));
    else list.sort(byDueDate);
  }
  return groups;
}

// ===== Quick filters =========================================================

export type QuickFilter = 'all' | 'dueThisWeek' | 'needsAnswer' | 'unpaid' | 'ready';

export const QUICK_FILTERS: readonly QuickFilter[] = [
  'all',
  'dueThisWeek',
  'needsAnswer',
  'unpaid',
  'ready',
];

const isLive = (row: ListOrderRow) => row.status !== 'COMPLETED' && row.status !== 'CANCELLED';

/** Monday and Sunday of the week `now` falls in, as `YYYY-MM-DD`. Monday-first
 *  in every language: the week a Georgian clinic works in, whatever dayjs's
 *  English locale thinks. */
export function currentWeek(now: dayjs.Dayjs = dayjs()) {
  const monday = now.startOf('day').subtract((now.day() + 6) % 7, 'day');
  return { start: monday.format('YYYY-MM-DD'), end: monday.add(6, 'day').format('YYYY-MM-DD') };
}

/**
 * "Due this week": the case's due date — the lab's confirmed date once it
 * exists, else the date the doctor asked for (`dueDateOf`) — falls between this
 * Monday and this Sunday inclusive, and the case is neither completed nor
 * cancelled. An order overdue from an earlier week is not "due this week"; the
 * card's own overdue marker covers it.
 */
export function isDueThisWeek(row: ListOrderRow, week = currentWeek()): boolean {
  const due = dueDateOf(row);
  return isLive(row) && due != null && due >= week.start && due <= week.end;
}

/**
 * "Unpaid", as the lab's receivables define it (`_lab_receivables_rows`, 0028):
 * the order is not cancelled, the lab has set its final bill, and
 * `payment_status` (kept by `record_payment`) is not PAID — partly paid still
 * owes money. An estimate alone is not a bill, so it is not a debt yet.
 */
export const isUnpaid = (row: ListOrderRow) =>
  row.status !== 'CANCELLED' && row.final_total != null && row.payment_status !== 'PAID';

/** "Ready for pickup" — the phone's aqua tile. */
export const isReady = (row: ListOrderRow) => row.status === 'READY_FOR_DELIVERY';

export function matchesQuick(row: ListOrderRow, quick: QuickFilter, week = currentWeek()): boolean {
  switch (quick) {
    case 'dueThisWeek':
      return isDueThisWeek(row, week);
    case 'needsAnswer':
      return needsDoctor(row);
    case 'unpaid':
      return isUnpaid(row);
    case 'ready':
      return isReady(row);
    default:
      return true;
  }
}

/** The "N active" in the page subtitle. */
export const activeCount = (rows: ListOrderRow[]) => rows.filter(isLive).length;

// ===== Money =================================================================

export type ListPrice = {
  amount: number;
  /** `final` is the lab's own figure; `estimate` is the doctor-facing one. */
  kind: 'final' | 'estimate';
  /** The estimate, when the lab settled below it — drawn struck through. */
  was?: number;
};

/**
 * What the card shows as the price, or nothing.
 *
 * The lab's `final_total` wins whenever it is set, even at 0 — a free remake
 * is a real price. Without it, the estimate: `generated_total` is null for a
 * LAB_DESCRIBED or NO_PRICING service (the wizard only sends a CALCULATED
 * total), and an estimate of 0 is what older clients stored for those, so it is
 * treated as unknown too. A card must never state a confident 0 ₾ for work the
 * lab has not priced.
 */
export function priceOf(row: ListOrderRow): ListPrice | null {
  if (row.final_total != null) {
    const was =
      row.generated_total != null && row.final_total < row.generated_total
        ? row.generated_total
        : undefined;
    return { amount: row.final_total, kind: 'final', was };
  }
  if (row.generated_total != null && row.generated_total > 0) {
    return { amount: row.generated_total, kind: 'estimate' };
  }
  return null;
}

// ===== Filter options ========================================================

export type FilterOption = { value: string; label: string };

/** Distinct values across the loaded rows, alphabetical — the Lab / Patient
 *  dropdowns list only what the doctor actually has orders with. */
export function optionsFrom(
  rows: ListOrderRow[],
  pick: (row: ListOrderRow) => { value: string | null | undefined; label: string },
): FilterOption[] {
  const seen = new Map<string, string>();
  for (const row of rows) {
    const { value, label } = pick(row);
    if (value && label && !seen.has(value)) seen.set(value, label);
  }
  return [...seen]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
