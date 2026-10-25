import dayjs from 'dayjs';
import type { OrderStatus } from '@/types/database';
import { dueDateOf, type DatedOrder } from '@/features/orders/orderDates';

/**
 * What a number on the lab's screens means, defined once.
 *
 * The lab dashboard counts orders and the orders page filters them, and the
 * rule between the two is that the rows a click lands on are the rows the
 * number counted. They used to agree by coincidence: each page wrote its own
 * filters, and "Overdue" opened a date range with no status filter, so
 * completed and cancelled orders from the past were listed under a count that
 * had excluded them.
 *
 * So a preset is not a predicate written beside a filter. It is the filter
 * itself (`presetFilter`), and the dashboard counts by running the list's own
 * filtering (`matchesQueueFilter`) over its rows — the two cannot disagree
 * without the list disagreeing with itself.
 */

/** The statuses the orders page's status filter offers. */
export const FILTERABLE_STATUSES: readonly OrderStatus[] = [
  'SUBMITTED',
  'RECEIVED',
  'NEEDS_CLARIFICATION',
  'NEEDS_DOCTOR_INPUT',
  'IN_PROGRESS',
  'READY_FOR_DELIVERY',
  'SENT_TO_CLINIC',
  // Reachable again through reopen_order. Without it a reopened order due this
  // week is counted by the tile and hidden by the filter the tile applies.
  // TRY_IN_PHASE stays out: nothing can set it yet (phases.md, Phase 11), so it
  // would be an option that never matches.
  'RECEIVED_BY_CLINIC',
  'COMPLETED',
  'CANCELLED',
] as const;

/** A case the lab no longer works on. */
export const CLOSED_STATUSES = ['COMPLETED', 'CANCELLED'] as const satisfies readonly OrderStatus[];

/** Everything a lab can still act on, as the status filter can express it. */
export const OPEN_STATUSES: readonly OrderStatus[] = FILTERABLE_STATUSES.filter(
  (s) => !(CLOSED_STATUSES as readonly OrderStatus[]).includes(s),
);

/** The mockup's quick filters across the top of the queue. */
export const QUEUE_QUICK = [
  'all',
  'new',
  'inProgress',
  'clarification',
  'ready',
  'edited',
  'completed',
] as const;
export type QueueQuick = (typeof QUEUE_QUICK)[number];

/** The columns a preset reads — every queue and dashboard row carries them. */
export type PresetRow = DatedOrder & {
  status: OrderStatus;
  final_total: number | null;
  has_unreviewed_edits?: boolean | null;
};

export function matchesQueueQuick(row: PresetRow, quick: QueueQuick): boolean {
  switch (quick) {
    case 'all':
      return true;
    case 'new':
      return row.status === 'SUBMITTED';
    case 'inProgress':
      return ['IN_PROGRESS', 'RECEIVED', 'TRY_IN_PHASE'].includes(row.status);
    case 'clarification':
      // Both asks: an order parked waiting on the doctor is the same "we
      // cannot proceed" for the lab either way.
      return row.status === 'NEEDS_CLARIFICATION' || row.status === 'NEEDS_DOCTOR_INPUT';
    case 'ready':
      return ['READY_FOR_DELIVERY', 'SENT_TO_CLINIC', 'RECEIVED_BY_CLINIC'].includes(row.status);
    case 'edited':
      return !!row.has_unreviewed_edits;
    case 'completed':
      return row.status === 'COMPLETED';
  }
}

/** The dates every preset measures from, as `YYYY-MM-DD`. One helper, so
 *  "this week" is today to today + 7 on both pages. */
export function queueDates(now: dayjs.Dayjs = dayjs()) {
  const day = now.startOf('day');
  return {
    today: day.format('YYYY-MM-DD'),
    yesterday: day.subtract(1, 'day').format('YYYY-MM-DD'),
    dayPlus2: day.add(2, 'day').format('YYYY-MM-DD'),
    weekEnd: day.add(7, 'day').format('YYYY-MM-DD'),
  };
}
export type QueueDates = ReturnType<typeof queueDates>;

/**
 * The part of the orders page's filter state a preset can set. Search, doctor
 * and destination are not here: a preset clears them.
 */
export type QueueFilter = {
  quick: QueueQuick;
  statuses: readonly OrderStatus[];
  /** Due date bounds, inclusive, `YYYY-MM-DD`. */
  dateFrom: string | null;
  dateTo: string | null;
  /** Preset-only: shown as a removable chip, not a quick pill. */
  noFinalPrice: boolean;
};

export const EMPTY_QUEUE_FILTER: QueueFilter = {
  quick: 'all',
  statuses: [],
  dateFrom: null,
  dateTo: null,
  noFinalPrice: false,
};

/** The orders page's own filtering of those parts — the page calls this. */
export function matchesQueueFilter(row: PresetRow, f: QueueFilter): boolean {
  if (!matchesQueueQuick(row, f.quick)) return false;
  if (f.statuses.length > 0 && !f.statuses.includes(row.status)) return false;
  if (f.dateFrom || f.dateTo) {
    const due = dueDateOf(row);
    if (due == null) return false;
    if (f.dateFrom && due < f.dateFrom) return false;
    if (f.dateTo && due > f.dateTo) return false;
  }
  if (f.noFinalPrice && row.final_total != null) return false;
  return true;
}

export const ORDER_PRESETS = [
  'new',
  'inProgress',
  'clarification',
  'dueThisWeek',
  'overdue',
  'dueSoon',
  'noFinalPrice',
] as const;
export type OrderPreset = (typeof ORDER_PRESETS)[number];

export const isOrderPreset = (v: unknown): v is OrderPreset =>
  typeof v === 'string' && (ORDER_PRESETS as readonly string[]).includes(v);

/**
 * What the orders page shows for a preset. `advancedOpen` expands the panel
 * that holds the status and date filters, so a preset that sets them is
 * visibly applied rather than hidden behind "More filters".
 *
 * Every date preset also filters to the open statuses: the dates alone would
 * take in completed and cancelled orders the count never included.
 */
export function presetFilter(
  preset: OrderPreset,
  d: QueueDates = queueDates(),
): QueueFilter & { advancedOpen: boolean } {
  const base = { ...EMPTY_QUEUE_FILTER, advancedOpen: false };
  switch (preset) {
    case 'new':
    case 'inProgress':
    case 'clarification':
      return { ...base, quick: preset };
    case 'dueThisWeek':
      return { ...base, statuses: OPEN_STATUSES, dateFrom: d.today, dateTo: d.weekEnd, advancedOpen: true };
    case 'overdue':
      return { ...base, statuses: OPEN_STATUSES, dateTo: d.yesterday, advancedOpen: true };
    case 'dueSoon':
      return { ...base, statuses: OPEN_STATUSES, dateFrom: d.today, dateTo: d.dayPlus2, advancedOpen: true };
    case 'noFinalPrice':
      return { ...base, statuses: OPEN_STATUSES, noFinalPrice: true, advancedOpen: true };
  }
}

/** Does this order count towards the preset's number? */
export const matchesPreset = (row: PresetRow, preset: OrderPreset, d: QueueDates = queueDates()) =>
  matchesQueueFilter(row, presetFilter(preset, d));

/** The router state a dashboard link hands the orders page. */
export type QueuePresetState = { preset: OrderPreset };
