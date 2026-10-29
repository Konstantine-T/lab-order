import type { QueryClient, QueryKey } from '@tanstack/react-query';

/**
 * Which React Query keys a realtime row event makes stale.
 *
 * The one place this mapping lives (enumerated from `grep -rn queryKey src`):
 * pages never call `invalidateQueries` for live events themselves. A realtime
 * payload is used only to pick keys; it is never written into a cache (J2),
 * so a refetch under the viewer's own RLS is always what ends up on screen.
 *
 * Keys are prefixes. Invalidating `['lab-orders']` marks every lab-orders
 * query stale and refetches the ones on screen; keys nobody has loaded cost
 * nothing.
 *
 * Deliberately absent: the order wizard's `orderable-lab`, `orderable-service`
 * and `order-form-version`, and the `doctor-draft`. The wizard copies none of
 * them into its state, but a republished form would swap the questions under a
 * doctor halfway through typing; it keeps the version it opened with, as it
 * always has, and the server still accepts that version.
 */
export type LiveTable =
  | 'orders'
  | 'order_clarifications'
  | 'order_files'
  | 'labs'
  | 'lab_services'
  | 'lab_forms'
  | 'clinic_doctor_invites'
  | 'feedback'
  | 'lab_reviews'
  | 'lab_review_reports'
  | 'clinic_memberships'
  | 'order_status_history'
  | 'order_trash';

type Row = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

/**
 * The lab's projects (5XVmpHyN): the list (`lab_projects`, 0055), one
 * project's header and its orders. An order's insert or change moves all
 * three, and so does the lab trashing one (0054, order_trash): a project
 * counts only the orders not in the lab's trash. A restore deletes its row,
 * and realtime does not deliver DELETEs (RealtimeProvider), so the restoring
 * mutation invalidates these keys itself (through keysForTrashChange).
 */
const LAB_PROJECTS: QueryKey[] = [['lab-projects'], ['lab-project'], ['lab-project-orders']];

/** Everything an order change can move: lists, tiles, badges, finances. */
const ORDER_LISTS: QueryKey[] = [
  ['nav-alerts'],
  // lab
  ['lab-orders'],
  ['lab-dashboard-open'],
  ['lab-dashboard-unpaid'],
  ['lab-unreviewed-edits-count'],
  ['lab-edited-orders'],
  ['lab-receivables-list'],
  ['lab-receivables-by-customer'],
  ...LAB_PROJECTS,
  // doctor, and a lab's purchases from other labs (0048): the purchase pages
  // are the doctor's own, under the same keys scoped by the buying profile's
  // id (`['doctor-orders', id]`, `['order', id]`, `['nav-alerts', 'doctor', id]`),
  // so the lab's `doctor_id=eq.<buying profile>` listener refreshes them here.
  ['doctor-orders'],
  ['doctor-home-orders'],
  ['doctor-patient-orders'],
  // the patient list counts orders and gains a patient with a clinic-placed one
  ['doctor-patients'],
  // clinic
  ['clinic-orders'],
  ['clinic-order-count'],
  ['clinic-payables-list'],
  ['clinic-payables-by-doctor'],
  ['clinic-payable-labs'],
  // invoice chips on every list
  ['unacknowledged-invoices'],
  // a side's trash (0054) lists each order's status, and a reopen empties it
  ['order-trash'],
  ['order-trash-count'],
];

/**
 * What one side's trash change moves (0054): that side's order lists, counts
 * and badges (each excludes the side's `order_trash` rows), the trash itself,
 * and the order's own page (its banner). Never the other side's keys, never
 * finances: neither changes when a side hides an order.
 */
