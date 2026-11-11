import type { OrderGroupKey } from './orderListModel';

export type GroupKey = OrderGroupKey | 'drafts';

/**
 * How many orders a group shows before "N more", in the card grid
 * (OrderGroupSection) and the list (GroupedOrderTable) alike, so the two
 * views show the same orders. The waiting-on-you group is never cut — every
 * card in it is something to do. Live stages show two rows of the desktop
 * grid; the archive groups only their newest few.
 */
export const INITIAL: Record<GroupKey, number> = {
  drafts: Infinity,
  needsYou: Infinity,
  sent: 6,
  inProgress: 6,
  ready: 6,
  delivered: 6,
  completed: 3,
  cancelled: 3,
};

/** Each "N more" reveals at most this many — the list's paging. */
export const STEP = 12;
