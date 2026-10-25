import dayjs from 'dayjs';
import type { OrderStatus } from '@/types/database';
import { dueDateOf, type DatedOrder } from '@/features/orders/orderDates';

/**
 * The doctor home's squares, defined once for the square and the list.
 *
 * Each square is the orders list's own status / due-date filter
 * (`matchesStatusDue`, which `useOrderListFilters` filters with), so the number
 * on the square is the number of rows the click lands on. Same idea as the
 * lab's `orderPresets`.
 */

/** Statuses where the case is live — neither completed nor cancelled. */
export const DOCTOR_OPEN_STATUSES: readonly OrderStatus[] = [
  'SUBMITTED',
  'RECEIVED',
  'NEEDS_CLARIFICATION',
  'NEEDS_DOCTOR_INPUT',
  'IN_PROGRESS',
  'TRY_IN_PHASE',
  'READY_FOR_DELIVERY',
  'SENT_TO_CLINIC',
  'RECEIVED_BY_CLINIC',
];

/** The orders list's status and due-date filter, dates as `YYYY-MM-DD`. */
export type StatusDueFilter = {
  statuses: readonly OrderStatus[];
  from: string | null;
  to: string | null;
};

/** The list's filtering on those three — `useOrderListFilters` calls this. */
export function matchesStatusDue(
  row: DatedOrder & { status: OrderStatus },
  f: StatusDueFilter,
): boolean {
  if (f.statuses.length > 0 && !f.statuses.includes(row.status)) return false;
  if (f.from || f.to) {
    const due = dueDateOf(row);
    if (due == null) return false;
    if (f.from && due < f.from) return false;
    if (f.to && due > f.to) return false;
  }
  return true;
}

export const HOME_PRESETS = ['submitted', 'open', 'dueThisWeek'] as const;
export type HomePreset = (typeof HOME_PRESETS)[number];

export const isHomePreset = (v: unknown): v is HomePreset =>
  typeof v === 'string' && (HOME_PRESETS as readonly string[]).includes(v);

/**
 * What the list applies for a square. "Due this week" has no lower bound: the
 * square has always counted overdue open cases too (anything due before a week
 * from today), and the list's range stays identical to it. It is not the
 * list's own "due this week" quick filter, which means Monday to Sunday.
 */
export function homePresetFilter(preset: HomePreset, now: dayjs.Dayjs = dayjs()): StatusDueFilter {
  switch (preset) {
    case 'submitted':
      return { statuses: ['SUBMITTED'], from: null, to: null };
    case 'open':
      return { statuses: DOCTOR_OPEN_STATUSES, from: null, to: null };
    case 'dueThisWeek':
      return {
        statuses: DOCTOR_OPEN_STATUSES,
        from: null,
        to: now.startOf('day').add(7, 'day').format('YYYY-MM-DD'),
      };
  }
}

export const matchesHomePreset = (
  row: DatedOrder & { status: OrderStatus },
  preset: HomePreset,
  now: dayjs.Dayjs = dayjs(),
) => matchesStatusDue(row, homePresetFilter(preset, now));