const TRASH_LISTS: Record<'LAB' | 'DOCTOR', QueryKey[]> = {
  LAB: [
    ['nav-alerts'],
    ['lab-orders'],
    ['lab-dashboard-open'],
    ['lab-unreviewed-edits-count'],
    ['lab-edited-orders'],
    ['unacknowledged-invoices'],
    // The projects screens (0055) leave out what the lab trashed too.
    ...LAB_PROJECTS,
  ],
  // Also a buying lab's purchase pages, under the same doctor keys.
  DOCTOR: [
    ['nav-alerts'],
    ['doctor-orders'],
    ['doctor-home-orders'],
    ['doctor-patient-orders'],
    ['doctor-patients'],
    ['patient-latest-order'],
    ['unacknowledged-invoices'],
  ],
};

export function keysForTrashChange(side: unknown, orderId: string | null): QueryKey[] {
  const lists =
    side === 'LAB' || side === 'DOCTOR'
      ? TRASH_LISTS[side]
      : [...TRASH_LISTS.LAB, ...TRASH_LISTS.DOCTOR];
  return [
    ...lists,
    ['order-trash'],
    ['order-trash-count'],
    ...(orderId
      ? [
          ['lab-order', orderId],
          ['order', orderId],
        ]
      : []),
  ];
}

/** One open order, on whichever role's page it is open. */
const orderPage = (orderId: string): QueryKey[] => [
  ['lab-order', orderId],
  ['order', orderId],
  ['clinic-order', orderId],
  // A doctor edit changes the answers and adds an edit row (wUHVk40U's note:
  // the lab sheet's history must follow orders.edit_count). The UPDATE payload
  // carries no old row to compare, so these follow every change of the order.
  ['order-edits', orderId],
  ['order-answers', orderId],
  ['clinic-order-answers', orderId],
  ['order-lineage', orderId],
];

const MARKETPLACE: QueryKey[] = [['marketplace-labs'], ['landing-labs']];

export function keysForRow(table: LiveTable, row: Row): QueryKey[] {
  switch (table) {
    case 'orders': {
      const id = str(row.id);
      return [...ORDER_LISTS, ...(id ? orderPage(id) : [])];
    }
    case 'order_clarifications': {
      const orderId = str(row.order_id);
      return [
        ['nav-alerts'],
        ['lab-orders'],
        ['doctor-orders'],
        ['doctor-home-orders'],
        ['clinic-orders'],
        ...(orderId ? [['order-clarifications', orderId], ...orderPage(orderId)] : []),
      ];
    }
    case 'order_files': {
      const orderId = str(row.order_id);
      return [
        ['nav-alerts'],
        ['unacknowledged-invoices'],
        ...(orderId
          ? [
              ['order-files', orderId],
              ['order-invoice', orderId],
              ['lab-order', orderId],
            ]
          : []),
      ];
    }
    case 'labs': {
      const id = str(row.id);
      return [
        ...MARKETPLACE,
        ['nav-alerts'],
        ['admin-labs'],
        ['admin-pending-labs-count'],
        ['admin-active-labs-count'],
        ...(id
          ? [
              ['public-lab', id],
              ['public-lab-services', id],
              ['admin-lab', id],
              ['lab-price-lists', id],
            ]
          : []),
      ];
    }
    case 'lab_services':
    case 'lab_forms': {
      const labId = str(row.lab_id);
      return [
        ...MARKETPLACE,
        ...(labId
          ? [
              ['public-lab-services', labId],
              ['lab-services-with-forms', labId],
            ]
          : []),
      ];
    }
    case 'clinic_doctor_invites':
      return [
        ['my-clinic-invites'],
        ['clinic-invites'],
        ['clinic-pending-invites'],
        // An accepted invite is how a doctor joins: the clinic's lists grow,
        // and the doctor's own "Clinic: …" changes (0049).
        ['clinic-doctors'],
        ['clinic-order-count'],
        ['my-clinic'],
      ];
    case 'clinic_memberships':
      // A doctor joined a clinic (0050). Leaving is a DELETE, which realtime
      // does not deliver; it shows on the next fetch, and the clinic hears of
      // it through its doctor_left notification.
      return [['my-clinic'], ['clinic-doctors'], ['acting-doctor'], ['clinic-order-count']];
    case 'order_status_history': {
      // The history dialog (0052); the order itself moves through `orders`.
      const orderId = str(row.order_id);
      return orderId ? [['order-status-history', orderId]] : [['order-status-history']];
    }
    case 'feedback':
      return [['admin-feedback'], ['admin-feedback-count']];
    case 'lab_reviews': {
      // 0044: the lab's page, the doctor's order card, the public list and
      // every place the average shows.
      const labId = str(row.lab_id);
      const orderId = str(row.order_id);
      return [
        ...MARKETPLACE,
        ['admin-reviews'],
        ['admin-review-reports'],
        ...(labId
          ? [
              ['lab-reviews', labId],
              ['public-lab-reviews', labId],
              ['public-lab', labId],
            ]
          : [['lab-reviews']]),
        ...(orderId ? [['order-review', orderId]] : []),
      ];
    }
    case 'lab_review_reports':
      // A report carries only its review's id: refresh the lab's page whole.
      return [['admin-review-reports'], ['admin-reviews'], ['nav-alerts'], ['lab-reviews']];
    case 'order_trash':
      // RLS delivers only the subscriber's own side's rows.
      return keysForTrashChange(row.side, str(row.order_id));
  }
}

