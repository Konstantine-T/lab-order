import type { QueryClient } from '@tanstack/react-query';
import type { LabReviewReportRow, LabReviewRow } from '@/types/database';

/*
 * Query keys of the reviews feature (0044), and what a review write makes
 * stale. The realtime map (liveQueries.ts) uses the same keys.
 *
 *   ['order-review', orderId]        the doctor's own review of one order
 *   ['lab-reviews', labId]           the lab's /lab/reviews page
 *   ['public-lab-reviews', labId]    the public list on the profile
 *   ['public-lab', labId, 'rating']  the profile's summary numbers
 *   ['admin-reviews'], ['admin-review-reports']   /admin/reviews
 */

/** A review row as the lab's page reads it: its order code and reports with it. */
export type LabPageReview = LabReviewRow & {
  orders: { order_code: string } | null;
  lab_review_reports: Pick<
    LabReviewReportRow,
    'id' | 'reason' | 'created_at' | 'resolved_at' | 'resolution'
  >[];
};

/** Columns of `lab_reviews` every signed-in reader asks for (never `*`). */
export const REVIEW_COLUMNS =
  'id, order_id, lab_id, doctor_id, rating, comment, reviewer_display, service_name, ' +
  'service_translations, lab_reply, lab_replied_at, hidden_at, hidden_by_user_id, hidden_note, ' +
  'created_at, updated_at';

/** "Edited": moved by the doctor more than a minute after writing (0044). */
export function isEdited(r: Pick<LabReviewRow, 'created_at' | 'updated_at'>): boolean {
  return new Date(r.updated_at).getTime() > new Date(r.created_at).getTime() + 60_000;
}

/** The report a lab sees the state of: the open one, else the latest. */
export function currentReport<T extends Pick<LabReviewReportRow, 'created_at' | 'resolved_at'>>(
  reports: T[] | null | undefined,
): T | null {
  if (!reports?.length) return null;
  const open = reports.find((r) => !r.resolved_at);
  if (open) return open;
  return [...reports].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
}

/** Everything a review write can move, for every role that may be looking. */
export function invalidateReviews(qc: QueryClient, ids: { orderId?: string; labId?: string }) {
  const keys: unknown[][] = [
    ['lab-reviews'],
    ['public-lab-reviews'],
    ['marketplace-labs'],
    ['landing-labs'],
    ['admin-reviews'],
    ['admin-review-reports'],
    ['nav-alerts'],
  ];
  if (ids.orderId) keys.push(['order-review', ids.orderId]);
  else keys.push(['order-review']);
  if (ids.labId) keys.push(['public-lab', ids.labId]);
  for (const queryKey of keys) void qc.invalidateQueries({ queryKey });
}
