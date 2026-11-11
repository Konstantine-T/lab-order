import type { OrderRow } from '@/types/database';
import { ORDER_TRASH_EMBED } from '@/features/orders/trash/trashFilter';
import type { ListOrderRow } from '@/features/orders/list/orderListModel';
import { DESTINATION_SELECT, type DestinationColumns } from './queueFilters';

/**
 * One lab order row, the same on every lab orders page (the queue, edited
 * orders, a project): what the list row and the card both draw, so the two
 * views of a page read one shape. The patient is the order's own label
 * (0057); the lab never reads `patients`.
 */
export const LAB_ORDER_LIST_SELECT =
  'id, order_code, doctor_id, lab_id, buyer_lab_id, patient_id, patient_reference, patient_label, ' +
  'status, payment_status, generated_total, final_total, final_price_note, ' +
  'requested_due_date, confirmed_due_date, requested_due_time, confirmed_due_time, ' +
  'created_at, completed_at, cancelled_at, service_snapshot, doctor_snapshot, ' +
  'has_unreviewed_edits, edit_count, last_edited_at, continues_order_id, ' +
  `${DESTINATION_SELECT}, ` +
  'lab_services(name), order_clarifications(answered_at, resolved_by_edit_at), ' +
  ORDER_TRASH_EMBED;

export type LabListRow = OrderRow &
  DestinationColumns & {
    lab_services: { name: string } | null;
    service_snapshot: { name?: string } | null;
    order_clarifications: { answered_at: string | null; resolved_by_edit_at: string | null }[];
  };

/**
 * The doctor answered and the case is still parked in NEEDS_CLARIFICATION —
 * i.e. it is waiting on the lab, not on the doctor (0029).
 */
export const isAnswered = (row: Pick<LabListRow, 'status' | 'order_clarifications'>) =>
  row.status === 'NEEDS_CLARIFICATION' &&
  row.order_clarifications.length > 0 &&
  row.order_clarifications.every(
    // Resolved-by-edit counts as closed too, or this highlight never lights
    // up again on an order that once carried an edit request.
    (c) => c.answered_at !== null || c.resolved_by_edit_at !== null,
  );

/** The service, by the name the lab gave it, else the order's snapshot. */
export const labServiceName = (row: Pick<LabListRow, 'lab_services' | 'service_snapshot'>) =>
  row.lab_services?.name ?? row.service_snapshot?.name ?? '';

/**
 * The lab row in the shape OrderCard reads. No questions (the lab's card does
 * not quote its own), no patient record (the label stands in, 0057).
 */
export function labCardRow(row: LabListRow): ListOrderRow {
  return {
    ...row,
    service_name: labServiceName(row) || null,
    lab_name: null,
    labs: null,
    patients: null,
    order_clarifications: [],
  };
}
