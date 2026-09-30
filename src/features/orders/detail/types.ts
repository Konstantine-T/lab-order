import type { OrderRow } from '@/types/database';

/**
 * The order row as both detail screens load it.
 *
 * `labs` is the live row, not the snapshot: you call or email a lab at the
 * number and address it has now. Its name, on the other hand, is read from
 * `lab_snapshot` like every other historical fact.
 */
export type DetailOrder = OrderRow & {
  patients: {
    first_name: string;
    last_name: string;
    date_of_birth: string | null;
    gender?: string | null;
  } | null;
  labs: {
    contact_email: string | null;
    contact_phone?: string | null;
    logo_url?: string | null;
  } | null;
};

/**
 * The select behind `DetailOrder`. A superset of what the edit page asks for
 * under the same `['order', id]` key, so whichever screen fills that cache
 * first leaves the other everything it reads.
 */
export const DETAIL_ORDER_SELECT =
  '*, patients(first_name, last_name, date_of_birth, gender), labs(contact_email, contact_phone, logo_url)';

export const labNameOf = (order: OrderRow) =>
  (order.lab_snapshot as { public_name?: string } | null)?.public_name ?? '';

export const serviceNameOf = (order: OrderRow) =>
  (order.service_snapshot as { name?: string } | null)?.name ?? '';

export const patientNameOf = (order: DetailOrder) =>
  order.patients ? `${order.patients.first_name} ${order.patients.last_name}`.trim() : '';

export const isTerminal = (order: OrderRow) =>
  order.status === 'COMPLETED' || order.status === 'CANCELLED';