/** A notification kind that also means "this list changed". */
export function keysForNotification(kind: string): QueryKey[] {
  switch (kind) {
    case 'doctor_left':
      // Leaving deletes a clinic_memberships row, and realtime delivers no
      // DELETE: this notification is how the clinic's roster hears of it.
      return [['clinic-doctors'], ['clinic-orders'], ['clinic-order-count'], ['nav-alerts']];
    case 'clinic_invite':
      return [['my-clinic-invites']];
    default:
      return [];
  }
}

/** Every prefix above, for the catch-up after a reconnect. */
export const ALL_LIVE_KEYS: QueryKey[] = (() => {
  const seen = new Map<string, QueryKey>();
  const add = (k: QueryKey) => seen.set(JSON.stringify(k), k);
  const tables: LiveTable[] = [
    'orders',
    'order_clarifications',
    'order_files',
    'labs',
    'lab_services',
    'lab_forms',
    'clinic_doctor_invites',
    'feedback',
    'lab_reviews',
    'lab_review_reports',
    'clinic_memberships',
    'order_status_history',
    'order_trash',
  ];
  // A row with no ids yields the list keys; the per-id keys are covered by
  // their first element as a prefix.
  for (const table of tables) keysForRow(table, {}).forEach(add);
  [
    ['lab-order'],
    ['order'],
    ['clinic-order'],
    ['order-edits'],
    ['order-answers'],
    ['clinic-order-answers'],
    ['order-lineage'],
    ['order-clarifications'],
    ['order-files'],
    ['order-invoice'],
    ['public-lab'],
    ['public-lab-services'],
    ['admin-lab'],
    ['lab-price-lists'],
    ['lab-services-with-forms'],
    ['clinic-doctors'],
    ['public-lab-reviews'],
    ['order-review'],
  ].forEach(add);
  return [...seen.values()];
})();

/**
 * Invalidates keys at most once per `delay` each: one lab save fires several
 * row events (the order, then its clarification, then a file), and one
 * refetch per key is enough.
 */
export function createDebouncedInvalidator(queryClient: QueryClient, delay = 300) {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const invalidate = (keys: QueryKey[]) => {
    for (const key of keys) {
      const id = JSON.stringify(key);
      if (timers.has(id)) continue;
      timers.set(
        id,
        setTimeout(() => {
          timers.delete(id);
          void queryClient.invalidateQueries({ queryKey: key });
        }, delay),
      );
    }
  };
  const cancel = () => {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
  };
  return { invalidate, cancel };
}
